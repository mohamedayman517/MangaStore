// routes/auth.js
const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
app.use(cookieParser());

const { admin } = require("../utils/firebase");

async function checkLogin(req, res, next) {
  try {
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return next();
    }
    const checkToken = await admin.auth().verifySessionCookie(sessionCookie, true);
    if (checkToken) {
      return res.redirect("/profile");
    }

    return res.redirect("/profile");
  } catch (error) {
    console.error(error);
    next();
  }
}

module.exports = checkLogin;
