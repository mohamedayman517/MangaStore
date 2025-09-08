const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const { Timestamp } = admin.firestore;
const verifyAdmin = require("../middlewares/verifyAdmin");
const { decryptData, encryptData } = require("../utils/cryptoHelper");
const { getCoupouns } = require("../utils/coupon-cached");

router.get("/coupons", verifyAdmin, async (req, res) => {
  try {
    const collDocs = (await db.collection("coupons").get()).docs;
    const coupons = [];
    collDocs.forEach((doc) => {
      coupons.push({
        id: doc.id,
        name: decryptData(doc.data().name),
        isValid: doc.data().isValid,
        expired: doc.data().expired,
        startDate: doc.data().startDate,
        amount: decryptData(doc.data().amount),
        type: decryptData(doc.data().type),
      });
    });
    res.render("coupon/coupons", { coupons: coupons });
  } catch (error) {
    console.error("Error fetching coupons:", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// Create a coupon assigned to a specific product by its ID (admin only)
router.post("/add/product-coupon", verifyAdmin, async (req, res) => {
  const { name, type, amount, expiryDate, productId } = req.body;

  try {
    if (!productId || typeof productId !== "string") {
      return res.status(400).json({ error: "Missing or invalid productId" });
    }

    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      throw new Error("Invalid expiryDate format. Must be a valid date string.");
    }

    const parsedExpiryDate = Timestamp.fromDate(new Date(expiryDate));
    const currentDate = Timestamp.now();
    const couponRef = admin.firestore().collection("coupons").doc();

    const doc = {
      name: encryptData(name),
      isValid: true,
      expired: parsedExpiryDate,
      startDate: currentDate,
      amount: encryptData(String(parseFloat(amount))),
      type: encryptData(type),
      productId: encryptData(productId), // Restrict coupon to this product id
    };

    await couponRef.set(doc);
    res.json({ message: "Product coupon created successfully", status: "success" });
  } catch (error) {
    console.error("Error creating product coupon:", error);
    res.status(500).json({ error: "Failed to create product coupon" });
  }
});

// Create a coupon assigned to a specific category (admin only)
router.post("/add/category-coupon", verifyAdmin, async (req, res) => {
  const { name, type, amount, expiryDate, categoryId } = req.body;

  try {
    if (!categoryId || typeof categoryId !== "string") {
      return res.status(400).json({ error: "Missing or invalid categoryId" });
    }

    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      throw new Error("Invalid expiryDate format. Must be a valid date string.");
    }

    // Fetch category name from ID to store a stable reference
    const categoryDoc = await db.collection("categories").doc(categoryId).get();
    if (!categoryDoc.exists) {
      return res.status(404).json({ error: "Category not found" });
    }
    const categoryName = categoryDoc.data().name;

    const parsedExpiryDate = Timestamp.fromDate(new Date(expiryDate));
    const currentDate = Timestamp.now();
    const couponRef = admin.firestore().collection("coupons").doc();

    const doc = {
      name: encryptData(name),
      isValid: true,
      expired: parsedExpiryDate,
      startDate: currentDate,
      amount: encryptData(String(parseFloat(amount))),
      type: encryptData(type),
      // Restrict coupon to this category (compared against product.categoryId which stores the category name)
      categoryName: encryptData(categoryName),
    };

    await couponRef.set(doc);
    res.json({ message: "Category coupon created successfully", status: "success" });
  } catch (error) {
    console.error("Error creating category coupon:", error);
    res.status(500).json({ error: "Failed to create category coupon" });
  }
});

// Create a coupon assigned to a specific user (admin only)
router.post("/add/user-coupon", verifyAdmin, async (req, res) => {
  const { name, type, amount, expiryDate, userId } = req.body;

  try {
    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Missing or invalid userId" });
    }

    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      throw new Error("Invalid expiryDate format. Must be a valid date string.");
    }

    const parsedExpiryDate = Timestamp.fromDate(new Date(expiryDate));
    const currentDate = Timestamp.now();
    const couponRef = admin.firestore().collection("coupons").doc();

    const doc = {
      name: encryptData(name),
      isValid: true,
      expired: parsedExpiryDate,
      startDate: currentDate,
      amount: encryptData(String(parseFloat(amount))),
      type: encryptData(type),
      userId: encryptData(userId), // Restrict coupon to this user
    };

    await couponRef.set(doc);
    res.json({ message: "User coupon created successfully", status: "success" });
  } catch (error) {
    console.error("Error creating user coupon:", error);
    res.status(500).json({ error: "Failed to create user coupon" });
  }
});

