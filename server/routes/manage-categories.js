const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const multer = require("multer");
const upload = multer({ dest: "uploads/", limits: { fileSize: 3 * 1024 * 1024 } });
const cloudinary = require("cloudinary").v2;
const verifyAdmin = require("../middlewares/verifyAdmin");
const { encryptData } = require("../utils/cryptoHelper");

const fs = require("fs");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

async function refreshProducts(uid) {
  // Send a request to update products
  await fetch("https://manga-store.online/update-products", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uid: uid }),
  });
}

// * Get the uid for user
router.get("/get-uid", verifyAdmin, async (req, res) => {
  try {
    const session = req.cookies.session;
    if (!session) {
      return res.status(400).json({ success: false, message: "Session cookie not found." });
    }
    const userRecord = await admin.auth().verifySessionCookie(session, true);
    res.status(200).json({ success: true, uid: userRecord.uid });
  } catch (error) {
    console.error("Error getting user UID:", error);
    res.status(500).json({ success: false, message: "Failed to get user UID." });
  }
});

// ? Categories with Subcategories
router.get("/categories", verifyAdmin, async (req, res) => {
  try {
    const categoriesRef = await db.collection("categories").get();
    const categories = [];

    // Get all categories
    for (const categoryDoc of categoriesRef.docs) {
      const categoryId = categoryDoc.id;
      const { name, iconUrl } = categoryDoc.data();

      // Get subcategories for this category
      const subcategoriesRef = await db.collection("categories").doc(categoryId).collection("subcategories").get();
      const subcategories = [];

      subcategoriesRef.forEach((subcatDoc) => {
        subcategories.push({
          id: subcatDoc.id,
          name: subcatDoc.data().name,
        });
      });

      categories.push({
        name: name,
        id: categoryId,
        iconUrl: iconUrl || null,
        subcategories: subcategories,
      });
    }

    await refreshProducts(req.uid);

    res.render("products_categories/manage-categories", { categories });
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.status(500).json({ success: false, message: "Failed to fetch categories." });
  }
});

