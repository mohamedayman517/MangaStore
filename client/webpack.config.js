const path = require("path");

module.exports = {
  entry: {
    googleLogin: "./public/js/google-login.js",
  },

  output: {
    filename: "[name].bundle.js",
    path: path.resolve(__dirname, "public/js/dist"),
    clean: true,
  },
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  // In CI/production we want a one-off build so the phase exits
  watch: false,
};
