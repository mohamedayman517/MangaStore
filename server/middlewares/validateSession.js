const { admin } = require("../utils/firebase");

// Middleware to validate user session
const validateSession = async (req, res, next) => {
  const sessionCookie = req.cookies.session;
  if (!sessionCookie) return res.redirect("/login?message=Session has expired, please relogin");

  try {
    let decodedToken = await admin.auth().verifySessionCookie(sessionCookie, true);
    const currentTime = Math.floor(Date.now() / 1000);
    const tokenExpiryTime = decodedToken.exp * 1000;
    //  Refresh session ONLY if it's about to expire (less than 24 hours left)
    if (tokenExpiryTime - currentTime < 60 * 60 * 24) {
      const newIdToken = await admin.auth().createCustomToken(decodedToken.uid);
      const newSessionCookie = await admin
        .auth()
        .createSessionCookie(newIdToken, { expiresIn: 60 * 60 * 24 * 7 * 1000 });

      res.cookie("session", newSessionCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 7 * 1000, // 7 days
      });

      decodedToken = await admin.auth().verifySessionCookie(newSessionCookie, true);
    }

    // const user = await admin.auth().getUser(decodedToken.uid);

    req.user = decodedToken;
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error("Session verification failed:", error);
    res.redirect("/login?message=Session has expired, please relogin");
  }
};

module.exports = validateSession;