// ? Add category
router.post("/add-category", upload.single("icon"), verifyAdmin, async (req, res) => {
  const { category, iconUrl } = req.body;
  if (!category || typeof category !== "string" || category.trim() === "") {
    return res.status(400).json({ success: false, message: "Category name is required and must be a valid string." });
  }
  const categoryName = category.trim();
  const categoriesRef = db.collection("categories");
  try {
    const querySnapshot = await categoriesRef.where("name", "==", categoryName).get();
    if (querySnapshot.empty) {
      const payload = {
        name: categoryName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      // Prefer uploaded file over iconUrl if both are provided
      if (req.file) {
        try {
          const result = await cloudinary.uploader.upload(req.file.path, {
            folder: "categories",
          });
          payload.iconUrl = result.secure_url;
        } finally {
          // cleanup temp file
          try { fs.unlinkSync(req.file.path); } catch {}
        }
      } else if (iconUrl && typeof iconUrl === "string" && iconUrl.trim()) {
        payload.iconUrl = iconUrl.trim();
      }
      const docRef = await categoriesRef.add(payload);
      await refreshProducts(req.uid);
      return res.status(200).json({
        success: true,
        message: `Category "${categoryName}" added successfully.`,
        id: docRef.id,
        categoryName: categoryName,
        iconUrl: payload.iconUrl || null,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Category "${categoryName}" already exists.`,
      });
    }
  } catch (error) {
    console.error("Error adding category:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to add category "${categoryName}". Please try again later.`,
      error: error.message,
    });
  }
});

// ? Add subcategory
router.post("/add-subcategory", verifyAdmin, async (req, res) => {
  const { categoryId, subcategoryName } = req.body;

  if (!categoryId || !subcategoryName || typeof subcategoryName !== "string" || subcategoryName.trim() === "") {
    return res.status(400).json({
      success: false,
      message: "Category ID and subcategory name are required. Subcategory name must be a valid string.",
    });
  }

  const trimmedSubcategoryName = subcategoryName.trim();
  const categoryRef = db.collection("categories").doc(categoryId);

  try {
    // Check if category exists
    const categoryDoc = await categoryRef.get();
    if (!categoryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Parent category not found.",
      });
    }

    // Check if subcategory already exists
    const subcategoriesRef = categoryRef.collection("subcategories");
    const querySnapshot = await subcategoriesRef.where("name", "==", trimmedSubcategoryName).get();

    if (querySnapshot.empty) {
      const docRef = await subcategoriesRef.add({
        name: trimmedSubcategoryName,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      await refreshProducts(req.uid);
      return res.status(200).json({
        success: true,
        message: `Subcategory "${trimmedSubcategoryName}" added successfully.`,
        id: docRef.id,
        subcategoryName: trimmedSubcategoryName,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Subcategory "${trimmedSubcategoryName}" already exists in this category.`,
      });
    }
  } catch (error) {
    console.error("Error adding subcategory:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to add subcategory "${trimmedSubcategoryName}". Please try again later.`,
      error: error.message,
    });
  }
});

// ? Delete category
router.delete("/delete-category", verifyAdmin, async (req, res) => {
  try {
    const { categoryId } = req.body;
    if (!categoryId) return res.status(400).json({ success: false, message: "Category ID is required." });

    const categoryRef = db.collection("categories").doc(categoryId);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) return res.status(404).json({ success: false, message: "Category not found." });

    // Get all products in this category
    const productsSnapshot = await db.collection("products").where("categoryId", "==", categoryDoc.data().name).get();

    // Get all subcategories
    const subcategoriesSnapshot = await categoryRef.collection("subcategories").get();

    // Get all products in subcategories
    const subcategoryProducts = [];
    for (const subcatDoc of subcategoriesSnapshot.docs) {
      const subcatProductsSnapshot = await db
        .collection("products")
        .where("categoryId", "==", categoryDoc.data().name)
        .where("subcategoryId", "==", subcatDoc.id)
        .get();

      subcatProductsSnapshot.forEach((doc) => {
        subcategoryProducts.push(doc.ref);
      });
    }

    // Delete everything in a batch
    const batch = db.batch();

    // Delete products in category
    productsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete products in subcategories
    subcategoryProducts.forEach((ref) => {
      batch.delete(ref);
    });

    // Delete subcategories
    subcategoriesSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the category itself
    batch.delete(categoryRef);

    await batch.commit();

    await refreshProducts(req.uid);

    return res.status(200).json({
      success: true,
      message: "Category, subcategories, and associated products deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ success: false, message: `Failed to delete category: ${error.message}` });
  }
});

// ? Delete subcategory
router.delete("/delete-subcategory", verifyAdmin, async (req, res) => {
  try {
    const { categoryId, subcategoryId } = req.body;

    if (!categoryId || !subcategoryId) {
      return res.status(400).json({
        success: false,
        message: "Category ID and Subcategory ID are required.",
      });
    }

    const categoryRef = db.collection("categories").doc(categoryId);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const subcategoryRef = categoryRef.collection("subcategories").doc(subcategoryId);
    const subcategoryDoc = await subcategoryRef.get();

    if (!subcategoryDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Subcategory not found.",
      });
    }

    // Get all products in this subcategory
    const productsSnapshot = await db
      .collection("products")
      .where("categoryId", "==", categoryDoc.data().name)
      .where("subcategoryId", "==", subcategoryId)
      .get();

    // Delete everything in a batch
    const batch = db.batch();

    // Delete products in subcategory
    productsSnapshot.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete the subcategory
    batch.delete(subcategoryRef);

    await batch.commit();

    await refreshProducts(req.uid);

    return res.status(200).json({
      success: true,
      message: "Subcategory and associated products deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting subcategory:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to delete subcategory: ${error.message}`,
    });
  }
});

// ? Edit category
router.post("/edit-cat/:categoryId/:newName", verifyAdmin, async (req, res) => {
  const { categoryId, newName } = req.params;
  try {
    if (!categoryId || !newName) {
      return res.status(400).json({ error: "categoryId and newName are required" });
    }
    const doc = await db.collection("categories").doc(categoryId).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "Category not found" });
    }

    const oldName = doc.data().name;

    const updatedCategory = {
      name: newName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Update category name
    await db.collection("categories").doc(categoryId).update(updatedCategory);

    // Update all products with this category
    const productsSnapshot = await db.collection("products").where("categoryId", "==", oldName).get();

    const batch = db.batch();
    productsSnapshot.forEach((doc) => {
      batch.update(doc.ref, { categoryId: newName });
    });

    await batch.commit();

    await refreshProducts(req.uid);

    return res.status(200).json({ message: "Category name updated successfully" });
  } catch (error) {
    console.error("Error updating category:", error);
    return res.status(500).json({ error: "Failed to update category" });
  }
});

