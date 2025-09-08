const cart = JSON.parse(localStorage.getItem("cart")) || [];
const coupon = JSON.parse(localStorage.getItem("coupon"));
console.log(coupon);
const checkoutData = JSON.parse(sessionStorage.getItem("checkoutData")) || [];
const currency = document.cookie
  .split("; ")
  .find((row) => row.startsWith("currency="))
  ?.split("=")[1];

// First check for out-of-stock items
async function checkStockStatus() {
  if (!cart || cart.length === 0) return cart;

  const outOfStockItems = [];
  const updatedCart = [...cart];
  const missingCustomerFieldItems = [];

  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    try {
      const response = await fetch(`/api/product/${item.productId}`);
      if (!response.ok) continue;

      const productData = await response.json();

      // Check if product is out of stock
      if (productData.stock !== undefined && productData.stock <= 0) {
        outOfStockItems.push({
          id: item.productId,
          title: item.title,
        });
        // Remove from updated cart
        const index = updatedCart.findIndex((p) => p.productId === item.productId);
        if (index !== -1) {
          updatedCart.splice(index, 1);
        }
      }

      // Attach customer field if required and stored; track missing
      if (productData.requireCustomerField) {
        const stored = sessionStorage.getItem('customerField:' + item.productId);
        let customerField = null;
        if (stored) {
          try {
            customerField = JSON.parse(stored);
          } catch (e) {
            customerField = null;
          }
        }
        if (!customerField || !customerField.value) {
          missingCustomerFieldItems.push({ id: item.productId, title: item.title });
        } else {
          const idx = updatedCart.findIndex((p) => p.productId === item.productId);
          if (idx !== -1) {
            updatedCart[idx].customerField = customerField; // { label, value }
          }
        }
      }

      // Check if discount has expired
      if (productData.discount && productData.discountEndDate) {
        const discountEndDate = new Date(productData.discountEndDate);
        const now = new Date();

        if (now > discountEndDate) {
          // Discount has expired, update to original price
          const index = updatedCart.findIndex((p) => p.productId === item.productId);
          if (index !== -1) {
            updatedCart[index].price = productData.price;
            updatedCart[index].subTotal = updatedCart[index].price * updatedCart[index].quantity;
          }
        }
      }
    } catch (error) {
      console.error(`Error checking product ${item.productId}:`, error);
    }
  }

  // If any items are out of stock, update the cart
  if (outOfStockItems.length > 0) {
    localStorage.setItem("cart", JSON.stringify(updatedCart));

    // Show notification for each out of stock item
    outOfStockItems.forEach((item) => {
      document.getElementById(
        "text"
      ).innerText += `\n"${item.title}" has been removed from your cart because it is out of stock.`;
    });

    // If cart is empty after stock check, stop the process
    if (updatedCart.length === 0) {
      document.getElementById("text").innerText = "Your cart is empty. All items were out of stock.";
      return [];
    }
  }

  // If any items are missing required customer field, redirect to fill it
  if (missingCustomerFieldItems.length > 0) {
    const first = missingCustomerFieldItems[0];
    document.getElementById("text").innerText = `Additional info is required for "${first.title}". Redirecting...`;
    setTimeout(() => {
      window.location.assign(`/product/${first.id}/customer-field?next=${encodeURIComponent('/payment')}`);
    }, 800);
    return [];
  }

  return updatedCart;
}

// Check stock status first, then proceed with payment
checkStockStatus().then((updatedCart) => {
  if (updatedCart.length === 0) {
    return; // Stop if cart is empty
  }

  fetch("/payment/info", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      products: updatedCart,
      checkoutData,
      coupon,
      currency,
    }),
  })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        localStorage.removeItem("cart");
        localStorage.removeItem("coupon");
        sessionStorage.removeItem("checkoutData");
        document.getElementById("text").innerText = "Redirecting to payment gateway...";
        setTimeout(() => {
          window.location.href = `/payment/${data.uid}/${data.transactionId}`;
        }, 1000);
        console.log(data);
      }
    });
});
// {"city":"Agami","country":"EG","phone":"565656","name":"egfdgd","paymentMethod":"binance"}
