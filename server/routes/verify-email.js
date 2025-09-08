// routes/auth.js
const express = require("express");
const { admin } = require("../utils/firebase");
const router = express.Router();
const { sendEmail } = require("../utils/mailer");
const emailVerifyTemplate = require("../templates/EmailVerifyTemplate");
const validateSession = require("../middlewares/validateSession");
const { strictRateLimit } = require("../middlewares/rateLimit");

router.get("/verify-email", validateSession, (req, res) => {
  // console.log("Email veridieed: ", req.user.email_verified);
  if (req.user.email_verified) {
    return res.redirect("/profile");
  }
  const maskEmail = (email) => email.replace(/^(.{5}).*(@.*)$/, "$1*****$2");

  const email = req.user.email;
  // console.log("Email:", email);
  const maskedEmail = maskEmail(email);

  // const userName = req.user.displayName || email.split("@")[0];
  res.render("verify-email", { email: maskedEmail });
});

router.post(
  "/resend-verification",
  validateSession,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.uid || req.ip }),
  async (req, res) => {
  try {
    const user = req.user;

    const email = user.email;
    const userName = user.displayName || email.split("@")[0];

    const actionCodeSettings = {
      url: "https://store.mohammed-zuhair.online/verify-email/confirm/" + email,
      handleCodeInApp: true,
    };

    const emailVerifyLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
    const emailVerify = new emailVerifyTemplate(userName, emailVerifyLink);
    await sendEmail(email, emailVerify);
    res.status(200).json({ success: true, message: "Verification email sent!" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: "An error occurred. Please try again later." });
  }
});

router.get("/verify-email/confirm/:email", async (req, res) => {
  const uid = req.uid;
  const email = req.params.email;
  if (!uid) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  if (req.user.email !== email) {
    return res.status(400).json({ success: false, error: "Invalid email" });
  }
  try {
    await admin.auth().updateUser(uid, { emailVerified: true });
    res.redirect("/profile");
  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).json({ success: false, error: "An error occurred. Please try again later." });
  }
});

module.exports = router;