// ? Edit subcategory
router.post("/edit-subcategory", verifyAdmin, async (req, res) => {
  const { categoryId, subcategoryId, newName } = req.body;

  try {
    if (!categoryId || !subcategoryId || !newName) {
      return res.status(400).json({
        success: false,
        error: "categoryId, subcategoryId, and newName are required",
      });
    }

    const categoryRef = db.collection("categories").doc(categoryId);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Category not found",
      });
    }

    const subcategoryRef = categoryRef.collection("subcategories").doc(subcategoryId);
    const subcategoryDoc = await subcategoryRef.get();

    if (!subcategoryDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Subcategory not found",
      });
    }

    const updatedSubcategory = {
      name: newName,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Update subcategory name
    await subcategoryRef.update(updatedSubcategory);

    // Update all products with this subcategory
    const productsSnapshot = await db
      .collection("products")
      .where("categoryId", "==", categoryDoc.data().name)
      .where("subcategoryId", "==", subcategoryId)
      .get();

    const batch = db.batch();
    productsSnapshot.forEach((doc) => {
      batch.update(doc.ref, { subcategoryName: newName });
    });

    await batch.commit();

    await refreshProducts(req.uid);

    return res.status(200).json({
      success: true,
      message: "Subcategory name updated successfully",
    });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update subcategory",
    });
  }
});

// ? Get all categories
router.get("/view-category/:id", verifyAdmin, async (req, res) => {
  const categoryId = req.params.id;
  try {
    const categoryDoc = await db.collection("categories").doc(categoryId).get();
    const categoryName = categoryDoc.data().name;
    if (!categoryDoc.exists) {
      return res.status(404).json({ error: "Category not found." });
    }
    const productsSnapshot = await db.collection("products").where("categoryId", "==", categoryName).get();
    if (productsSnapshot.empty) {
      return res.status(200).json({ msg: "No products available in this category." });
    }
    const products = [];
    productsSnapshot.docs.forEach((doc) => {
      const productData = doc.data();
      if (productData.createdAt) {
        const date = productData.createdAt.toDate();
        productData.createdAt = formatDate(date);
      }
      if (productData.updatedAt) {
        const date = productData.updatedAt.toDate();
        productData.updatedAt = formatDate(date);
      }
      products.push({ id: doc.id, ...productData });
    });
    res.status(200).json({
      category: categoryName,
      products: products,
    });
  } catch (err) {
    console.error("Error fetching category data:", err);
    res.status(500).json({
      error: "Failed to fetch category data.",
      errorMessage: err.message,
    });
  }
});

// ? View subcategory
router.get("/view-subcategory/:categoryId/:subcategoryId", verifyAdmin, async (req, res) => {
  const { categoryId, subcategoryId } = req.params;

  try {
    const categoryRef = db.collection("categories").doc(categoryId);
    const categoryDoc = await categoryRef.get();

    if (!categoryDoc.exists) {
      return res.status(404).json({ error: "Category not found." });
    }

    const categoryName = categoryDoc.data().name;

    const subcategoryRef = categoryRef.collection("subcategories").doc(subcategoryId);
    const subcategoryDoc = await subcategoryRef.get();

    if (!subcategoryDoc.exists) {
      return res.status(404).json({ error: "Subcategory not found." });
    }

    const subcategoryName = subcategoryDoc.data().name;

    // Get products in this subcategory
    const productsSnapshot = await db
      .collection("products")
      .where("categoryId", "==", categoryName)
      .where("subcategoryId", "==", subcategoryId)
      .get();

    if (productsSnapshot.empty) {
      return res.status(200).json({
        subcategory: subcategoryName,
        products: [],
      });
    }

    const products = [];
    productsSnapshot.docs.forEach((doc) => {
      const productData = doc.data();
      if (productData.createdAt) {
        const date = productData.createdAt.toDate();
        productData.createdAt = formatDate(date);
      }
      if (productData.updatedAt) {
        const date = productData.updatedAt.toDate();
        productData.updatedAt = formatDate(date);
      }
      products.push({ id: doc.id, ...productData });
    });

    res.status(200).json({
      subcategory: subcategoryName,
      products: products,
    });
  } catch (err) {
    console.error("Error fetching subcategory data:", err);
    res.status(500).json({
      error: "Failed to fetch subcategory data.",
      errorMessage: err.message,
    });
  }
});

