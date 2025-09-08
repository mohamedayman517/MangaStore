const { admin } = require("../utils/firebase");

const checkActivateAccount = async (req, res, next) => {
  const session = req.cookies.session;
  if (!session) {
    return res.redirect("/login?message=Session has expired, please relogin");
  }
  try {
    const decodedClaims = await admin.auth().verifySessionCookie(session, true);
    const user = await admin.auth().getUser(decodedClaims.uid);

    if (user.emailVerified) {
      next();
    } else {
      return res.redirect("/verify-email");
    }
  } catch (error) {
    console.error(error);
    res.redirect("/login?message=Session has expired, please relogin");
  }
};

module.exports = checkActivateAccount;
