const { db } = require('./firebase');
const { readSheet } = require('./googleSheets');
require('dotenv').config();

async function importTicketsFromSheet({ spreadsheetId, sheetName = 'Tickets' }) {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  const rows = await readSheet({ spreadsheetId, sheetName });
  let updated = 0;
  for (const r of rows) {
    const id = (r.id || '').trim();
    if (!id) continue;
    const payload = {};
    if (r.status !== undefined && r.status !== '') payload.status = String(r.status).trim();
    if (r.adminOfferPrice !== undefined && r.adminOfferPrice !== '') {
      const n = Number(String(r.adminOfferPrice).replace(/,/g, ''));
      if (!Number.isNaN(n)) payload.adminOfferPrice = n;
    }
    if (Object.keys(payload).length) {
      await db.collection('tickets').doc(id).set(payload, { merge: true });
      updated++;
    }
  }
  return { updated };
}

async function importPointsFromSheet({ spreadsheetId, sheetName = 'Points' }) {
  if (!spreadsheetId) throw new Error('spreadsheetId is required');
  const rows = await readSheet({ spreadsheetId, sheetName });
  let updated = 0;
  for (const r of rows) {
    const uid = (r.uid || '').trim();
    if (!uid) continue;
    const payload = {};
    if (r.cashbackPoints !== undefined && r.cashbackPoints !== '') {
      const n = Number(String(r.cashbackPoints).replace(/,/g, ''));
      if (!Number.isNaN(n)) payload.cashbackPoints = n;
    }
    if (Object.keys(payload).length) {
      await db.collection('users').doc(uid).set(payload, { merge: true });
      updated++;
    }
  }
  return { updated };
}

module.exports = { importTicketsFromSheet, importPointsFromSheet };
