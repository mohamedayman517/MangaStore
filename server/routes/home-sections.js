const router = require("express").Router();
const { db } = require("../utils/firebase");
const verifyAdmin = require("../middlewares/verifyAdmin");

// List sections UI
router.get("/home-sections", verifyAdmin, async (req, res) => {
  try {
    const snap = await db.collection("home-sections").orderBy("order", "asc").get().catch(async (e) => {
      // If no index/order, fallback without ordering
      const s2 = await db.collection("home-sections").get();
      return { docs: s2.docs };
    });
    const sections = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.render("home-sections/manage-home-sections", { sections });
  } catch (err) {
    console.error("Error fetching home-sections:", err);
    res.status(500).send("Failed to load home sections");
  }
});

// Create section
router.post("/home-sections", verifyAdmin, async (req, res) => {
  try {
    const { title, order = 0, isActive = true } = req.body;
    if (!title || String(title).trim() === "") return res.status(400).send("title is required");
    const docRef = db.collection("home-sections").doc();
    await docRef.set({ title: String(title).trim(), order: Number(order) || 0, isActive: Boolean(isActive), productIds: [] });
    res.redirect("/admin/home-sections");
  } catch (err) {
    console.error("Create home-section error:", err);
    res.status(500).send("Failed to create section");
  }
});

// Update section (title/order/isActive/productIds)
router.post("/home-sections/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, order, isActive, productIds } = req.body;
    const update = {};
    if (title !== undefined) update.title = String(title).trim();
    if (order !== undefined) update.order = Number(order) || 0;
    if (isActive !== undefined) update.isActive = isActive === "true" || isActive === true;
    if (productIds !== undefined) {
      if (Array.isArray(productIds)) update.productIds = productIds;
      else if (typeof productIds === "string") {
        update.productIds = productIds.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    await db.collection("home-sections").doc(id).update(update);
    res.redirect("/admin/home-sections");
  } catch (err) {
    console.error("Update home-section error:", err);
    res.status(500).send("Failed to update section");
  }
});

// Delete section
router.post("/home-sections/:id/delete", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await db.collection("home-sections").doc(id).delete();
    res.redirect("/admin/home-sections");
  } catch (err) {
    console.error("Delete home-section error:", err);
    res.status(500).send("Failed to delete section");
  }
});

module.exports = router;
