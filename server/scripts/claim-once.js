require("dotenv").config();
const { claimFirstYesRow } = require("../utils/googleSheets");

(async () => {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || "Sheet1";
  const usedValue = process.env.GOOGLE_SHEET_USED_VALUE || "USED";

  if (!spreadsheetId) {
    console.error("Missing GOOGLE_SPREADSHEET_ID in .env");
    process.exit(1);
  }

  const result = await claimFirstYesRow({ spreadsheetId, sheetName, usedValue });
  if (!result) {
    console.log("No available accounts (no SITUATION=Yes)");
    return;
  }
  console.log("Claimed row:");
  console.log(JSON.stringify(result, null, 2));
})();
