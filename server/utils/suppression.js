const crypto = require("crypto");
const { admin, db } = require("./firebase");

const SUPPRESS_COLLECTION = "email_suppression";
const SECRET = process.env.SUPPRESS_SECRET || "dev-secret-change-me";
const BASE = process.env.PUBLIC_BASE_URL || "http://localhost:3000";

function hashEmail(email) {
  const lower = String(email || "").trim().toLowerCase();
  return crypto.createHash("sha256").update(lower).digest("hex");
}

function sign(payload) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
}

function buildUnsubLink(email) {
  const e = Buffer.from(String(email || "").trim().toLowerCase()).toString("base64url");
  const sig = sign(e);
  return `${BASE}/unsubscribe?e=${e}&t=${sig}`;
}

async function isSuppressed(email) {
  if (!email) return false;
  const id = hashEmail(email);
  const snap = await db.collection(SUPPRESS_COLLECTION).doc(id).get();
  return snap.exists;
}

async function suppress(email, reason = "user_request") {
  if (!email) return false;
  const id = hashEmail(email);
  await db
    .collection(SUPPRESS_COLLECTION)
    .doc(id)
    .set(
      {
        email: String(email).trim().toLowerCase(),
        reason,
        createdAt: admin.firestore.Timestamp.now(),
      },
      { merge: true }
    );
  return true;
}

function verifyAndDecodeEmail(encoded, token) {
  if (!encoded || !token) return null;
  const expected = sign(encoded);
  if (expected !== token) return null;
  try {
    const email = Buffer.from(encoded, "base64url").toString("utf8");
    return String(email || "").trim().toLowerCase();
  } catch (e) {
    return null;
  }
}

module.exports = { isSuppressed, suppress, buildUnsubLink, verifyAndDecodeEmail };
