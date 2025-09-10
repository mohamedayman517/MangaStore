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
  const maskEmail = (email) => email.replace(/^(.{5}).*(@.*)$/i, "$1*****$2");

  const email = req.user.email;
  // console.log("Email:", email);
  const maskedEmail = maskEmail(email);

  const uid = req.uid || (req.user && (req.user.uid || req.user.user_id));
  res.render("verify-email", { email: maskedEmail, uid });
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
    const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3200}`;
    const actionCodeSettings = {
      url: `${baseUrl.replace(/\/$/, "")}/profile`,
      handleCodeInApp: true,
    };

    try {
      const emailVerifyLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
      const emailVerify = new emailVerifyTemplate(userName, emailVerifyLink);
      const info = await sendEmail(email, emailVerify);
      console.log("Verification email dispatch:", info && (info.response || info.messageId || "ok"));
      return res.status(200).json({ success: true, message: "Verification email sent!" });
    } catch (e) {
      const rawMsg = e?.message || "";
      const errCode = (e?.errorInfo?.code || e?.code || "").toString().toLowerCase();
      const msg = rawMsg.toLowerCase();
      if (msg.includes("too_many_attempts_try_later")) {
        // Respect Firebase throttle; advise client to wait
        res.setHeader("Retry-After", "300");
        return res.status(429).json({ success: false, message: "Too many attempts. Please try again in a few minutes." });
      }
      if (
        msg.includes("unauthorized-continue-uri") ||
        msg.includes("domain not allowlisted by project") ||
        errCode.includes("unauthorized-continue-uri")
      ) {
        try {
          const link = await admin.auth().generateEmailVerificationLink(email);
          const emailVerify = new emailVerifyTemplate(userName, link);
          const info2 = await sendEmail(email, emailVerify);
          console.log("Verification email fallback dispatch:", info2 && (info2.response || info2.messageId || "ok"));
          return res.status(200).json({ success: true, message: "Verification email sent!" });
        } catch (e2) {
          console.error("Resend verification fallback failed:", e2?.message || e2);
        }
      } else {
        console.error("Resend verification failed:", rawMsg || e);
      }
      const message = rawMsg || "Failed to generate verification link. Please try again later.";
      return res.status(400).json({ success: false, message });
    }
  } catch (error) {
    console.error("Error:", error?.message || error);
    res.status(500).json({ success: false, message: "An error occurred. Please try again later." });
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
