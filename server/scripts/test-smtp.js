require('dotenv').config();
const nodemailer = require('nodemailer');

(async () => {
  const cfg = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  };

  console.log('Testing SMTP with config:', {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    user: cfg.auth.user,
    passDefined: Boolean(cfg.auth.pass),
  });

  try {
    const transporter = nodemailer.createTransport(cfg);
    const res = await transporter.verify();
    console.log('SMTP verify success:', res);
    process.exit(0);
  } catch (err) {
    console.error('SMTP verify failed:', err && (err.response || err.message || err));
    console.error('Full error:', err);
    process.exit(1);
  }
})();
