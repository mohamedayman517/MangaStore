const express = require("express");
const router = express.Router();
const { sendEmail } = require("../utils/mailer");

function isAllowed(req) {
  const enabled = String(process.env.SMTP_DEBUG_ENABLE || "false").toLowerCase() === "true";
  if (!enabled) return false;
  const secret = process.env.SMTP_DEBUG_SECRET || "";
  if (!secret) return true; // no secret set -> allow when enabled
  const provided = req.headers["x-debug-secret"] || req.query.secret || req.body?.secret;
  return String(provided) === String(secret);
}

router.get("/debug/smtp-verify", async (req, res) => {
  if (!isAllowed(req)) return res.status(403).json({ success: false, message: "Forbidden" });
  try {
    // Send a very lightweight email to verify pipeline end-to-end without depending on transporter.verify
    const to = req.query.to || process.env.SMTP_USER;
    const template = {
      subject: "SMTP Verify (Ping)",
      getTemplate() {
        return `<p>SMTP verify ping from Manga Store at ${new Date().toISOString()}</p>`;
      },
      getText() {
        return `SMTP verify ping at ${new Date().toISOString()}`;
      },
    };
    const info = await sendEmail(to, template);
    return res.json({ success: true, messageId: info?.messageId, response: info?.response || "ok", to });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || String(e) });
  }
});

router.post("/debug/send-test", async (req, res) => {
  if (!isAllowed(req)) return res.status(403).json({ success: false, message: "Forbidden" });
  try {
    const { to, subject, html, text } = req.body || {};
    if (!to) return res.status(400).json({ success: false, message: "Missing 'to'" });
    const template = {
      subject: subject || "Test Email from Manga Store",
      getTemplate() {
        return html || `<p>This is a test email sent at ${new Date().toISOString()}</p>`;
      },
      getText() {
        return text || `This is a test email sent at ${new Date().toISOString()}`;
      },
    };
    const info = await sendEmail(to, template);
    return res.json({ success: true, messageId: info?.messageId, response: info?.response || "ok", to });
  } catch (e) {
    return res.status(500).json({ success: false, message: e?.message || String(e) });
  }
});

module.exports = router;
