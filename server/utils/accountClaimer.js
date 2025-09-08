const { Timestamp } = require("firebase-admin").firestore;
const { claimFirstYesRow } = require("./googleSheets");

// Build key/value pairs from a claimed row.
// Excludes meta columns like SITUATION/Available.
function buildKeyValueProof(rowObject) {
  const pairs = [];
  for (const [k, v] of Object.entries(rowObject)) {
    const keyNorm = String(k || "").trim().toLowerCase();
    if (!k) continue;
    if (["situation", "status", "الحالة", "sutuation", "available"].includes(keyNorm)) continue;
    pairs.push({ ["Key"]: k, ["Value"]: v, createdAt: Timestamp.now() });
  }
  return pairs;
}

async function claimAndBuildProof({
  spreadsheetId,
  sheetName,
  situationColumn, // optional override
  usedValue = "USED",
}) {
  const result = await claimFirstYesRow({ spreadsheetId, sheetName, situationColumn, usedValue });
  if (!result) return null;
  const proof = buildKeyValueProof(result.rowObject);
  return { proof, sourceRowIndex: result.rowIndex };
}

module.exports = { claimAndBuildProof, buildKeyValueProof };
