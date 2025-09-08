document.addEventListener("DOMContentLoaded", () => {
  const toggleCurrencyBtn = document.getElementById("currency-toggle");

  // Utility function to get cookie value
  function getCookie(name) {
    const cookies = document.cookie.split("; ");
    for (let cookie of cookies) {
      const [key, value] = cookie.split("=");
      if (key === name) return decodeURIComponent(value);
    }
    return "EG"; // Default to EGP
  }

  // Utility function to set a cookie
  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${date.toUTCString()}; path=/`;
  }

  // Handle currency toggle click
  toggleCurrencyBtn.addEventListener("click", () => {
    const currentCurrency = getCookie("currency") === "EG" ? "US" : "EG";
    setCookie("currency", currentCurrency, 7); // Store for 7 days
    location.reload(); // Refresh the page to apply new currency
  });
});
const currencyCookie = document.cookie.split("; ").find((row) => row.startsWith("currency="));
const currency = currencyCookie ? currencyCookie.split("=")[1] : "EG"; // Default to EGP if cookie not found
(async () => {
  if (currency === "US") {
    await fetch("/api/countries/flags/US")
      .then((res) => res.json())
      .then((data) => {
        document.querySelector("#currency-flag").src = data.flag;
      });
  } else {
    await fetch("/api/countries/flags/EG")
      .then((res) => res.json())
      .then((data) => {
        document.querySelector("#currency-flag").src = data.flag;
      });
  }
})();
