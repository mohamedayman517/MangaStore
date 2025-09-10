require("dotenv").config();
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const { isSuppressed, buildUnsubLink } = require("./suppression");

// Build transporter dynamically so we can retry with different settings if needed
function buildTransport(opts = {}) {
  const base = {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true", // true for 465, false for 587 (STARTTLS)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Reasonable production-friendly defaults
    pool: String(process.env.SMTP_POOL || "true").toLowerCase() === "true",
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS) || 1,
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES) || 50,
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 15000,
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS) || 10000,
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS) || 20000,
    requireTLS: String(process.env.SMTP_REQUIRE_TLS || "true").toLowerCase() === "true",
    // Prefer IPv4 to avoid IPv6 routing issues on some providers
    dnsResolvePrefer: process.env.SMTP_DNS_RESOLVE_PREFER || "ipv4",
    family: Number(process.env.SMTP_FAMILY) || 0, // 4 forces IPv4, 6 forces IPv6, 0 = auto
    logger: String(process.env.SMTP_DEBUG || "false").toLowerCase() === "true",
    debug: String(process.env.SMTP_DEBUG || "false").toLowerCase() === "true",
    tls: {
      // Helps with some providers behind proxies; does not lower security
      servername: process.env.SMTP_HOST || undefined,
      minVersion: "TLSv1.2",
      // Allow opt-out of strict validation for debugging only
      rejectUnauthorized: String(process.env.SMTP_TLS_REJECT_UNAUTHORIZED || "true").toLowerCase() === "true",
    },
  };

  // Optional DKIM configuration for custom domain sending
  if (
    process.env.SMTP_DKIM_DOMAIN &&
    process.env.SMTP_DKIM_SELECTOR &&
    process.env.SMTP_DKIM_PRIVATE_KEY
  ) {
    base.dkim = {
      domainName: process.env.SMTP_DKIM_DOMAIN,
      keySelector: process.env.SMTP_DKIM_SELECTOR,
      privateKey: process.env.SMTP_DKIM_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  return nodemailer.createTransport({ ...base, ...opts });
}

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
    // Primary attempt: whatever is configured in env
    const primaryTransporter = buildTransport();
    const info = await primaryTransporter.sendMail(mailOptions);
    // console.log("✅ Email sent:", info.response);
    return info;
  } catch (error) {
    // If platform blocks SMTPS (465), retry with STARTTLS (587)
    const isTimeout = (error && (error.code === "ETIMEDOUT" || /timed?\s*out/i.test(String(error.message)))) || false;
    const wasPort465 = Number(process.env.SMTP_PORT) === 465 || String(process.env.SMTP_SECURE || "").toLowerCase() === "true";

    if (isTimeout && wasPort465) {
      try {
        const fallbackHost = process.env.SMTP_HOST;
        const fallback = buildTransport({ port: 587, secure: false, tls: { servername: fallbackHost, minVersion: "TLSv1.2" } });
        const info = await fallback.sendMail(mailOptions);
        return info;
      } catch (fallbackErr) {
        console.error("❌ SMTP fallback (587 STARTTLS) failed:", fallbackErr);
        throw fallbackErr;
      }
    }

    console.error("❌ Error sending email:", error);
    throw error;
  }
};

module.exports = { sendEmail };
