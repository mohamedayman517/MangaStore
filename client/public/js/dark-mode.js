if (localStorage.getItem("theme") === "dark") {
  document.documentElement.classList.add("dark"); // Apply dark mode
}

document.addEventListener("DOMContentLoaded", function () {
  const toggleSwitch = document.getElementById("toggle");
  localStorage.getItem("theme") === "dark" ? (toggleSwitch.checked = true) : (toggleSwitch.checked = false);

  // Toggle dark mode on checkbox change
  toggleSwitch.addEventListener("change", () => {
    if (toggleSwitch.checked) {
      document.documentElement.classList.add("dark"); // Apply dark mode
      localStorage.setItem("theme", "dark"); // Save dark mode preference
    } else {
      document.documentElement.classList.remove("dark"); // Remove dark mode
      localStorage.setItem("theme", "light"); // Save light mode preference
    }
  });

  document.getElementById("theme-toggle-button").addEventListener("click", function () {
    document.getElementById("toggle").checked ? toggleDarkMode(false) : toggleDarkMode(true);
  });
});

// Function to toggle dark mode
function toggleDarkMode(bool) {
  if (bool) {
    if (document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  } else {
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }
}
