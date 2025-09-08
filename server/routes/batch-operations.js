const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const verifyAdmin = require("../middlewares/verifyAdmin");
const fetch = require("node-fetch");

// Get all products with discount information for batch operations
router.get("/batch-operations", verifyAdmin, async (req, res) => {
  try {
    // Fetch products and discounts in parallel
    const [productsSnapshot, discountsSnapshot] = await Promise.all([
      db.collection("products").get(),
      db.collection("discounts").get(),
    ]);

    // Process products
    const products = [];
    productsSnapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Create a map of product IDs to their active discounts
    const discountMap = {};
    discountsSnapshot.forEach((doc) => {
      const discount = doc.data();
      if (discount.isActive) {
        discountMap[discount.productId] = {
          id: doc.id,
          ...discount,
        };
      }
    });

    // Get categories for filtering
    const categoriesSnapshot = await db.collection("categories").get();
    const categories = [];
    categoriesSnapshot.forEach((doc) => {
      categories.push({
        id: doc.id,
        name: doc.data().name,
      });
    });

    res.render("batch-operations/index", {
      products,
      discountMap,
      categories,
      title: "Batch Operations",
    });
  } catch (error) {
    console.error("Error fetching data for batch operations:", error);
    res.status(500).json({ error: "Failed to fetch data for batch operations" });
  }
});

// Batch delete products
router.post("/batch-delete", verifyAdmin, async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products selected for deletion",
      });
    }

    // Create a batch operation
    const batch = db.batch();

    // Add each product deletion to the batch
    for (const productId of productIds) {
      const productRef = db.collection("products").doc(productId);
      batch.delete(productRef);

      // Also delete any discounts associated with this product
      const discountsSnapshot = await db.collection("discounts").where("productId", "==", productId).get();

      discountsSnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
    }

    // Commit the batch
    await batch.commit();

    await refreshProducts(req.uid); // Refresh products after deletion

    res.json({
      success: true,
      message: `Successfully deleted ${productIds.length} products`,
    });
  } catch (error) {
    console.error("Error in batch delete:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete products",
      error: error.message,
    });
  }
});

// Batch add discount to products
router.post("/batch-discount", verifyAdmin, async (req, res) => {
  try {
    const { productIds, discountType, discountValue, startDate, endDate, isActive } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products selected for discount",
      });
    }

    if (!discountType || !discountValue || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Missing required discount fields",
      });
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate) || isNaN(parsedEndDate)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format",
      });
    }

    if (parsedStartDate >= parsedEndDate) {
      return res.status(400).json({
        success: false,
        message: "End date must be after start date",
      });
    }

    // Create a batch operation
    const batch = db.batch();

    // Process each product
    for (const productId of productIds) {
      // Check if product already has a discount
      const existingDiscountsSnapshot = await db.collection("discounts").where("productId", "==", productId).get();

      // If product has existing discounts, update them
      if (!existingDiscountsSnapshot.empty) {
        existingDiscountsSnapshot.forEach((doc) => {
          batch.update(doc.ref, {
            discountType,
            discountValue: Number(discountValue),
            startDate: admin.firestore.Timestamp.fromDate(parsedStartDate),
            endDate: admin.firestore.Timestamp.fromDate(parsedEndDate),
            isActive: isActive === "true",
          });
        });
      } else {
        // Create new discount
        const newDiscountRef = db.collection("discounts").doc();
        batch.set(newDiscountRef, {
          productId,
          discountType,
          discountValue: Number(discountValue),
          startDate: admin.firestore.Timestamp.fromDate(parsedStartDate),
          endDate: admin.firestore.Timestamp.fromDate(parsedEndDate),
          isActive: isActive === "true",
        });
      }
    }

    // Commit the batch
    await batch.commit();

    await refreshProducts(req.uid); // Refresh products after discount application

    res.json({
      success: true,
      message: `Successfully applied discount to ${productIds.length} products`,
    });
  } catch (error) {
    console.error("Error in batch discount:", error);
    res.status(500).json({
      success: false,
      message: "Failed to apply discounts",
      error: error.message,
    });
  }
});

// NEW ENDPOINT: Batch remove discounts from products
router.post("/batch-remove-discount", verifyAdmin, async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No products selected for discount removal",
      });
    }

    // Create a batch operation
    const batch = db.batch();
    let removedCount = 0;

    // Process each product
    for (const productId of productIds) {
      // Find discounts for this product
      const discountsSnapshot = await db.collection("discounts").where("productId", "==", productId).get();

      if (!discountsSnapshot.empty) {
        discountsSnapshot.forEach((doc) => {
          batch.delete(doc.ref);
          removedCount++;
        });
      }
    }

    // Commit the batch
    await batch.commit();

    await refreshProducts(req.uid); // Refresh products after discount removal

    if (removedCount > 0) {
      res.json({
        success: true,
        message: `Successfully removed discounts from ${removedCount} products`,
      });
    } else {
      res.json({
        success: true,
        message: "No discounts found for the selected products",
      });
    }
  } catch (error) {
    console.error("Error in batch remove discount:", error);
    res.status(500).json({
      success: false,
      message: "Failed to remove discounts",
      error: error.message,
    });
  }
});

// Get products by category for filtering
router.get("/products-by-category/:categoryName", verifyAdmin, async (req, res) => {
  try {
    const { categoryName } = req.params;

    // Get products in this category by name (not ID)
    const productsSnapshot = await db.collection("products").where("categoryId", "==", categoryName).get();

    const products = [];
    productsSnapshot.forEach((doc) => {
      products.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    res.json({ success: true, products });
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
      error: error.message,
    });
  }
});

router.get("/update-cache", verifyAdmin, async (req, res) => {
  res.render("update-cache");
});

router.post("/update-cache", verifyAdmin, async (req, res) => {
  try {
    const uid = req.uid; // Get the UID from the request

    // Send a request to update products
    await refreshProducts(uid);

    res.json({ success: true, message: "Cache updated successfully" });
  } catch (error) {
    console.error("Error updating cache:", error);
    res.status(500).json({ success: false, message: "Failed to update cache" });
  }
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

module.exports = router;
