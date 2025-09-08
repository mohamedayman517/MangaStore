// routes/auth.js
const express = require("express");
const { signInWithEmailAndPassword } = require("firebase/auth");
const { admin, frontAuth: auth } = require("../utils/firebase");
const { decryptData } = require("../utils/cryptoHelper");
const router = express.Router();

const cookieParser = require("cookie-parser");
router.use(cookieParser());

// Login Page
router.get("/login", (req, res) => {
  if (req.cookies.session) {
    return res.redirect("/");
  }
  const message = req.query.message || null;
  res.render("login", { message });
});

// Handle Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    // Authenticate user
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = await admin.auth().getUser(userCredential.user.uid);
    const userData = await admin.firestore().collection("users").doc(user.uid).get();
    const customClaims = user.customClaims || {};

    const idToken = await userCredential.user.getIdToken();
    const expiresIn = 60 * 60 * 24 * 1000; // 24 hours

    // Check if user is admin or moderator
    if (
      (customClaims.role === "admin" && decryptData(userData.data().role) === "admin") ||
      (customClaims.role === "moderator" && decryptData(userData.data().role) === "moderator")
    ) {
      console.log("Authenticated user is an admin or moderator");

      const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });

      res
        .cookie("session", sessionCookie, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiresIn,
        })
        .cookie("token", idToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiresIn,
        })
        .redirect("/admin");
    } else {
      // Regular user login
      console.log("Authenticated user is a regular user");
      
      const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });

      res
        .cookie("session", sessionCookie, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiresIn,
        })
        .cookie("token", idToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: expiresIn,
        })
        .redirect("/");
    }
  } catch (error) {
    console.error("Login failed:", error.code);
    res.status(400).json({ error: error.code, message: error.message, success: false });
  }
});

module.exports = router;
