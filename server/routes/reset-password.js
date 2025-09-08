// routes/auth.js
const express = require("express");
const { admin } = require("../utils/firebase");
const router = express.Router();
const cookieParser = require("cookie-parser");
const app = express();
app.use(cookieParser());
const { sendEmail } = require("../utils/mailer");
const ResetPasswordTemplate = require("../templates/resetPasswordTemplate");
const { strictRateLimit } = require("../middlewares/rateLimit");

const loginCheck = require("../middlewares/login-register-check");

async function generateResetPasswordLink(userEmail) {
  try {
    // Generate reset password link
    const resetLink = await admin.auth().generatePasswordResetLink(userEmail, {
      url: "https://store.mohammed-zuhair.online/login", // Optional: Redirect after reset
      handleCodeInApp: true, // If using email action handler in-app
    });

    // console.log("Password reset link:", resetLink);

    // Send reset link to user via email (using an email service)
    // Example: Send via Nodemailer, SendGrid, or Firebase Functions

    return resetLink;
  } catch (error) {
    console.error("Error generating reset link:", error);
    throw error;
  }
}

// Login Page
router.get("/reset-password", loginCheck, (req, res) => {
  res.render("reset-password");
});

router.post(
  "/reset-password",
  loginCheck,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 50 }),
  async (req, res) => {
  try {
    const email = req.body.email;
    // Get user record from Firebase Auth using the email
    const userRecord = await admin.auth().getUserByEmail(email);
    const userName = userRecord.displayName || email.split("@")[0]; // Fallback to email prefix if no display name
    // await sendPasswordResetEmail(frontAuth, email);
    const resetLink = await generateResetPasswordLink(email);
    const resetPassTemplate = new ResetPasswordTemplate(userName, resetLink);
    await sendEmail(email, resetPassTemplate);
    res.status(200).json({ success: true, message: "Reset instructions sent to your email!" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: "An error occurred. Please try again later." });
  }
});

module.exports = router;
