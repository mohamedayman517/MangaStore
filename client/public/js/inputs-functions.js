function showPassStrength() {
  passInfo.style.maxHeight = "120px";
  passInfo.style.opacity = "1";
  passInfo.style.padding = "8px";
  passInfo.style.marginBottom = "12px";
}
function hidePassStrength() {
  passInfo.style.maxHeight = "0";
  passInfo.style.opacity = "0";
  passInfo.style.padding = "0";
  passInfo.style.marginBottom = "0";
}

// Button animations
const submitBtn = document.querySelector("#submitButton");
export const animateBtns = {
  loadingBtnDisable: function loadingBtnDisable() {
    document.querySelector("#submitButton .btnWord").classList.remove("hidden");
    document.querySelector("#submitButton .loaderBtn").classList.remove("active");
    submitBtn.disabled = false;
  },

  loadingBtnActive: function loadingBtnActive() {
    document.querySelector("#submitButton .btnWord").classList.add("hidden");
    document.querySelector("#submitButton .loaderBtn").classList.add("active");
    submitBtn.disabled = true;
  },

  initAnimations: function inptsAnimuation() {
    const eyeIcons = document.querySelectorAll(".eye_icon");

    // Ensure that the eye icons are present
    if (eyeIcons.length > 0) {
      eyeIcons.forEach((eye) => {
        eye.addEventListener("click", () => {
          const parent = eye.closest(".input__container");
          if (!parent) return;
          const input = parent.querySelector("input");
          if (!input) return;
          input.type = input.type === "password" ? "text" : "password";
          eye.classList.toggle("fa-eye-slash");
          eye.classList.toggle("fa-eye");
        });
      });
    }
    // Inputs animations
    const inputs = document.querySelectorAll(".input");

    function focusFunc() {
      const parent = this.parentNode;
      parent.classList.add("focus");
    }

    function blurFunc() {
      const parent = this.parentNode;
      if (this.value === "") {
        parent.classList.remove("focus");
      }
    }

    inputs.forEach((input) => {
      input.addEventListener("focus", focusFunc);
      input.addEventListener("blur", blurFunc);
      if (input.value.trim() !== "") {
        const parent = input.parentNode;
        parent.classList.add("focus");
      }
    });
  },
};

export const validation = {
  checkEmail: async function checkEmail(email) {
    const emailRegex = /^[\w\.-]+@[a-zA-Z\d\.-]+\.[a-zA-Z]{2,}$/;
    if (emailRegex.test(email)) {
      return true;
    } else {
      return false;
    }
  },
  validateNum: async function validateNum(number) {
    if (number && number.length >= 8) {
      return true;
    } else {
      return false;
    }
  },
  checkPasswordStrength: async function checkPasswordStrength(password) {
    const minLength = 8;
    const hasLowercase = /[a-z]/.test(password);
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*]/.test(password);

    let strength = 0;
    const minLengthEl = document.getElementById("minLength");
    if (minLengthEl) {
      strength++;
      minLengthEl.style.color = password.length >= minLength ? "green" : "red";
    }

    hasLowercase ? strength++ : strength--;
    if (hasUppercase) {
      strength++;
      document.getElementById("capitalChar").style.color = "green";
    } else {
      strength--;
      document.getElementById("capitalChar").style.color = "red";
    }
    if (hasNumber) {
      strength++;
      document.getElementById("haveNum").style.color = "green";
    } else {
      document.getElementById("haveNum").style.color = "red";
      strength--;
    }
    if (hasSpecialChar) {
      strength++;
      document.getElementById("specialChar").style.color = "green";
    } else {
      strength--;
      document.getElementById("specialChar").style.color = "red";
    }

    switch (strength) {
      case 5:
        hidePassStrength();
        return true;
      case 4:
        showPassStrength();
        return false;
      case 3:
        showPassStrength();
        return false;
      case 2:
        showPassStrength();
        return false;
      default:
        showPassStrength();
        return false;
    }
  },
};
