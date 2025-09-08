// Use the single initialized Firebase Admin instance
const admin = require("../config/firebase-admin");

// Firebase Admin SDK services (for backend use)
const db = admin.firestore(); // Firestore database
const adminAuth = admin.auth(); // Authentication
const storage = admin.storage(); // Storage (optional, if needed)

// Initialize Firebase Client SDK (for frontend use)
const { initializeApp: clientInitializeApp } = require("firebase/app");
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

const clientApp = clientInitializeApp(firebaseConfig);

// Firebase Client SDK services (for frontend logic)
const { getFirestore: clientGetFirestore } = require("firebase/firestore");
const { getAuth } = require("firebase/auth");
const frontDB = clientGetFirestore(clientApp);
const frontAuth = getAuth(clientApp);
// Export the necessary services for backend and frontend
module.exports = { admin, db, storage, frontDB, adminAuth, frontAuth };
