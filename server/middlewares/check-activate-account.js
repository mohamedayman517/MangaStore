// routes/auth.js
const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
app.use(cookieParser());

const { admin } = require("../utils/firebase");

const checkActivateAccount = async (req, res, next) => {
  const session = req.cookies.session;
  if (!session) {
    return res.redirect("/login?message=Session has expired, please relogin");
  }
  try {
    const decodedClaims = await admin.auth().verifySessionCookie(session, true);
    const user = await admin.auth().getUser(decodedClaims.uid);

    if (!user.emailVerified) {
      next();
    } else {
      res.redirect("/profile");
    }
  } catch (error) {
    console.error(error);
    res.redirect("/login?message=Session has expired, please relogin");
  }
};

module.exports = checkActivateAccount;
