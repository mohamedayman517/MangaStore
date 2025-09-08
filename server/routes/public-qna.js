const express = require("express");
const router = express.Router();
const { admin } = require("../utils/firebase");

// Public read-only Q&A for storefront
router.get("/api/qna", async (_req, res) => {
  try {
    const docRef = admin.firestore().collection("Q&A").doc("data");
    const doc = await docRef.get();
    let qaItems = [];
    if (doc.exists) {
      const data = doc.data();
      qaItems = data.QA || [];
    }
    // Cache for 5 minutes to reduce reads
    res.set("Cache-Control", "public, max-age=300");
    return res.json({ items: qaItems });
  } catch (error) {
    console.error("Error fetching public Q&A:", error);
    return res.status(500).json({ error: "Failed to fetch Q&A" });
  }
});

module.exports = router;
