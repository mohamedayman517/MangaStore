const express = require("express");
const router = express.Router();
const validateSession = require("../middlewares/validateSession");
const checkActivateAccount = require("../middlewares/checkActivateAccount");
const { frontDB } = require("../utils/firebase");
const { getDoc, setDoc, doc, Timestamp } = require("firebase/firestore");
const { classifyText } = require("../utils/moderation");

// POST /api/reviews
// Body: { orderId: string, rating: number (1..5), comment?: string }
router.post("/api/reviews", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const uid = req.uid;
    const { orderId, rating, comment } = req.body || {};

    if (!orderId || typeof orderId !== "string") {
      return res.status(400).json({ success: false, error: "orderId is required" });
    }
    const numRating = Number(rating);
    if (!Number.isFinite(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ success: false, error: "rating must be between 1 and 5" });
    }
    let safeComment = null;
    if (typeof comment === "string" && comment.trim().length > 0) {
      safeComment = comment.trim().slice(0, 500);
      // Moderation check (server-side)
      try {
        const { label, isToxic } = await classifyText(safeComment);
        if (isToxic) {
          return res.status(400).json({ success: false, error: "Comment rejected by moderation", label });
        }
      } catch (modErr) {
        console.warn("[Reviews] moderation failed, allowing comment:", modErr?.message || modErr);
      }
    }

    // Verify transaction ownership
    const txRef = doc(frontDB, "transactions", orderId);
    const txSnap = await getDoc(txRef);
    if (!txSnap.exists()) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }
    const tx = txSnap.data();
    if (tx.uid !== uid) {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const reviewId = `${orderId}_${uid}`;
    const reviewRef = doc(frontDB, "reviews", reviewId);
    const now = Timestamp.now();

    await setDoc(
      reviewRef,
      {
        id: reviewId,
        orderId,
        uid,
        rating: numRating,
        comment: safeComment || null,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("Failed to create review:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
});

module.exports = router;
