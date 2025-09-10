#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sendEmail } = require('../utils/mailer');

(async () => {
  try {
    const to = process.env.SMTP_TEST_TO || process.env.SMTP_USER;
    if (!to) {
      console.error('Missing SMTP_TEST_TO or SMTP_USER in env');
      process.exit(2);
    }
    const template = {
      subject: 'SMTP Test - Manga Store',
      getTemplate() {
        return `<p>SMTP test sent at ${new Date().toISOString()}</p>`;
      },
      getText() {
        return `SMTP test sent at ${new Date().toISOString()}`;
      },
    };
    const info = await sendEmail(to, template);
    console.log('SMTP test sent:', { to, messageId: info?.messageId, response: info?.response || 'ok' });
    process.exit(0);
  } catch (e) {
    console.error('SMTP test failed:', e?.message || e);
    process.exit(1);
  }
})();
