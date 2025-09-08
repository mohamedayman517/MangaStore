// routes/auth.js
const express = require("express");
const router = express.Router();

const emailVerifyTemplate = require("../templates/EmailVerifyTemplate");
const { WelcomeTemplate } = require("../templates");
const { sendEmail } = require("../utils/mailer");

const { encryptData } = require("../utils/cryptoHelper");
const axios = require("axios");

const { admin, frontDB } = require("../utils/firebase");
const { doc, setDoc, Timestamp } = require("firebase/firestore");

const checkLogin = require("../middlewares/login-register-check");

router.get("/register", checkLogin, async (req, res) => {
  res.cookie("isLoggedIn", false, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
  res.render("register");
});

async function signInUser(email, password) {
  const apiKey = process.env.FIREBASE_API_KEY; // Your Firebase Web API key
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

  const response = await axios.post(signInUrl, {
    email,
    password,
    returnSecureToken: true,
  });

  return response.data.idToken;
}

router.post("/register", checkLogin, async (req, res) => {
  const { email, password, name, gender, phoneNumber, countryCode, confirmPassword } = req.body;

  if (!email || !password || !name || !gender || !phoneNumber || !confirmPassword || !countryCode) {
    return res.status(400).send({ success: false, message: "All fields are required" });
  }

  if (password !== confirmPassword) {
    return res.status(400).send({ success: false, message: "Passwords do not match" });
  }

  try {
    // 1. Create user using Firebase Admin SDK
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: `+${countryCode}${phoneNumber}`,
      photoURL: "https://res.cloudinary.com/dadyyal9s/image/upload/v1738241153/uploads/ezknvgb9b561ygrcjac4.png",
    });

    // 2. Store additional user info in Firestore
    await setDoc(doc(frontDB, "users", user.uid), {
      name: encryptData(name),
      email: encryptData(email),
      gender: encryptData(gender),
      countryCode: encryptData(countryCode),
      phoneNumber: encryptData(phoneNumber),
      photoURL: encryptData(user.photoURL),
      createdAt: Timestamp.now(),
      transactions: [],
      signupMethod: encryptData("email"),
    });

    // 4. Sign in user using Firebase Auth REST API to get a valid ID token
    const idToken = await signInUser(email, password);

    // 5. Create session cookie using the ID token
    const expiresIn = 60 * 60 * 24 * 7 * 1000; // 7 days
    const sessionCookie = await admin.auth().createSessionCookie(idToken, { expiresIn });

    const actionCodeSettings = {
      url: "https://store.mohammed-zuhair.online/profile",
      handleCodeInApp: true,
    };

    const emailVerifyLink = admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
    const emailVerify = new emailVerifyTemplate(name, emailVerifyLink);
    await sendEmail(email, emailVerify);

    // Send a welcome email (separate from verification)
    try {
      const welcome = new WelcomeTemplate({ name });
      await sendEmail(email, welcome);
    } catch (e) {
      console.warn("Welcome email failed:", e?.message || e);
    }

    // 6. Set session cookie in response
    res.cookie("session", sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: expiresIn,
    });

    res.cookie("isLoggedIn", true, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: expiresIn,
    });

    res.status(201).send({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(400).send({ success: false, message: error.message });
  }
});

module.exports = router;
