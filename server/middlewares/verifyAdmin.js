const admin = require("../config/firebase-admin");
const { decryptData } = require("../utils/cryptoHelper");

const verifyAdmin = async (req, res, next) => {
  try {
    const sessionCookie = req.cookies.session;
    const wantsJSON = req.xhr || (req.get('accept') || '').includes('application/json');

    if (!sessionCookie) {
      return wantsJSON
        ? res.status(401).json({ success: false, error: 'Unauthorized: missing session' })
        : res.redirect("/login");
    }

    const decodedClaims = await admin.auth().verifySessionCookie(sessionCookie, true);
    const user = await admin.auth().getUser(decodedClaims.uid);
    const userData = await admin.firestore().collection("users").doc(user.uid).get();
    const customClaims = user.customClaims || {};
    
    // Check if user is admin or moderator
    if (
      (customClaims.role === "admin" && decryptData(userData.data().role) === "admin") ||
      (customClaims.role === "moderator" && decryptData(userData.data().role) === "moderator")
    ) {
      req.user = decodedClaims;
      next();
    } else {
      return wantsJSON
        ? res.status(403).json({ success: false, error: "Forbidden: insufficient permissions" })
        : res.status(403).render("error", {
            title: "Access Denied",
            message: "You don't have permission to access this page.",
            statusCode: 403,
          });
    }
  } catch (error) {
    console.error("Admin verification error:", error);
    const wantsJSON = req.xhr || (req.get('accept') || '').includes('application/json');
    return wantsJSON
      ? res.status(401).json({ success: false, error: 'Unauthorized' })
      : res.redirect("/login");
  }
};

module.exports = verifyAdmin;

