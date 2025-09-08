require("dotenv").config();
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const { isSuppressed, buildUnsubLink } = require("./suppression");

// Create a transporter using SMTP settings from environment variables
const transporterOptions = {
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: String(process.env.SMTP_SECURE).toLowerCase() === "true", // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

// Optional DKIM configuration for custom domain sending
if (
  process.env.SMTP_DKIM_DOMAIN &&
  process.env.SMTP_DKIM_SELECTOR &&
  process.env.SMTP_DKIM_PRIVATE_KEY
) {
  transporterOptions.dkim = {
    domainName: process.env.SMTP_DKIM_DOMAIN,
    keySelector: process.env.SMTP_DKIM_SELECTOR,
    privateKey: process.env.SMTP_DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}

const transporter = nodemailer.createTransport(transporterOptions);

/**
 * Send an email using a template instance
 * @param {string} to - Recipient email address
 * @param {BaseTemplate} templateInstance - An instance of a template class
 * @returns {Promise<void>}
 */
const sendEmail = async (to, templateInstance) => {
  const fromName = process.env.SMTP_FROM_NAME || "Manga Store 🥭";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  // Honor suppression list for marketing-like templates
  if (await isSuppressed(to)) {
    return { suppressed: true };
  }

  const html = templateInstance.getTemplate();
  const text = typeof templateInstance.getText === "function"
    ? templateInstance.getText()
    : String(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const unsubLink = buildUnsubLink(to);

  // Inline attachments (e.g., logo) if requested via cid in template
  const attachments = [];
  if (String(html).includes("cid:mango-logo")) {
    const logoPath = path.join(__dirname, "..", "public", "icons", "mango_144x144.png");
    if (fs.existsSync(logoPath)) {
      attachments.push({
        filename: "mango_144x144.png",
        path: logoPath,
        cid: "mango-logo",
      });
    }
  }

  const mailOptions = {
    from: `${fromName} <${fromEmail}>`,
    to,
    subject: templateInstance.subject,
    html,
    text,
    replyTo: process.env.SMTP_REPLY_TO || undefined,
    headers: {
      "List-Unsubscribe": `<${unsubLink}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    attachments: attachments.length ? attachments : undefined,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    // console.log("✅ Email sent:", info.response);
    return info;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
};

module.exports = { sendEmail };
