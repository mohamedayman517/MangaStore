const admin = require("firebase-admin");
const path = require("path");

if (!admin.apps.length) {
  // Prefer application default credentials via GOOGLE_APPLICATION_CREDENTIALS
  // Fallbacks: read service account JSON from env (plain JSON or base64)
  let credential;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    credential = admin.credential.applicationDefault();
  } else {
    // Try explicit service account provided in env
    const raw =
      process.env.GOOGLE_CREDENTIALS ||
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_ADMIN_CREDENTIALS ||
      "";

    let json;
    if (raw) {
      try {
        // Detect base64 vs plain JSON
        const maybeDecoded = /\{\s*"/.test(raw) ? raw : Buffer.from(raw, "base64").toString("utf8");
        json = JSON.parse(maybeDecoded);
      } catch (e) {
        throw new Error("Invalid GOOGLE_CREDENTIALS/FIREBASE_SERVICE_ACCOUNT env value. Must be JSON or base64-encoded JSON.");
      }
    }

    if (!json) {
      throw new Error(
        "Firebase Admin credentials not found. Set GOOGLE_APPLICATION_CREDENTIALS or provide GOOGLE_CREDENTIALS/FIREBASE_SERVICE_ACCOUNT env."
      );
    }

    credential = admin.credential.cert(json);
  }

  admin.initializeApp({
    credential,
    databaseURL: "https://manga-store-2d86a-default-rtdb.firebaseio.com",
  });
}

module.exports = admin;
