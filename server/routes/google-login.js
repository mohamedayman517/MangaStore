const express = require("express");
const router = express.Router();
require("dotenv").config();
const admin = require("firebase-admin");
const { encryptData } = require("../utils/cryptoHelper");
const { Timestamp } = admin.firestore;
const { strictRateLimit } = require("../middlewares/rateLimit");

router.post(
  "/auth/google",
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 1000 }),
  async (req, res) => {
    try {
      const { idToken } = req.body;
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const maxAge = 60 * 60 * 24 * 7 * 1000; // 7 days
      const newSessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn: maxAge });
      const useDoc = await admin.firestore().collection("users").doc(uid).get();
      if (!useDoc.exists) {
        await admin
          .firestore()
          .collection("users")
          .doc(uid)
          .set({
            name: encryptData(decodedToken.name),
            email: encryptData(decodedToken.email),
            photoURL: encryptData(decodedToken.picture),
            createdAt: Timestamp.now(),
            transactions: [],
            signupMethod: encryptData("google"),
          });
      }
      res.cookie("session", newSessionCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: maxAge,
      });
      res.status(200).json({ success: true, message: "Authenticated user" });
    } catch (error) {
      console.error("Google auth error:", error);
      res.status(500).json({ success: false, message: `Google Auth error: ${error.message}` });
    }
  }
);

module.exports = router;
