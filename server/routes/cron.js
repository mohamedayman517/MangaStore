const express = require("express");
const router = express.Router();
const { processDue } = require("../utils/emailQueue");
const { exportAllToSheets } = require("../utils/exports");
const { importTicketsFromSheet, importPointsFromSheet } = require("../utils/imports");
const { admin, db } = require("../utils/firebase");
const fetchProductsFromFirebase = require("../utils/fetchProducts");
const { writeSheet } = require("../utils/googleSheets");
require("dotenv").config();

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

function ensureCronAuth(req, res) {
  const token = req.query.token;
  const expected = process.env.CRON_SECRET;
  if (!expected || token !== expected) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

function ensureSheetEnv(res) {
  if (!SPREADSHEET_ID) {
    res.status(500).json({ success: false, error: "Missing GOOGLE_SPREADSHEET_ID in .env" });
    return false;
  }
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    res.status(500).json({ success: false, error: "Missing GOOGLE_CLIENT_EMAIL/GOOGLE_PRIVATE_KEY in .env" });
    return false;
  }
  return true;
}

// Import from Sheets into Firestore (for Apps Script/webhooks)
router.post('/cron/import/tickets', async (req, res) => {
  try {
    if (!ensureCronAuth(req, res)) return;
    if (!ensureSheetEnv(res)) return;
    const result = await importTicketsFromSheet({ spreadsheetId: SPREADSHEET_ID, sheetName: 'Tickets' });
    return res.json({ ok: true, sheet: 'Tickets', updated: result.updated });
  } catch (e) {
    return res.status(500).json({ error: 'tickets import failed', details: e.message });
  }
});

router.post('/cron/import/points', async (req, res) => {
  try {
    if (!ensureCronAuth(req, res)) return;
    if (!ensureSheetEnv(res)) return;
    const result = await importPointsFromSheet({ spreadsheetId: SPREADSHEET_ID, sheetName: 'Points' });
    return res.json({ ok: true, sheet: 'Points', updated: result.updated });
  } catch (e) {
    return res.status(500).json({ error: 'points import failed', details: e.message });
  }
});

// Simple token auth for cron
router.get('/cron/email-queue', async (req, res) => {
  try {
    if (!ensureCronAuth(req, res)) return;
    const results = await processDue(25);
    return res.json({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error('Cron processing error:', e);
    return res.status(500).json({ error: 'cron failed' });
  }
});

// GET /cron/exports?token=...
// Triggers Google Sheets exports for Transactions, Points, and Stocks
router.get('/cron/exports', async (req, res) => {
  try {
    if (!ensureCronAuth(req, res)) return;
    if (!ensureSheetEnv(res)) return;

    const result = await exportAllToSheets({ spreadsheetId: SPREADSHEET_ID });
    return res.json({ ok: true, sheets: result });
  } catch (e) {
    const apiErr = e && e.response && e.response.data ? e.response.data : null;
    console.error('Cron exports error:', e.message || e, apiErr || "");
    return res.status(500).json({ error: 'exports failed', details: e.message, api: apiErr });
  }
});

module.exports = router;
