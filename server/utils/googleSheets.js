const { google } = require("googleapis");
require("dotenv").config();

function getSheetsClient() {
  const { GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  if (!GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    throw new Error("Missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY in .env");
  }
  const auth = new google.auth.JWT({
    email: GOOGLE_CLIENT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

async function ensureSheetExists({ sheets, spreadsheetId, sheetName }) {
  // Fetch spreadsheet to check existing sheets
  const ss = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (ss.data.sheets || []).some(
    (s) => s.properties && s.properties.title === sheetName
  );
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: { title: sheetName },
            },
          },
        ],
      },
    });
  }
}

async function writeSheet({ spreadsheetId, sheetName, headers, rows }) {
  if (!spreadsheetId) throw new Error("spreadsheetId is required");
  if (!sheetName) throw new Error("sheetName is required");
  const sheets = getSheetsClient();

  // Ensure the tab exists
  await ensureSheetExists({ sheets, spreadsheetId, sheetName });

  const range = `${sheetName}!A1`;
  const values = [headers, ...rows];

  // Clear existing data in the sheet tab
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${sheetName}!A:Z` });

  // Write headers + rows
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}

module.exports = { getSheetsClient, writeSheet };

// Read entire sheet as array of objects using first row as headers
async function readSheet({ spreadsheetId, sheetName }) {
  if (!spreadsheetId) throw new Error("spreadsheetId is required");
  if (!sheetName) throw new Error("sheetName is required");
  const sheets = getSheetsClient();
  const range = `${sheetName}!A:Z`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = (resp.data && resp.data.values) || [];
  if (!values.length) return [];
  const headers = values[0];
  const rows = values.slice(1);
  return rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[String(h || '').trim()] = row[i] === undefined ? '' : row[i]; });
    return obj;
  });
}

module.exports.readSheet = readSheet;

// Claim the first row where SITUATION === "Yes" (case-insensitive),
// then mark that SITUATION cell as USED (or provided usedValue).
// Returns: { rowIndex, rowObject }
async function claimFirstYesRow({
  spreadsheetId,
  sheetName,
  usedValue = "USED",
  situationColumn, // optional: letter like F or 1-based index string/number
}) {
  if (!spreadsheetId) throw new Error("spreadsheetId is required");
  if (!sheetName) throw new Error("sheetName is required");
  const sheets = getSheetsClient();

  // Read full sheet to locate headers and rows
  const range = `${sheetName}!A:Z`;
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const values = (resp.data && resp.data.values) || [];
  if (values.length < 2) return null; // no data rows

  const headers = values[0].map((h) => String(h || "").trim());
  // Try to detect SITUATION column robustly
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "").replace(/[\u200E\u200F]/g, "");
  let sitIdx = headers.findIndex((h) => {
    const n = norm(h);
    return n === "situation" || n === "status" || n === "الحالة" || n === "sutuation"; // common typo
  });
  // Allow explicit override first via function argument, then env: letter (e.g., F) or 1-based index (e.g., 6)
  const override = situationColumn || process.env.GOOGLE_SITUATION_COLUMN;
  if (override) {
    const col = String(override).trim();
    const byLetter = /^[A-Za-z]+$/.test(col)
      ? (col.toUpperCase().charCodeAt(0) - "A".charCodeAt(0))
      : (parseInt(col, 10) - 1);
    if (Number.isFinite(byLetter) && byLetter >= 0) sitIdx = byLetter;
  }
  if (sitIdx === -1) {
    throw new Error("Header 'SITUATION' not found (available headers: " + headers.join(", ") + ")");
  }

  let targetRowIndex = -1; // zero-based index into values (including header)
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const cell = String(row[sitIdx] || "").trim().toLowerCase();
    if (cell === "yes") {
      targetRowIndex = i; // i corresponds to sheet row number (i+1), since header is row 1
      break;
    }
  }

  if (targetRowIndex === -1) return null; // none available

  // Build row object to return
  const dataRow = values[targetRowIndex] || [];
  const rowObj = {};
  headers.forEach((h, idx) => (rowObj[h] = dataRow[idx] || ""));

  // Mark the SITUATION cell as used
  const sheetRowNumber = targetRowIndex + 1; // 1-based Excel notation
  const sitColumnLetter = String.fromCharCode("A".charCodeAt(0) + sitIdx);
  const cellRange = `${sheetName}!${sitColumnLetter}${sheetRowNumber}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: cellRange,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[usedValue]] },
  });

  return { rowIndex: sheetRowNumber, rowObject: rowObj };
}

module.exports.claimFirstYesRow = claimFirstYesRow;
