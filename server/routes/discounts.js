const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const { Timestamp } = admin.firestore;
const verifyAdmin = require("../middlewares/verifyAdmin");

router.get("/discounts", verifyAdmin, async (req, res) => {
  try {
    const [productsDocs, discountsDocs] = await Promise.all([
      db.collection("products").get(),
      db.collection("discounts").get(),
    ]);

    // Extract products and create name map
    const products = productsDocs.docs.map((doc) => ({
      id: doc.id,
      price: doc.data().price,
      name: doc.data().name,
    }));

    const productNameMap = products.reduce((map, product) => {
      map[product.id] = product.name;
      return map;
    }, {});

    // Process discounts
    const discounts = discountsDocs.docs.map((doc) => ({
      id: doc.id,
      productId: productNameMap[doc.data().productId] || "Unknown Product",
      isActive: doc.data().isActive,
      endDate: doc.data().endDate,
      startDate: doc.data().startDate,
      discountValue: doc.data().discountValue,
      discountType: doc.data().discountType,
    }));

    res.render("discounts/discounts", { discounts, products });
  } catch (error) {
    console.error("Error fetching discounts:", error);
    res.status(500).json({ error: "Failed to fetch discounts" });
  }
});

router.post("/add/discount", verifyAdmin, async (req, res) => {
  const { productId, startDate, isActive, discountType, endDate, discountValue } = req.body;

  try {
    // Validate all required fields
    if (!productId || !discountType || !discountValue || isActive === undefined) {
      return res.status(400).json({ message: "Missing required fields", status: "failed" });
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate) || isNaN(parsedEndDate)) {
      return res.status(400).json({ message: "Invalid date format", status: "failed" });
    }

    if (parsedStartDate >= parsedEndDate) {
      return res.status(400).json({ message: "End date must be after start date", status: "failed" });
    }

    const discountRef = admin.firestore().collection("discounts").doc();
    await discountRef.set({
      productId,
      isActive,
      discountValue,
      discountType,
      startDate: admin.firestore.Timestamp.fromDate(parsedStartDate),
      endDate: admin.firestore.Timestamp.fromDate(parsedEndDate),
    });

    res.json({ message: "Discount added successfully", status: "success" });
  } catch (error) {
    console.error("Error adding discount:", error);
    res.status(500).json({ message: "Failed to add discount", error: error.message });
  }
});

router.get("/view/discounts/:discountId", verifyAdmin, async (req, res) => {
  const discountId = req.params.discountId;

  try {
    const discountDoc = await db.collection("discounts").doc(discountId).get();
    if (!discountDoc.exists) {
      return res.status(404).json({ message: "Discount not found", status: "failed" });
    }
    const discount = discountDoc.data();

    const productDoc = await db.collection("products").doc(discount.productId).get();
    if (!productDoc.exists) {
      return res.status(404).json({ message: "Product not found", status: "failed" });
    }
    const product = productDoc.data();
    res.json({ discount, product, status: "success" });
  } catch (error) {
    console.error("Error fetching discount or product:", error);
    res.status(500).json({ error: "Failed to fetch discount data", details: error.message });
  }
});

router.put("/edit/discounts/:discountId", verifyAdmin, async (req, res) => {
  const discountId = req.params.discountId;
  const { productId, startDate, endDate, discountType, discountValue, isActive } = req.body;
  try {
    if (!productId || !discountType || !discountValue || isActive === undefined) {
      return res.status(400).json({ message: "Missing required fields", status: "failed" });
    }

    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate.getTime())) {
      return res.status(400).json({ message: "Invalid start date and time format", status: "failed" });
    }
    if (isNaN(parsedEndDate.getTime()) || parsedEndDate < new Date()) {
      return res
        .status(400)
        .json({ message: "Invalid end date and time format or date is in the past", status: "failed" });
    }

    const discountRef = db.collection("discounts").doc(discountId);
    const doc = await discountRef.get();
    if (!doc.exists) {
      return res.status(404).json({ message: "Discount not found", status: "failed" });
    }

    await discountRef.update({
      productId,
      startDate: Timestamp.fromDate(parsedStartDate),
      endDate: Timestamp.fromDate(parsedEndDate),
      discountType,
      discountValue,
      isActive: isActive === "true",
    });

    res.status(200).json({ message: "Discount updated successfully", status: "success" });
  } catch (error) {
    console.error("Error editing discount:", error);
    res.status(500).json({ error: "Failed to edit discount", details: error.message });
  }
});

router.delete("/delete/discount/:discountId", verifyAdmin, async (req, res) => {
  const discountId = req.params.discountId;
  try {
    const docRef = db.collection("discounts").doc(discountId);
    if (!(await docRef.get()).exists) {
      return res.status(404).json({ message: "discount not found", status: "failed" });
    }
    await docRef.delete();
    res.json({ message: "discount deleted successfully", status: "success" });
  } catch (error) {
    console.error("Error deleting discount:", error);
    res.status(500).json({ error: "Failed to delete discount" });
  }
});

module.exports = router;
