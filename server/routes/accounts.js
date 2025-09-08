const express = require("express");
require("dotenv").config();
const { claimFirstYesRow } = require("../utils/googleSheets");

const router = express.Router();

// POST /api/accounts/claim
// Body (optional): { usedValue: "USED", sheetName: "Sheet1" }
router.post("/api/accounts/claim", async (req, res) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ error: "Missing GOOGLE_SPREADSHEET_ID in .env" });
    }

    const sheetName = (req.body?.sheetName || process.env.GOOGLE_SHEET_NAME || "Sheet1").trim();
    const usedValue = (req.body?.usedValue || process.env.GOOGLE_SHEET_USED_VALUE || "USED").trim();

    const result = await claimFirstYesRow({ spreadsheetId, sheetName, usedValue });
    if (!result) {
      return res.status(404).json({ message: "لا توجد حسابات متاحة الآن" });
    }

    // Return the row data to the client (e.g., Steam ID, password, etc.)
    return res.json({
      row: result.rowObject,
      rowIndex: result.rowIndex,
      message: "تم تسليم الحساب وتحديث حالته",
    });
  } catch (err) {
    console.error("[accounts.claim]", err);
    return res.status(500).json({ error: "Failed to claim account", details: err.message || String(err) });
  }
});

module.exports = router;
