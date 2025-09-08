async function syncCartWithBackend(userId) {
  const cart = getCart();

  try {
    const response = await fetch("/api/sync-cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, cart }),
    });

    if (!response.ok) {
      errorAlert("Failed to sync cart");
      throw new Error("Failed to sync cart");
    }
  } catch (error) {
    errorAlert("Failed to sync cart");
    console.error("Error syncing cart:", error);
  }
}
