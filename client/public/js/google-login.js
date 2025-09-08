import { auth } from "./auth.js";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";

// Google Login Button
document.getElementById("googleLoginBtn").addEventListener("click", function () {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider)
    .then(async (result) => {
      const user = result.user;
      const idToken = await user.getIdToken();

      fetch("/auth/google", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ idToken: idToken }),
      })
        .then((response) => response.json())
        .then((data) => {
          successAlert("Authenticated successfully");
          document.cookie = "isLoggedIn=true; path=/";
          location.replace("/profile");
        })
        .catch((error) => {
          console.error("Error:", error);
          errorAlert(`${error.message}`);
        });
    })
    .catch((error) => {
      const errorMessage = error.message;
      console.error(errorMessage);
      errorAlert(`${errorMessage}`);
    });
});
