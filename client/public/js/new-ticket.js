import { animateBtns } from "./inputs-functions.js";

document.addEventListener("DOMContentLoaded", function () {
  const fileInput = document.getElementById("file");
  const emailInput = document.getElementById("email");
  const nameInput = document.getElementById("name");
  const categorySelect = document.getElementById("category");
  const descriptionInput = document.getElementById("description");
  const submitButton = document.getElementById("submitButton");
  const fileList = document.getElementById("fileList");
  const subjectInput = document.getElementById("subject");

  fileInput.addEventListener("change", handleFileSelect);
  submitButton.addEventListener("click", handleSubmit);

  function handleFileSelect(event) {
    const files = event.target.files;
    fileList.innerHTML = "";

    if (files.length > 5) {
      errorAlert("You can upload a maximum of 5 files.");
      fileInput.value = "";
      return;
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 5 * 1024 * 1024) {
        errorAlert("Each file must be less than 5 MB.");
        fileInput.value = "";
        return;
      }

      const listItem = document.createElement("li");
      listItem.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      fileList.appendChild(listItem);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitButton.disabled = true;
    animateBtns.loadingBtnActive();

    const name = nameInput.value;
    const email = emailInput.value;
    const issueCategory = categorySelect.value;
    const description = descriptionInput.value;
    const files = fileInput.files;
    const subject = subjectInput.value;

    if (name.length < 4) {
      errorAlert("Please enter a valid name.");
      submitButton.disabled = false;
      animateBtns.loadingBtnDisable();
      return;
    }

    if (!validateEmail(email)) {
      errorAlert("Please enter a valid email address.");
      submitButton.disabled = false;
      animateBtns.loadingBtnDisable();
      return;
    }

    if (!issueCategory) {
      errorAlert("Please select a category.");
      submitButton.disabled = false;
      animateBtns.loadingBtnDisable();
      return;
    }

    if (!description) {
      errorAlert("Please enter a description.");
      submitButton.disabled = false;
      animateBtns.loadingBtnDisable();
      return;
    }

    if (!subject) {
      errorAlert("Please enter subject");
      submitButton.disabled = false;
      animateBtns.loadingBtnDisable();
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("email", email);
    formData.append("issueCategory", issueCategory);
    formData.append("description", description);
    formData.append("subject", subject);

    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
    }

    // Send data to backend endpoint
    fetch("/support/ticket/open-ticket", {
      method: "POST",
      body: formData,
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          submitButton.disabled = false;
          animateBtns.loadingBtnDisable();
          successAlert(data.message);
          window.location.href = "/support/tickets";
        } else {
          submitButton.disabled = false;
          animateBtns.loadingBtnDisable();
          errorAlert(data.message);
        }
      })
      .catch((error) => {
        submitButton.disabled = false;
        animateBtns.loadingBtnDisable();
        errorAlert("An error occurred. Please try again.");
        console.error("Error:", error);
      });
  }

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
});