// ? Get all products inside a category
router.post("/products", verifyAdmin, async (req, res) => {
  const docs = (await db.collection("products").get()).docs;
  const data = docs.map((doc) => ({
    id: doc.id,
    data: doc.data().data,
  }));
  res.send({ products: data });
});

// ! products
router.get("/products", verifyAdmin, async (req, res) => {
  try {
    const docs = (await db.collection("products").get()).docs;
    const dataToSend = docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Get categories with subcategories
    const categories = [];
    const categoriesDocs = (await db.collection("categories").get()).docs;

    for (const categoryDoc of categoriesDocs) {
      const categoryId = categoryDoc.id;
      const categoryName = categoryDoc.data().name;

      // Get subcategories for this category
      const subcategoriesRef = await db.collection("categories").doc(categoryId).collection("subcategories").get();
      const subcategories = [];

      subcategoriesRef.forEach((subcatDoc) => {
        subcategories.push({
          id: subcatDoc.id,
          name: subcatDoc.data().name,
        });
      });

      categories.push({
        id: categoryId,
        name: categoryName,
        subcategories: subcategories,
      });
    }

    res.render("products_categories/manage-prods", { products: dataToSend, categories });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send({ error: "Failed to fetch products." });
  }
});

// ! View product
router.get("/view-product/:prodId", verifyAdmin, async (req, res) => {
  try {
    const prodId = req.params.prodId;
    const docRef = await db.collection("products").doc(prodId).get();
    const product = { id: prodId, ...docRef.data() };

    // Get categories with subcategories
    const categories = [];
    const categoriesDocs = (await db.collection("categories").get()).docs;

    for (const categoryDoc of categoriesDocs) {
      const categoryId = categoryDoc.id;
      const categoryName = categoryDoc.data().name;

      // Get subcategories for this category
      const subcategoriesRef = await db.collection("categories").doc(categoryId).collection("subcategories").get();
      const subcategories = [];

      subcategoriesRef.forEach((subcatDoc) => {
        subcategories.push({
          id: subcatDoc.id,
          name: subcatDoc.data().name,
        });
      });

      categories.push({
        id: categoryId,
        name: categoryName,
        subcategories: subcategories,
      });
    }

    // Get home sections (active and inactive to allow reassignment) and mark current membership
    let sections = [];
    try {
      const snap = await db
        .collection("home-sections")
        .orderBy("order", "asc")
        .get()
        .catch(async () => {
          const s2 = await db.collection("home-sections").get();
          return { docs: s2.docs };
        });
      sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      sections = [];
    }

    if (!docRef.exists) {
      return res.status(404).json({ error: "Product not found." });
    }
    res.render("products_categories/view-product", { product, categories, sections });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ error: "Failed to fetch product." });
  }
});

// ! Add product page
router.get("/add-product", verifyAdmin, async (req, res) => {
  // Get categories with subcategories
  const categories = [];
  const categoriesDocs = (await db.collection("categories").get()).docs;

  for (const categoryDoc of categoriesDocs) {
    const categoryId = categoryDoc.id;
    const categoryName = categoryDoc.data().name;

    // Get subcategories for this category
    const subcategoriesRef = await db.collection("categories").doc(categoryId).collection("subcategories").get();
    const subcategories = [];

    subcategoriesRef.forEach((subcatDoc) => {
      subcategories.push({
        id: subcatDoc.id,
        name: subcatDoc.data().name,
      });
    });

    categories.push({
      id: categoryId,
      name: categoryName,
      subcategories: subcategories,
    });
  }

  // Get active home sections
  let sections = [];
  try {
    const snap = await db
      .collection("home-sections")
      .where("isActive", "==", true)
      .orderBy("order", "asc")
      .get()
      .catch(async () => {
        const s2 = await db.collection("home-sections").where("isActive", "==", true).get();
        return { docs: s2.docs };
      });
    sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    sections = [];
  }

  res.render("products_categories/add-product", { categories, sections });
});

