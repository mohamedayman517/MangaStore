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
    // Normalize phone and country code to E.164 (+<digits>)
    const cc = String(countryCode || "").replace(/[^0-9]/g, "");
    const pn = String(phoneNumber || "").replace(/[^0-9]/g, "");
    if (!cc || !pn) {
      return res.status(400).send({ success: false, message: "Invalid phone number or country code" });
    }
    // Basic length guard to avoid Firebase TOO_SHORT
    // Many countries expect at least 10 national digits (after removing leading zero)
    if (pn.length < 10) {
      return res
        .status(400)
        .send({ success: false, message: "Phone number is too short. Please enter the full number without the leading 0." });
    }
    const e164Phone = `+${cc}${pn}`;
    // 1. Create user using Firebase Admin SDK
    const user = await admin.auth().createUser({
      email,
      password,
      displayName: name,
      phoneNumber: e164Phone,
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

    // Build a continue URL from env so it works in local/prod without allowlist errors
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3200}`;
    const actionCodeSettings = {
      url: `${baseUrl.replace(/\/$/, "")}/profile`,
      handleCodeInApp: true,
    };

    // 6. Set session cookie in response (respond early to speed up UX)
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

    // Fire-and-forget email tasks (run after response)
    setImmediate(async () => {
      try {
        let emailVerifyLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
        const emailVerify = new emailVerifyTemplate(name, emailVerifyLink);
        await sendEmail(email, emailVerify);
      } catch (e) {
        const msg = e?.message || "";
        if (msg.toLowerCase().includes("unauthorized-continue-uri")) {
          try {
            let emailVerifyLink = await admin.auth().generateEmailVerificationLink(email);
            const emailVerify = new emailVerifyTemplate(name, emailVerifyLink);
            await sendEmail(email, emailVerify);
          } catch (e2) {
            console.warn("Email verification link fallback failed:", e2?.message || e2);
          }
        } else {
          console.warn("Email verification link generation failed:", msg);
        }
      }

      try {
        const welcome = new WelcomeTemplate({ name });
        await sendEmail(email, welcome);
      } catch (e) {
        console.warn("Welcome email failed:", e?.message || e);
      }
    });
  } catch (error) {
    const code = error?.code || error?.errorInfo?.code || null;
    const msg = error?.message || "Registration failed";
    console.error("Register error:", { code, message: msg });
    res.status(400).send({ success: false, code, message: msg });
  }
});

module.exports = router;
