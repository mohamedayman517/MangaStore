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

    // Support split env variables (FIREBASE_TYPE, FIREBASE_PRIVATE_KEY, etc.)
    if (!json) {
      const hasSplitCreds =
        process.env.FIREBASE_TYPE &&
        process.env.FIREBASE_PRIVATE_KEY &&
        process.env.FIREBASE_CLIENT_EMAIL;

      if (hasSplitCreds) {
        // Normalize private key newlines if provided as escaped \n
        const normalizedPrivateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
        json = {
          type: process.env.FIREBASE_TYPE,
          project_id: process.env.FIREBASE_PROJECT_ID,
          private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
          private_key: normalizedPrivateKey,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          client_id: process.env.FIREBASE_CLIENT_ID,
          auth_uri: process.env.FIREBASE_AUTH_URI,
          token_uri: process.env.FIREBASE_TOKEN_URI,
          auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
          client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
          universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN || "googleapis.com",
        };
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
