const express = require("express");
const router = express.Router();
const { verifyAndDecodeEmail, suppress } = require("../utils/suppression");

router.get('/unsubscribe', async (req, res) => {
  try {
    const { e, t } = req.query;
    const email = verifyAndDecodeEmail(e, t);
    if (!email) {
      return res.status(400).render('error', { title: 'Invalid link', message: 'Invalid unsubscribe token', statusCode: 400 });
    }
    await suppress(email, 'unsubscribe_link');
    return res.render('message', { title: 'Unsubscribed', message: 'You have been unsubscribed from marketing emails.' });
  } catch (err) {
    console.error('Unsubscribe error:', err);
    return res.status(500).render('error', { title: 'Server Error', message: 'Failed to unsubscribe.', statusCode: 500 });
  }
});

module.exports = router;
