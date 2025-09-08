import { animateBtns } from "./inputs-functions.js";
document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("ticketForm");
  const messageInput = document.getElementById("message");
  const fileInput = document.getElementById("fileInput");
  const endpoint = location.pathname;

  // document.getElementById("fileInput").addEventListener("click", function () {
  //   fileInput.click();
  // });

  fileInput.addEventListener("change", function () {
    const fileList = document.getElementById("fileList");
    fileList.innerHTML = ""; // Clear previous file list
    const files = fileInput.files;
    if (files.length > 5) {
      errorAlert("You can upload a maximum of 5 files.");
      fileInput.value = "";
      animateBtns.loadingBtnDisable();
      submitButton.disabled = false;
      return;
    }

    for (let i = 0; i < files.length; i++) {
      if (files[i].size > 5 * 1024 * 1024) {
        errorAlert(`File ${files[i].name} exceeds the maximum size of 5MB.`);
        animateBtns.loadingBtnDisable();
        submitButton.disabled = false;
        return;
      }
    }

    for (let i = 0; i < files.length; i++) {
      const fileItem = document.createElement("li");
      fileItem.textContent = `${files[i].name} (${(files[i].size / 1024 / 1024).toFixed(2)} MB)`;
      fileList.appendChild(fileItem);
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    animateBtns.loadingBtnActive();
    submitButton.disabled = true;

    const files = fileInput.files;

    // Validate message input
    if (!messageInput.value.trim()) {
      errorAlert("Message is required.");
      animateBtns.loadingBtnDisable();
      return;
    }

    // Prepare form data
    const formData = new FormData();
    formData.append("message", messageInput.value);
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    // Send POST request
    fetch(endpoint, {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          successAlert(data.message);
          setTimeout(() => {
            animateBtns.loadingBtnDisable();
            submitButton.disabled = false;
            window.location.reload();
          }, 2000);
        } else {
          animateBtns.loadingBtnDisable();
          submitButton.disabled = false;
          errorAlert(data.message || "An error occurred.");
        }
      })
      .catch((err) => {
        animateBtns.loadingBtnDisable();
        submitButton.disabled = false;
        errorAlert(err.message || "An error occurred.");
      });
  });
});
