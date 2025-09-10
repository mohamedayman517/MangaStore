import { animateBtns, validation } from "./inputs-functions.js";
animateBtns.initAnimations();
document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const formData = new FormData();
  document.querySelectorAll(".input").forEach((input) => {
    formData.append(input.id, input.value);
  });

  const data = Object.fromEntries(formData.entries()); // Convert to object
  console.log("Data:", data);

  if (data.phoneNumber.startsWith("0")) {
    data.phoneNumber = `${data.phoneNumber.slice(1)}`; // Remove leading zero
  } else {
    data.phoneNumber = `${data.phoneNumber}`;
  }

  data.countryCode = document.querySelector("#countryCode").value;

  await validateForm(data);
});

(function removeFirstZero() {
  document.querySelector("#phoneNumber").addEventListener("blur", () => {
    if (document.querySelector("#phoneNumber").value.startsWith("0")) {
      document.querySelector("#phoneNumber").value = document.querySelector("#phoneNumber").value.slice(1);
    }
  });
})();

async function validateForm(data) {
  if (data.password !== data.confirmPassword) {
    addErrInputValueColor(document.querySelector("#confirmPassword"));
    errorAlert("Passwords do not match");
    return;
  }
  if (data.name.length < 4) {
    addErrInputValueColor(document.querySelector("#name"));
    errorAlert("Name must be at least 4 characters long");
    return;
  } else {
    removeErrInputValueColor(document.querySelector("#name"));
  }

  await validation.validateNum(data.phoneNumber).then(async (res) => {
    if (res) {
      removeErrInputValueColor(document.querySelector("#phoneNumber"));
      await validation.checkEmail(data.email).then(async (res) => {
        if (res) {
          removeErrInputValueColor(document.querySelector("#email"));
          await validation.checkPasswordStrength(data.password).then(async (res) => {
            if (res) {
              removeErrInputValueColor(document.querySelector("#password"));
              await passConfirm(data.confirmPassword).then(async (res) => {
                if (res) {
                  removeErrInputValueColor(document.querySelector("#confirmPassword"));
                  if (document.querySelector('input[name="gender"]:checked')) {
                    data.gender = document.querySelector('input[name="gender"]:checked').value;
                    animateBtns.loadingBtnActive();
                    fetch("/register", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(data),
                    })
                      .then(async (res) => {
                        if (!res.ok) {
                          if (res.status === 429) {
                            const retryAfter = Number(res.headers.get("Retry-After") || 60);
                            throw new Error(`Too many requests. Try again after ${retryAfter} seconds.`);
                          }
                          const ct = res.headers.get("content-type") || "";
                          const payload = ct.includes("application/json") ? await res.json() : { message: await res.text() };
                          throw new Error(payload.message || "Registration failed");
                        }
                        return res.json();
                      })
                      .then((data) => {
                        if (!data.success) {
                          animateBtns.loadingBtnDisable();
                          errorAlert(data.message);
                        } else {
                          animateBtns.loadingBtnDisable();
                          successAlert(data.message);
                          sessionStorage.setItem("isLoggedIn", true);
                          setTimeout(() => {
                            location.href = "/verify-email";
                          }, 300);
                        }
                      })
                      .catch((err) => {
                        animateBtns.loadingBtnDisable();
                        errorAlert(err.message || "Registration failed");
                      });
                  } else {
                    errorAlert("Please select gender");
                    return;
                  }
                } else {
                  addErrInputValueColor(document.querySelector("#confirmPassword"));
                  errorAlert("Passwords do not match");
                }
              });
            } else {
              addErrInputValueColor(document.querySelector("#password"));
              errorAlert(
                "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character"
              );
            }
          });
        } else {
          addErrInputValueColor(document.querySelector("#email"));
          errorAlert("Invalid email");
        }
      });
    } else {
      addErrInputValueColor(document.querySelector("#phoneNumber"));
      errorAlert("Phone number must be at least 8 characters long");
    }
  });
}

function addErrInputValueColor(input) {
  input.classList.remove("text-black", "border-black");
  input.classList.add("text-red-600", "border-red-600");
  input.focus();
}
function removeErrInputValueColor(input) {
  input.classList.remove("text-red-600", "border-red-600");
  input.classList.add("text-black", "border-black");
}

const passwordField = document.querySelector("#password");
const passInfo = document.getElementById("passInfo");
const passConfirmInfo = document.getElementById("passConfirmInfo");
passwordField.addEventListener("focus", () => {
  validation.checkPasswordStrength(document.querySelector("#password").value);
});
passwordField.addEventListener("blur", () => {
  validation.checkPasswordStrength(document.querySelector("#password").value);
});
document.querySelector("#confirmPassword").addEventListener("focus", () => {
  passConfirm(document.querySelector("#confirmPassword").value);
});
document.querySelector("#confirmPassword").addEventListener("blur", () => {
  passConfirm(document.querySelector("#confirmPassword").value);
});
document.querySelector("#password").addEventListener("keyup", () => {
  validation.checkPasswordStrength(document.querySelector("#password").value).then((res) => {
    if (res) {
      removeErrInputValueColor(document.querySelector("#password"));
    }
  });
});
document.querySelector("#confirmPassword").addEventListener("keyup", async () => {
  passConfirm(document.querySelector("#confirmPassword").value).then((res) => {
    if (res) {
      removeErrInputValueColor(document.querySelector("#confirmPassword"));
    }
  });
});
document.querySelector("#email").addEventListener("keyup", () => {
  validation.checkEmail(document.querySelector("#email").value).then((res) => {
    if (res) {
      removeErrInputValueColor(document.querySelector("#email"));
    }
  });
});
document.querySelector("#name").addEventListener("keyup", () => {
  document.querySelector("#name").value.length >= 4 ? removeErrInputValueColor(document.querySelector("#name")) : null;
});
document.querySelector("#phoneNumber").addEventListener("keyup", () => {
  document.querySelector("#phoneNumber").value.length >= 8
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
hidePassConfirm();
async function passConfirm(confirmPassword) {
  const passValue = document.querySelector("#password").value;
  if (passValue == confirmPassword) {
    hidePassConfirm();
    return true;
  } else {
    showPassConfirm();
    return false;
  }
}

function showPassStrength() {
  passInfo.style.maxHeight = "120px";
  passInfo.style.opacity = "1";
  passInfo.style.padding = "8px";
  passInfo.style.marginBottom = "12px";
}
(function hidePassStrength() {
  passInfo.style.maxHeight = "0";
  passInfo.style.opacity = "0";
  passInfo.style.padding = "0";
  passInfo.style.marginBottom = "0";
})();
