const express = require("express");
const router = express.Router();
const verifyAdmin = require("../middlewares/verifyAdmin");
const { db } = require("../utils/firebase");

// Admin: list latest reviews
router.get("/reviews", verifyAdmin, async (req, res) => {
  try {
    const snap = await db
      .collection("reviews")
      .orderBy("createdAt", "desc")
      .limit(200)
      .get();

    const reviews = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    res.render("admin/reviews", { reviews });
  } catch (err) {
    console.error("Failed to load reviews:", err);
    res.status(500).send("Failed to load reviews");
  }
});

module.exports = router;
