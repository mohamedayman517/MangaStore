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
  mode: "production",
  watch: true,
};
