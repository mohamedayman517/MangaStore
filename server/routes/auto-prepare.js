const express = require("express");
const verifyAdmin = require("../middlewares/verifyAdmin");
const { admin, db } = require("../utils/firebase");
const { claimAndBuildProof } = require("../utils/accountClaimer");
const { Timestamp } = require("firebase-admin").firestore;
const { encryptData } = require("../utils/cryptoHelper");

const router = express.Router();

// POST /admin/transactions/auto-prepare
// Body: { transactionId, productId, spreadsheetId?, sheetName?, situationColumn?, usedValue? }
router.post("/admin/transactions/auto-prepare", verifyAdmin, async (req, res) => {
  try {
    const { transactionId, productId, spreadsheetId, sheetName, situationColumn, usedValue } = req.body || {};
    if (!transactionId || !productId) {
      return res.status(400).json({ error: "transactionId and productId are required" });
    }

    // Load transaction
    const txRef = db.collection("transactions").doc(transactionId);
    const txSnap = await txRef.get();
    if (!txSnap.exists) return res.status(404).json({ error: "Transaction not found" });
    const tx = { id: txSnap.id, ...txSnap.data() };

    // Prepare sheet config (fallback to env if not provided)
    const cfg = {
      spreadsheetId: spreadsheetId || process.env.GOOGLE_SPREADSHEET_ID,
      sheetName: sheetName || process.env.GOOGLE_SHEET_NAME || "Sheet1",
      situationColumn: situationColumn || process.env.GOOGLE_SITUATION_COLUMN, // optional
      usedValue: usedValue || process.env.GOOGLE_SHEET_USED_VALUE || "USED",
    };
    if (!cfg.spreadsheetId) return res.status(500).json({ error: "Missing spreadsheetId (provide in body or .env)" });

    // Claim account and build proof
    const claimed = await claimAndBuildProof(cfg);
    if (!claimed) return res.status(404).json({ error: "No available accounts (no Yes rows)" });

    const encProof = (claimed.proof || []).map((p) => {
      const out = {};
      for (const k of Object.keys(p)) {
        if (k === "createdAt" || k === "updatedAt") out[k] = p[k];
        else out[k] = encryptData(p[k]);
      }
      out.updatedAt = Timestamp.now();
      return out;
    });

    // Update the matching product's proof
    const products = Array.isArray(tx.products) ? [...tx.products] : [];
    let found = false;
    for (const prod of products) {
      if (String(prod.productId) === String(productId)) {
        prod.proof = encProof;
        found = true;
        break;
      }
    }
    if (!found) return res.status(404).json({ error: "Product not found in transaction" });

    // Append Preparing status entry
    const statusEntry = {
      state: "Preparing",
      message: `Auto-filled from sheet row ${claimed.sourceRowIndex}`,
      updatedAt: Timestamp.now(),
      actor: "admin",
      adminUid: req.uid || null,
    };

    await txRef.update({
      products,
      status: admin.firestore.FieldValue.arrayUnion(statusEntry),
    });

    return res.json({ success: true, rowIndex: claimed.sourceRowIndex, proofCount: encProof.length });
  } catch (err) {
    console.error("[auto-prepare]", err);
    return res.status(500).json({ error: "Failed to auto-prepare", details: err.message || String(err) });
  }
});

module.exports = router;