// ! Add product
router.post("/product/add", upload.single("image"), verifyAdmin, async (req, res) => {
  try {
    const { name, stock, isFeatured, price, categoryId, subcategoryId, description, details, label } = req.body;
    const image = req.file;

    // Validate required fields (price is now optional)
    if (!name || !stock || !categoryId || !description) {
      return res.status(400).json({ success: false, message: "All required fields must be filled." });
    }

    let imageUrl = null;
    if (image) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "products",
      });
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting temporary file:", err);
      });
      imageUrl = result.secure_url;
    }

    // Get category name
    const categoryDoc = await db.collection("categories").doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }
    const categoryName = categoryDoc.data().name;

    // Get subcategory name if provided
    let subcategoryName = null;
    if (subcategoryId) {
      const subcategoryDoc = await db
        .collection("categories")
        .doc(categoryId)
        .collection("subcategories")
        .doc(subcategoryId)
        .get();
      if (subcategoryDoc.exists) {
        subcategoryName = subcategoryDoc.data().name;
      }
    }

    // Parse account types (optional)
    let accountTypes = [];
    try {
      if (req.body.accountTypes) {
        const parsed = JSON.parse(req.body.accountTypes || "[]");
        if (Array.isArray(parsed)) {
          accountTypes = parsed
            .filter((o) => o && typeof o.label === "string" && o.label.trim())
            .map((o) => ({
              label: o.label.trim(),
              months: Number.isFinite(parseInt(o.months, 10)) ? parseInt(o.months, 10) : 0,
              price: Number.parseFloat(o.price || 0),
            }));
        }
      }
    } catch {}

    // Determine base price: first account type price if provided, else fallback to body price or 0
    const basePrice = (Array.isArray(accountTypes) && accountTypes.length > 0)
      ? Number.parseFloat(accountTypes[0].price || 0)
      : Number.parseFloat(price || 0);

    // Prepare key-requirement fields
    const requireKeyFlag = (() => {
      const v = req.body.requireKey;
      if (typeof v === "string") return v === "true" || v === "on" || v === "1";
      if (typeof v === "boolean") return v;
      return false;
    })();
    const productKeyEncrypted = (() => {
      const k = (req.body.productKey || "").toString();
      if (!requireKeyFlag || !k.trim()) return null;
      try { return encryptData(k.trim()); } catch { return null; }
    })();

    // Parse SEO fields (optional)
    const seoTitle = (req.body.seoTitle || "").toString().trim() || null;
    const seoDescription = (req.body.seoDescription || "").toString().trim() || null;
    const seoKeywords = (() => {
      const v = (req.body.seoKeywords || "").toString();
      const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
      return arr.length ? arr : null;
    })();

    const product = {
      images: imageUrl,
      name: name,
      stock: Number.parseInt(stock, 10),
      // Since the Featured field was removed from the UI, default new products to featured
      isFeatured: true,
      price: Number.isFinite(basePrice) ? Number(basePrice).toFixed(2) : (0).toFixed(2),
      categoryId: categoryName,
      subcategoryId: subcategoryId || null,
      subcategoryName: subcategoryName || null,
      description: description,
      details: (() => { try { return JSON.parse(details || "[]"); } catch { return []; } })(),
      label: label || null,
      accountTypes: accountTypes,
      requireKey: requireKeyFlag,
      ...(productKeyEncrypted !== null ? { productKeyEncrypted } : {}),
      ...(seoTitle ? { seoTitle } : {}),
      ...(seoDescription ? { seoDescription } : {}),
      ...(seoKeywords ? { seoKeywords } : {}),
    };

    // Create product
    const docRef = await db.collection("products").add(product);

    // Optional: assign product to selected home sections
    let homeSectionIds = req.body["homeSectionIds[]"] ?? req.body.homeSectionIds;
    if (typeof homeSectionIds === "string") homeSectionIds = [homeSectionIds];
    if (Array.isArray(homeSectionIds) && homeSectionIds.length > 0) {
      const batch = db.batch();
      homeSectionIds.forEach((sid) => {
        const sref = db.collection("home-sections").doc(sid);
        batch.update(sref, { productIds: admin.firestore.FieldValue.arrayUnion(docRef.id) });
      });
      await batch.commit();
    }

    await refreshProducts(req.uid);
    res.status(201).json({
      success: true,
      message: "Product added successfully!",
      productId: docRef.id,
    });
  } catch (error) {
    console.error("Error adding product:", error);
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ success: false, message: "File size exceeds the limit (3MB)." });
    }
    res.status(500).json({ success: false, message: "Failed to add product" });
  }
});

