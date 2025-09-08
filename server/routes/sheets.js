const express = require("express");
const axios = require("axios");
require("dotenv").config();

const router = express.Router();

// GET /api/sheets/read?sheetId=...&range=Sheet1!A1:D10
router.get("/api/sheets/read", async (req, res) => {
  try {
    const { sheetId, range } = req.query;

    if (!process.env.GOOGLE_API_KEY) {
      return res.status(500).json({ error: "Missing GOOGLE_API_KEY in .env" });
    }
    if (!sheetId || !range) {
      return res.status(400).json({ error: "Missing required query params: sheetId, range" });
    }

    // Note: Works only for public-readable spreadsheets
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(
      range
    )}?key=${process.env.GOOGLE_API_KEY}`;

    const { data } = await axios.get(url);
    return res.json(data);
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message || "Unknown error";
    // Common issue: sheet is private -> Google returns 403
    return res.status(status).json({ error: "Failed to read sheet", details });
  }
});

module.exports = router;
