const express = require("express");

const router = express.Router();

router.get("/logout", (req, res) => {
  const cookieOpts = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  };

  // Clear backend auth cookies
  res.clearCookie("session", cookieOpts);
  res.clearCookie("token", cookieOpts);

  // Clear frontend UI helper cookie if present
  res.clearCookie("isLoggedIn", { path: "/" });

  // Redirect to home
  res.redirect("/");
});

module.exports = router;
