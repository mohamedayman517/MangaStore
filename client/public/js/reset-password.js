document.getElementById("resetForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;

  try {
    const response = await fetch("/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email }),
    });

    if (response.ok) {
      location.href = "/login?message=Reset instructions sent to your email!";
    } else {
      errorAlert("Error sending reset instructions. Please try again.");
    }
  } catch (error) {
    console.error("Error:", error);
    errorAlert("An error occurred. Please try again later.");
  }
});
