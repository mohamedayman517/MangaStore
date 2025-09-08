// Reuse initialized Admin SDK to avoid duplicate initializeApp errors
const admin = require("../config/firebase-admin");

const db = admin.firestore();
module.exports = { admin, db };