// ! Delete product
router.delete("/product/delete/:prodId", verifyAdmin, async (req, res) => {
  try {
    const prodId = req.params.prodId;
    if (!prodId) return res.status(400).json({ success: false, message: "Product ID is required." });
    const productRef = db.collection("products").doc(prodId);
    const productDoc = await productRef.get();
    if (!productDoc.exists) return res.status(404).json({ success: false, message: "Product not found." });
    await productRef.delete();
    await refreshProducts(req.uid);
    return res.json({ success: true, message: "product deleted successfully" });
  } catch (err) {
    console.error("Error deleting product:", err);
    return res.status(500).json({ success: false, message: `Failed to delete product: ${err.message}` });
  }
});

// ! Get product
router.post("/get/product/:prodId", verifyAdmin, async (req, res) => {
  try {
    const productId = req.params.prodId;
    const docRef = await db.collection("products").doc(productId).get();
    const product = docRef.data();
    await refreshProducts(req.uid);
    return res.json({ success: true, product: product });
  } catch (err) {
    console.error("Error deleting product:", err);
    return res.status(500).json({ success: false, message: `Failed to delete product: ${err.message}` });
  }
});

// ! Edit product
router.post("/edit/product/:prodId", upload.single("image"), verifyAdmin, async (req, res) => {
  try {
    // Validate required fields
    const requiredFields = ["name", "price", "stock", "categoryId"];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ error: `${field} is required` });
      }
    }

    // Process details
    let details = [];
    try {
      details = JSON.parse(req.body.details || "[]");
    } catch (error) {
      return res.status(400).json({ error: "Invalid details format" });
    }

    // Clean and validate details
    const cleanDetails = details
      .filter((item) => {
        const keys = Object.keys(item);
        return keys.length > 0 && item[keys[0]];
      })
      .map((item) => {
        const key = Object.keys(item)[0];
        return { [key]: item[key] };
      });

    let result;
    if (req.file) {
      result = await cloudinary.uploader.upload(req.file.path, {
        folder: "products",
      });
      fs.unlink(req.file.path, (err) => {
        if (err) console.error("Error deleting temporary file:", err);
      });
    }

    // Get category name
    const categoryDoc = await db.collection("categories").doc(req.body.categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).json({ success: false, message: "Category not found." });
    }
    const categoryName = categoryDoc.data().name;

    // Get subcategory name if provided
    let subcategoryName = null;
    if (req.body.subcategoryId) {
      const subcategoryDoc = await db
        .collection("categories")
        .doc(req.body.categoryId)
        .collection("subcategories")
        .doc(req.body.subcategoryId)
        .get();
      if (subcategoryDoc.exists) {
        subcategoryName = subcategoryDoc.data().name;
      }
    }

    // Prepare update data
    // Parse account types (optional)
    let accountTypes = [];
    try {
      if (req.body.accountTypes) {
        const parsed = JSON.parse(req.body.accountTypes || "[]");
        if (Array.isArray(parsed)) {
          accountTypes = parsed
            .filter((o) => o && typeof o.label === "string" && o.label.trim())
            .map((o) => ({
              label: o.label.trim(),
              months: Number.isFinite(parseInt(o.months, 10)) ? parseInt(o.months, 10) : 0,
              price: Number.parseFloat(o.price || 0),
            }));
        }
      }
    } catch {}

    // Prepare key-requirement fields for update
    const requireKeyFlag = (() => {
      const v = req.body.requireKey;
      if (typeof v === "string") return v === "true" || v === "on" || v === "1";
      if (typeof v === "boolean") return v;
      return false;
    })();
    const productKeyEncrypted = (() => {
      const k = (req.body.productKey || "").toString();
      if (!requireKeyFlag) {
        // If turning off, clear stored key
        return null;
      }
      if (!k.trim()) {
        // If not provided on edit and was previously set, keep existing by not including field below
        return undefined;
      }
      try { return encryptData(k.trim()); } catch { return undefined; }
    })();

    // Optional SEO fields on update
    const updSeoTitle = (req.body.seoTitle || "").toString().trim();
    const updSeoDescription = (req.body.seoDescription || "").toString().trim();
    const updSeoKeywords = (() => {
      const v = (req.body.seoKeywords || "").toString();
      const arr = v.split(",").map((s) => s.trim()).filter(Boolean);
      return arr;
    })();

    const updatedProduct = {
      name: req.body.name,
      price: Number.parseFloat(req.body.price),
      stock: Number.parseInt(req.body.stock, 10),
      // Do not override isFeatured since the field is no longer present in the form
      categoryId: categoryName,
      subcategoryId: req.body.subcategoryId || null,
      subcategoryName: subcategoryName || null,
      description: req.body.description || "",
      details: cleanDetails,
      images: req.file ? result.secure_url : req.body.existingImage,
      label: req.body.label || null,
      accountTypes: accountTypes,
      requireKey: requireKeyFlag,
    };

    // Conditionally set productKeyEncrypted on update
    if (productKeyEncrypted !== undefined) {
      updatedProduct.productKeyEncrypted = productKeyEncrypted;
    }

    // Conditionally include SEO fields
    if (updSeoTitle) updatedProduct.seoTitle = updSeoTitle;
    if (updSeoDescription) updatedProduct.seoDescription = updSeoDescription;
    if (Array.isArray(updSeoKeywords) && updSeoKeywords.length) updatedProduct.seoKeywords = updSeoKeywords;

    const productRef = db.collection("products").doc(req.params.prodId);
    await productRef.update(updatedProduct);

    // Update home section assignments (optional)
    let selectedIds = req.body["homeSectionIds[]"] ?? req.body.homeSectionIds;
    if (typeof selectedIds === "string") selectedIds = [selectedIds];
    if (!Array.isArray(selectedIds)) selectedIds = [];

    // Fetch all sections and update membership for this product
    const sectionsSnap = await db.collection("home-sections").get();
    const batch = db.batch();
    sectionsSnap.forEach((doc) => {
      const sref = doc.ref;
      const isSelected = selectedIds.includes(doc.id);
      if (isSelected) {
        batch.update(sref, { productIds: admin.firestore.FieldValue.arrayUnion(req.params.prodId) });
      } else {
        batch.update(sref, { productIds: admin.firestore.FieldValue.arrayRemove(req.params.prodId) });
      }
    });
    await batch.commit();

    await refreshProducts(req.uid);

    res.json({ success: true, message: "Product updated successfully" });
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: "Failed to update product" });
  }
});

// ! Get product
router.get("/get/product", verifyAdmin, async (req, res) => {
  const { prodId } = req.query;
  // console.log("prodId:", prodId);
  if (!prodId) {
    return res.status(400).json({ success: false, message: "prodId is required." });
  }
  try {
    const productRef = db.collection("products").doc(prodId);
    const productSnapshot = await productRef.get();
    if (!productSnapshot.exists) {
      return res.status(404).json({ success: false, message: "Product not found." });
    }
    const product = productSnapshot.data();
    res.status(200).json({ success: true, product });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).json({ success: false, message: "An error occurred while fetching the product." });
  }
});

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  let hours = date.getHours();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours > 12 ? (hours = hours - 12) : hours == 0 ? (hours = hours + 12) : hours;
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  hours = hours % 12 || 12; // Convert to 12-hour format
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${ampm}`;
}

module.exports = router;
