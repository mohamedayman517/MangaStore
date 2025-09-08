import { animateBtns, validation } from "./inputs-functions.js";
animateBtns.initAnimations();

document.addEventListener("DOMContentLoaded", () => {
  // Disable form auto submittion
  document.querySelectorAll("form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
    });
  });
  // Validate and change user data
  const userName = document.getElementById("name");
  const userPhone = document.getElementById("phoneNumber");
  const userEmail = document.getElementById("email");
  const userCountry = document.getElementById("countryCode");
  const img = document.getElementById("profile-img");
  const imgContainer = document.getElementById("imgContainer");
  const imgSrc = document.getElementById("profile-img").src;
  const imgInput = document.getElementById("profile-input");
  const removeImg = document.getElementById("removeImg");

  imgContainer.addEventListener("click", () => {
    imgInput.click();
  });

  removeImg.addEventListener("click", () => {
    img.src = imgSrc;
    imgInput.value = "";
    removeImg.classList.add("hidden");
  });

  imgInput.addEventListener("change", (e) => {
    removeImg.classList.remove("hidden");
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  const submitBtn = document.getElementById("save-changes");
  submitBtn.addEventListener("click", async () => {
    submitBtn.innerHTML = `<span class="loaderBtn active"></span>`;
    submitBtn.disabled = true;
    const newName = document.getElementById("name").value;
    const newEmail = document.getElementById("email").value;
    const newPhone = document.getElementById("phoneNumber").value;
    const newCountry = document.getElementById("countryCode").value;

    if (newName === "" || newEmail === "" || newPhone === "" || newCountry === "") {
      warnAlert("Please fill all fields");
      return;
    }

    if (
      newName == userName.value &&
      newEmail == userEmail.value &&
      newPhone == userPhone.value &&
      newCountry == userCountry.value &&
      imgInput.files.length === 0
    ) {
      submitBtn.innerHTML = `Save Changes`;
      submitBtn.disabled = false;
      warnAlert("No changes made");
      return;
    }

    const formData = new FormData();
    formData.append("name", userName.value);
    formData.append("email", userEmail.value);
    formData.append("phoneNumber", userPhone.value);
    formData.append("countryCode", userCountry.value);
    formData.append("photo", imgInput.files[0]);

    const data = Object.fromEntries(formData.entries());

    if (data.phoneNumber.startsWith("0")) {
      data.phoneNumber = `${data.phoneNumber.slice(1)}`;
    } else {
      data.phoneNumber = `${data.phoneNumber}`;
    }

    fetch("/update-profile", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          submitBtn.innerHTML = `Save Changes`;
          submitBtn.disabled = false;
          errorAlert(data.error);
        } else {
          successAlert("Profile updated successfully");
          window.location.reload();
        }
      })
      .catch((err) => {
        submitBtn.innerHTML = `Save Changes`;
        submitBtn.disabled = false;
        console.error(err);
        errorAlert(`An error occurred, please try again \n${err}`);
      });
  });

  // Update password
  const updatePasswordBtn = document.getElementById("update-password-btn");
  updatePasswordBtn.addEventListener("click", async () => {
    const currentPassword = document.getElementById("current-password").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmNewPassword = document.getElementById("conf-new-pass").value;

    if (currentPassword === "" || newPassword === "" || confirmNewPassword === "") {
      warnAlert("Please fill all fields");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      warnAlert("Passwords do not match");
      return;
    }

    await validation.checkPasswordStrength(newPassword).then(async (res) => {
      if (!res) {
        warnAlert("Password must be at least 8 characters long");
        return;
      }
      await validation.checkPasswordStrength(currentPassword).then(async (res) => {
        if (!res) {
          errorAlert("Wrong password");
          return;
        }
        fetch("/update-password", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmNewPassword,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.error) {
              errorAlert(data.error);
            } else {
              successAlert("Password updated successfully");
              window.location.reload();
            }
          })
          .catch((err) => {
            console.error(err);
            errorAlert(`An error occurred, please try again \n${err}`);
          });
      });
    });
  });

  const newPass = document.querySelector("#newPassword");
  const confirmPass = document.querySelector("#conf-new-pass");
  const passInfo = document.getElementById("passInfo");
  const passConfirmInfo = document.getElementById("passConfirmInfo");
  const currentPassword = document.getElementById("current-password");

  // Check password strength validate, then enable button
  (async () => {
    let score = { currentPassword: 0, newPass: 0, confirmPass: 0 };
    const updatePasswordBtn = document.getElementById("update-password-btn");

    function checkScore() {
      if (score.currentPassword && score.newPass && score.confirmPass) {
        updatePasswordBtn.disabled = false;
      } else {
        updatePasswordBtn.disabled = true;
      }
    }

    currentPassword.addEventListener("keyup", async () => {
      (function checkPasswordStrength(password) {
        const minLength = 8;
        const hasLowercase = /[a-z]/.test(password);
        const hasUppercase = /[A-Z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*]/.test(password);
        if (hasLowercase && hasUppercase && hasNumber && hasSpecialChar && password.length >= minLength) {
          score.currentPassword = 1;
          checkScore();
          return true;
        } else {
          checkScore();
          return false;
        }
      })(currentPassword.value);
    });

    newPass.addEventListener("keyup", () => {
      validation.checkPasswordStrength(newPass.value).then((res) => {
        if (res) {
          score.newPass = 1;
        } else {
          score.newPass = 0;
        }
        checkScore();
      });
    });

    confirmPass.addEventListener("keyup", async () => {
      passConfirm(confirmPass.value).then((res) => {
        if (res) {
          score.confirmPass = 1;
        } else {
          score.confirmPass = 0;
        }
        checkScore();
      });
    });
  })();

  function addErrInputValueColor(input) {
    input.classList.remove("text-black", "border-black");
    input.classList.add("text-red-600", "border-red-600");
    input.focus();
  }
  function removeErrInputValueColor(input) {
    input.classList.remove("text-red-600", "border-red-600");
    input.classList.add("text-black", "border-black");
  }

  newPass.addEventListener("focus", () => {
    validation.checkPasswordStrength(newPass.value);
  });
  newPass.addEventListener("blur", () => {
    validation.checkPasswordStrength(newPass.value);
  });
  confirmPass.addEventListener("focus", () => {
    passConfirm(confirmPass.value);
  });
  confirmPass.addEventListener("blur", () => {
    passConfirm(confirmPass.value);
  });

  document.querySelector("#email").addEventListener("keyup", () => {
    validation.checkEmail(document.querySelector("#email").value).then((res) => {
      if (res) {
        removeErrInputValueColor(document.querySelector("#email"));
      }
    });
  });
  document.querySelector("#name").addEventListener("keyup", () => {
    document.querySelector("#name").value.length >= 4
      ? removeErrInputValueColor(document.querySelector("#name"))
      : null;
  });
  document.querySelector("#phoneNumber").addEventListener("keyup", () => {
    document.querySelector("#phoneNumber").value.length >= 6
      ? removeErrInputValueColor(document.querySelector("#phoneNumber"))
      : null;
  });

  function showPassConfirm() {
    passConfirmInfo.style.maxHeight = "40px";
    passConfirmInfo.style.opacity = "1";
    passConfirmInfo.style.padding = "8px";
    passConfirmInfo.style.marginBottom = "12px";
  }
  function hidePassConfirm() {
    passConfirmInfo.style.maxHeight = "0";
    passConfirmInfo.style.opacity = "0";
    passConfirmInfo.style.padding = "0";
    passConfirmInfo.style.marginBottom = "0";
  }
  async function passConfirm(confirmPassword) {
    const passValue = newPass.value;
    if (passValue == confirmPassword) {
      hidePassConfirm();
      return true;
    } else {
      showPassConfirm();
      return false;
    }
  }
});