router.post("/add/coupon", verifyAdmin, async (req, res) => {
  const { name, isValid, type, expiryDate, amount } = req.body;

  try {
    if (!expiryDate || isNaN(new Date(expiryDate).getTime())) {
      throw new Error("Invalid expiryDate format. Must be a valid date string.");
    }
    const parsedExpiryDate = Timestamp.fromDate(new Date(expiryDate));
    const currentDate = Timestamp.now();
    const couponRef = admin.firestore().collection("coupons").doc();
    const doc = {
      name: encryptData(name),
      isValid,
      expired: parsedExpiryDate,
      startDate: currentDate,
      amount: encryptData(String(parseFloat(amount))),
      type: encryptData(type),
    };
    await couponRef.set(doc);
    res.json({ message: "Coupon added successfuly", status: "success" });
  } catch (error) {
    console.error("Error adding coupon:", error);
    res.status(500).json({ error: "Failed to add coupon" });
  }
});

router.get("/view/coupon/:couponId", verifyAdmin, async (req, res) => {
  const couponId = req.params.couponId;
  try {
    const doc = await db.collection("coupons").doc(couponId).get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Coupon not found", status: "failed" });
    }
    const data = {
      id: doc.id,
      name: decryptData(doc.data().name),
      isValid: doc.data().isValid,
      expired: doc.data().expired,
      startDate: doc.data().startDate,
      amount: decryptData(doc.data().amount),
      type: decryptData(doc.data().type),
    };

    res.json({ coupon: data, status: "success" });
  } catch (error) {
    console.error("Error fetching coupon:", error);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
});

router.put("/edit/coupon/:couponId", verifyAdmin, async (req, res) => {
  try {
    const couponId = req.params.couponId;
    const { name, isValid, type, expiryDate, amount } = req.body;
    if (!couponId || name == null || isValid == null || !expiryDate || !amount || !type) {
      return res.status(400).json({ message: "Missing required fields", status: "failed" });
    }

    if (typeof Number(expiryDate) !== "number" || Number(expiryDate) <= 0) {
      return res.status(400).json({ message: "Invalid expiryDate format", status: "failed" });
    }
    const couponRef = db.collection("coupons").doc(couponId);
    const doc = await couponRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Coupon not found", status: "failed" });
    }
    const parsedExpiryDate = Timestamp.fromMillis(Number(expiryDate));
    await couponRef.update({
      name: encryptData(name),
      isValid: Boolean(isValid),
      type: encryptData(type),
      expired: parsedExpiryDate,
      amount: encryptData(String(parseFloat(amount))),
    });
    res.status(200).json({ message: "Coupon updated successfully", status: "success" });
  } catch (error) {
    console.error("Error editing coupon:", error);
    res.status(500).json({ error: "Failed to edit coupon", details: error.message });
  }
});

router.delete("/delete/coupon/:couponId", verifyAdmin, async (req, res) => {
  const couponId = req.params.couponId;

  try {
    const docRef = db.collection("coupons").doc(couponId);
    if (!(await docRef.get()).exists) {
      return res.status(404).json({ message: "Coupon not found", status: "failed" });
    }
    await docRef.delete();
    res.json({ message: "Coupon deleted successfully", status: "success" });
  } catch (error) {
    console.error("Error deleting coupon:", error);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

module.exports = router;

// Public API: get applicable coupons for a given cart
router.post("/api/coupons/applicable", async (req, res) => {
  try {
    const { productIds = [], categoryIds = [], userId = null } = req.body || {};

    const setProd = new Set(productIds);
    const setCat = new Set(categoryIds);

    const allCoupons = await getCoupouns();
    const now = Date.now();

    const applicable = allCoupons
      .filter((c) => c && c.isValid && c.expired && typeof c.expired.toMillis === "function" && c.expired.toMillis() > now)
      .map((c) => {
        const name = c.name ? decryptData(c.name) : null;
        const type = c.type ? decryptData(c.type) : null;
        const amount = c.amount ? Number(decryptData(c.amount)) : null;
        const prodId = c.productId ? decryptData(c.productId) : null;
        const catName = c.categoryName ? decryptData(c.categoryName) : null;
        const uid = c.userId ? decryptData(c.userId) : null;
        return { id: c.id, name, type, amount, productId: prodId, categoryName: catName, userId: uid, expiredAt: c.expired };
      })
      .filter((c) => {
        // user-specific coupons should match if userId provided
        if (c.userId && userId && c.userId !== userId) return false;
        if (c.userId && !userId) return false;

        // product-scoped
        if (c.productId && setProd.has(c.productId)) return true;

        // category-scoped
        if (c.categoryName && setCat.has(c.categoryName)) return true;

        // general coupon (no userId/productId/categoryName) -> always suggest
        if (!c.userId && !c.productId && !c.categoryName) return true;

        return false;
      })
      .sort((a, b) => a.expiredAt.toMillis() - b.expiredAt.toMillis())
      .slice(0, 10);

    res.json({ success: true, coupons: applicable });
  } catch (error) {
    console.error("Error computing applicable coupons:", error);
    res.status(500).json({ success: false, error: "Failed to compute applicable coupons" });
  }
});
