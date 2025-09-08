require('dotenv').config();
const { sendEmail } = require('../utils/mailer');
const { WelcomeTemplate, ReviewRequestTemplate } = require('../templates');

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--to') out.to = args[++i];
    else if (a === '--type') out.type = args[++i];
    else if (a === '--order') out.orderId = args[++i];
    else if (a === '--name') out.name = args[++i];
  }
  return out;
}

(async () => {
  try {
    const { to, type = 'welcome', orderId = 'TEST1234', name = 'Friend' } = parseArgs();
    if (!to) {
      console.error('Usage: node scripts/send-test-email.js --to <email> [--type welcome|review] [--order ORDER_ID] [--name NAME]');
      process.exit(1);
    }

    let template;
    if (type === 'review') {
      template = new ReviewRequestTemplate({ orderId, items: [{ title: 'Sample Product 1' }, { title: 'Sample Product 2' }, { title: 'Sample Product 3' }], name });
    } else {
      template = new WelcomeTemplate({ name });
    }

    const res = await sendEmail(to, template);
    console.log('Email send result:', res);
    process.exit(0);
  } catch (err) {
    console.error('Failed to send test email:', err && (err.response || err.message || err));
    console.error('Full error:', err);
    process.exit(1);
  }
})();
