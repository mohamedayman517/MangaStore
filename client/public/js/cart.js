window.cart = window.cart || {
  getCart: function getCart() {
    const cartJson = localStorage.getItem("cart");
    return cartJson ? JSON.parse(cartJson) : [];
  },

  saveCart: function saveCart(cartItems) {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  },

  clearCart: function clearCart() {
    localStorage.removeItem("cart");
    this.updateCartIcon();
  },

  updateCartIcon: function updateCartIcon() {
    const cartItems = this.getCart();
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const cartIcon = document.querySelector("#cart-counter");

    if (cartIcon) {
      cartIcon.textContent = totalItems > 0 ? totalItems : 0;
    }
  },

  checkDiscountExpiration: async function checkDiscountExpiration() {
    const cartItems = this.getCart();
    const now = new Date();
    let updated = false;

    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      try {
        // Fetch current product data to check if discount is still valid
        const response = await fetch(`/api/product/${item.productId}`);
        if (!response.ok) continue;

        const productData = await response.json();

        // Check if product is out of stock
        if (productData.stock !== undefined && productData.stock <= 0) {
          // Remove item from cart
          cartItems.splice(i, 1);
          i--; // Adjust index after removal
          updated = true;
          continue;
        }

        // Check if discount has expired by comparing dates
        if (productData.endDate) {
          const discountEndDate = new Date(productData.endDate);

          if (now > discountEndDate) {
            // Discount has expired, update to original price
            // Use the original price from the API response
            item.price = productData.bfDiscount || productData.price;
            item.subTotal = item.price * item.quantity;

            updated = true;
          }
        }
      } catch (error) {
        console.error(`Error checking product ${item.productId}:`, error);
      }
    }

    if (updated) {
      this.saveCart(cartItems);
      this.updateCartIcon();
    }

    return updated;
  },

  addToCart: async function addToCart({ productId, title, price, img, quantity = 1, description, currency = "EG" }) {
    if (!productId || !title) {
      console.error("Missing required product information");
      throw new Error("Missing required product information");
    }

    const cookieCurrency =
      document.cookie
        .split("; ")
        .find((row) => row.startsWith("currency="))
        ?.split("=")[1] || "EG";

    const cartItems = this.getCart();
    const existingItem = cartItems.find((item) => item.productId === productId);
    let availableStock = 0;

    // Fetch current product data to check if discount is still valid and get stock
    try {
      const response = await fetch(`/api/product/${productId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch product data: ${response.status}`);
      }

      const productData = await response.json();

      // Get available stock
      availableStock = productData.stock !== undefined ? productData.stock : Number.POSITIVE_INFINITY;

      // Check if product is out of stock
      if (availableStock <= 0) {
        throw new Error("Sorry, this product is out of stock.");
      }

      // Check if adding this quantity would exceed available stock
      const currentQuantity = existingItem ? existingItem.quantity : 0;
      if (currentQuantity + quantity > availableStock) {
        throw new Error(
          `Sorry, you can only add ${
            availableStock - currentQuantity
          } more of this item. (${availableStock} available in stock)`
        );
      }

      // Check if discount has expired
      if (productData.discount && productData.discountEndDate) {
        const discountEndDate = new Date(productData.discountEndDate);
        const now = new Date();

        if (now > discountEndDate) {
          // Discount has expired, use original price
          price = productData.price;
        }
      }
    } catch (error) {
      console.error("Error fetching product data:", error);
      throw error;
    }

    // Store the original price without conversion - the price is already in the correct currency
    // from the product API, so we don't need to convert it again
    const productPrice = price;

    if (existingItem) {
      existingItem.quantity += quantity;
      existingItem.subTotal = existingItem.quantity * existingItem.price;
    } else {
      cartItems.push({
        productId,
        title,
        price: productPrice,
        quantity,
        img,
        subTotal: productPrice * quantity,
        description,
        currency: cookieCurrency, // Store the current currency
        availableStock: availableStock, // Store available stock for reference
      });
    }

    this.saveCart(cartItems);
    this.updateCartIcon();
    try { if (typeof successAlert === 'function') successAlert('Product added to cart'); } catch (_) {}
    return { success: true };
  },

  removeFromCart: function removeFromCart(productId) {
    let cartItems = this.getCart();
    cartItems = cartItems.filter((item) => item.productId !== productId);
    this.saveCart(cartItems);
    this.updateCartIcon();
    try { if (typeof successAlert === 'function') successAlert('Removed from cart'); } catch (_) {}
  },

  incrementQuantity: async function incrementQuantity(productId) {
    const cartItems = this.getCart();
    const item = cartItems.find((product) => product.productId === productId);

    if (item) {
      // Check current stock before incrementing
      try {
        const response = await fetch(`/api/product/${productId}`);
        if (response.ok) {
          const productData = await response.json();
          const availableStock = productData.stock !== undefined ? productData.stock : Number.POSITIVE_INFINITY;

          if (item.quantity >= availableStock) {
            alert(`Sorry, you cannot add more of this item. Maximum available stock (${availableStock}) reached.`);
            return;
          }
        }
      } catch (error) {
        console.error("Error checking product stock:", error);
      }

      // If we get here, we can increment
      item.quantity += 1;
      item.subTotal = item.quantity * item.price;
      this.saveCart(cartItems);
      this.updateCartIcon();
    }
  },

  decrementQuantity: function decrementQuantity(productId) {
    const cartItems = this.getCart();
    const item = cartItems.find((item) => item.productId === productId);
    if (item) {
      item.quantity -= 1;
      if (item.quantity <= 0) {
        this.removeFromCart(productId);
      } else {
        item.subTotal = item.quantity * item.price;
        this.saveCart(cartItems);
        this.updateCartIcon();
      }
    }
  },

  convertCurrency: async function convertCurrency(amount, fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return amount; // No conversion needed

    let exchangeRate = 1;
    try {
      const response = await fetch(`/exchange-rate/US`);
      const data = await response.json();
      exchangeRate = data.exchangeRate;

      // If converting from EG to US, divide by exchange rate
      if (fromCurrency === "EG" && toCurrency === "US") {
        return (amount / exchangeRate).toFixed(2);
      }
      // If converting from US to EG, multiply by exchange rate
      else if (fromCurrency === "US" && toCurrency === "EG") {
        return (amount * exchangeRate).toFixed(2);
      }
    } catch (error) {
      console.error("Failed to fetch exchange rate:", error);
      return amount; // Return original amount if conversion fails
    }

    return amount; // Return original amount if currencies don't match expected values
  },

  // New method to update cart items currency
  updateCartCurrency: async function updateCartCurrency(newCurrency) {
    const cartItems = this.getCart();
    if (cartItems.length === 0) return;

    let exchangeRate = 1;
    try {
      const response = await fetch(`/exchange-rate/US`);
      const data = await response.json();
      exchangeRate = data.exchangeRate;
    } catch (error) {
      console.error("Failed to fetch exchange rate:", error);
      return; // Exit if we can't get the exchange rate
    }

    let updated = false;

    // Update each item's currency and price
    for (const item of cartItems) {
      if (item.currency !== newCurrency) {
        // Convert price based on currency direction
        if (item.currency === "EG" && newCurrency === "US") {
          // Convert from EGP to USD
          item.price = item.price / exchangeRate;
        } else if (item.currency === "US" && newCurrency === "EG") {
          // Convert from USD to EGP
          item.price = item.price * exchangeRate;
        }

        // Update subtotal and currency
        item.subTotal = item.price * item.quantity;
        item.currency = newCurrency;
        updated = true;
      }
    }

    if (updated) {
      this.saveCart(cartItems);
    }
  },
};

async function renderCartModal() {
  if (document.querySelector(".cartSlide")) {
    document.querySelector(".cartSlide").remove();
  }

  // Check for expired discounts and out-of-stock items
  await window.cart.checkDiscountExpiration();

  const cookieCurrency =
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("currency="))
      ?.split("=")[1] || "EG";
  console.log("cookieCurrency", cookieCurrency);

  // Update cart items to match the current cookie currency
  await window.cart.updateCartCurrency(cookieCurrency);

  // Get updated cart after currency conversion
  const products = window.cart.getCart();

  // Handle empty cart
  if (products.length === 0) {
    const emptyCartModal = `<div class="cartSlide relative" style="z-index: 60;" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
    <div class="fixed inset-0 bg-secondary-dark/75 dark:bg-secondary-dark/75 transition-opacity" aria-hidden="true"></div>
    <div class="fixed inset-0 overflow-hidden">
      <div class="absolute inset-0 overflow-hidden">
        <div class="pointer-events-none fixed top-14 right-0 flex max-w-full md:pl-10 h-5/6 min-h-full">
          <div class="pointer-events-auto w-screen max-w-md">
            <div class="flex h-full flex-col overflow-y-scroll bg-background-light dark:bg-background-dark shadow-xl">
              <div class="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div class="flex items-start justify-between">
                  <h2 class="text-lg font-medium text-text-light dark:text-text-dark" id="slide-over-title">Shopping cart</h2>
                  <div class="ml-3 flex h-7 items-center">
                      <button type="button" class="relative -m-2 p-2 text-text-light dark:text-text-dark hover:text-primary-light dark:hover:text-primary-dark">
                        <span class="absolute -inset-0.5 continue-shopping-btn"></span>
                        <span class="sr-only continue-shopping-btn2">Close panel</span>
                        <svg class="size-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div class="mt-8">
                    <p class="text-center text-text-light dark:text-text-dark">Your cart is currently empty.</p>
                  </div>
                </div>
                  <p>
                      <button type="button" class="continue-shopping-btn font-medium text-primary-light dark:text-primary-dark hover:text-accent-light dark:hover:text-accent-dark">
                        Continue Shopping
                        <span aria-hidden="true"> &rarr;</span>
                      </button>
                    </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML("beforeend", emptyCartModal);
    return; // Exit early if cart is empty
  }

  // Generate product list dynamically
  const currencySymbol = cookieCurrency === "US" ? "$" : "L.E";

  const productList = products
    .map((product) => {
      return `<li class="flex py-6">
        <div class="size-24 shrink-0 overflow-hidden rounded-md border border-secondary-light dark:border-secondary-dark">
          <a href="/view/product/${product.productId}" ><img src="${product.img}" alt="${
        product.title
      }" class="size-full object-cover"></a>
        </div>

        <div class="ml-4 flex flex-1 flex-col">
          <div>
            <div class="flex justify-between text-base font-medium text-text-light dark:text-text-dark">
              <h3>
                <a href="/view/product/${
                  product.productId
                }" class="hover:text-primary-light dark:hover:text-primary-dark line-clamp-2">${product.title}</a>
              </h3>
              <p class="ml-4">${Number(product.price).toFixed(2)} ${currencySymbol}</p>
            </div>
            <p class="mt-1 text-sm text-secondary-light dark:text-secondary-dark line-clamp-2">${
              product.description || "No description available"
            }</p>
          </div>
          <div class="flex flex-1 items-end justify-between text-sm mt-2">
            <div class="flex items-center space-x-2">
              <button data-id="${
                product.productId
              }" type="button" class="decrement-btn bg-background-light dark:bg-background-dark border-2 border-secondary-light dark:border-secondary-dark px-3 py-1 rounded-md text-text-light dark:text-text-dark hover:bg-secondary-light/20 dark:hover:bg-secondary-dark/20 font-bold">-</button>
              <p class="text-text-light dark:text-text-dark">${Number(product.quantity)}</p>
              <button data-id="${
                product.productId
              }" type="button" class="increment-btn bg-background-light dark:bg-background-dark border-2 border-secondary-light dark:border-secondary-dark px-3 py-1 rounded-md text-text-light dark:text-text-dark hover:bg-secondary-light/20 dark:hover:bg-secondary-dark/20 font-bold">+</button>
            </div>
            <div class="flex">
              <button data-id="${
                product.productId
              }" type="button" class="remove-btn font-medium text-accent-light dark:text-accent-dark hover:text-primary-light dark:hover:text-primary-dark">Remove</button>
            </div>
          </div>
        </div>
      </li>`;
    })
    .join("");

  // Calculate subtotal directly
  const subtotal = products.reduce((total, product) => total + product.price * product.quantity, 0);
  console.log("subtotal", subtotal, currencySymbol);

  // Modal template
  const cartModal = `<div class="cartSlide relative" style="z-index: 60;" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
    <div class="fixed inset-0 bg-secondary-dark/75 transition-opacity" aria-hidden="true"></div>

    <div class="fixed inset-0 overflow-hidden">
      <div class="absolute inset-0 overflow-hidden">
        <div class="pointer-events-none fixed top-14 right-0 flex max-w-full md:pl-10 max-h-full min-h-full">
          <div class="pointer-events-auto w-screen max-w-md">
            <div class="flex h-full flex-col overflow-y-scroll bg-background-light dark:bg-background-dark shadow-xl">
              <div class="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
                <div class="flex items-start justify-between">
                  <h2 class="text-lg font-medium text-text-light dark:text-text-dark" id="slide-over-title">Shopping cart</h2>
                  <div class="ml-3 flex h-7 items-center">
                    <button type="button" class="relative -m-2 p-2 text-text-light dark:text-text-dark hover:text-primary-light dark:hover:text-primary-dark">
                      <span class="absolute -inset-0.5 continue-shopping-btn"></span>
                      <span class="sr-only">Close panel</span>
                      <svg class="size-6" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="mt-8">
                  <div class="flow-root">
                    <ul role="list" class="-my-6 divide-y divide-secondary-light dark:divide-secondary-dark">${productList}</ul>
                  </div>
                </div>
              </div>

              <div class="border-t border-secondary-light dark:border-secondary-dark px-4 py-6 sm:px-6">
                <div class="flex justify-between text-base font-medium text-text-light dark:text-text-dark">
                  <p>Subtotal</p>
                  <p>${Number(subtotal).toFixed(2)} ${currencySymbol}</p>
                </div>
                <p class="mt-0.5 text-sm text-secondary-light dark:text-secondary-dark">Shipping and taxes calculated at checkout.</p>
                <div class="mt-6">
                  <a href="/checkout" class="flex items-center justify-center rounded-md border border-transparent bg-primary-light dark:bg-primary-dark px-6 py-3 text-base font-medium text-background-light dark:text-background-dark shadow-sm hover:bg-primary-light/80 dark:hover:bg-primary-dark/80">Checkout</a>
                </div>
                <div class="mt-6 flex justify-center text-center text-sm text-secondary-light dark:text-secondary-dark">
                  <p>
                    or
                    <button type="button" class="continue-shopping-btn font-medium text-primary-light dark:text-primary-dark hover:text-accent-light dark:hover:text-accent-dark">
                      Continue Shopping
                      <span aria-hidden="true"> &rarr;</span>
                    </button>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  // Append modal to the DOM
  document.body.insertAdjacentHTML("beforeend", cartModal);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Initialize cart icon
  window.cart.updateCartIcon();

  // Check for expired discounts on page load
  await window.cart.checkDiscountExpiration();

  // Check if currency cookie has changed and update cart items if needed
  const cookieCurrency =
    document.cookie
      .split("; ")
      .find((row) => row.startsWith("currency="))
      ?.split("=")[1] || "EG";

  // Update cart items to match the current cookie currency
  await cart.updateCartCurrency(cookieCurrency);

  // Global event delegation for all cart-related buttons
  document.body.addEventListener("click", async (event) => {
    // Handle cart icon click
    if (event.target.closest("#cart-icon")) {
      event.preventDefault();
      await renderCartModal();
    }

    // Handle "Add to Cart" buttons
    if (event.target.closest(".addToCartBtn")) {
      event.preventDefault();
      const button = event.target.closest(".addToCartBtn");
      const productCard = button.closest(".card") || button.closest("[data-id]");

      if (productCard) {
        const productId = productCard.getAttribute("data-id");
        const title = productCard.getAttribute("data-title");
        const price = Number.parseFloat(productCard.getAttribute("data-price"));
        const img = productCard.getAttribute("data-img");
        const description = productCard.getAttribute("data-description") || "";
        const quantity = 1;

        try {
          await window.cart.addToCart({
            productId,
            title,
            price,
            img,
            quantity,
            description,
          });

          successAlert("Product added to cart");

          // Render cart modal
          await renderCartModal();
        } catch (error) {
          console.error("Error adding to cart:", error);
          if (typeof errorAlert === "function") {
            errorAlert(error.message || "Failed to add product to cart");
          } else {
            alert(error.message || "Failed to add product to cart");
          }
        }
      }
    }

    // Handle "Remove from Cart" buttons
    if (event.target.classList.contains("remove-btn")) {
      const productId = event.target.dataset.id;
      window.cart.removeFromCart(productId);
      await renderCartModal();
    }

    // Handle "Increment Quantity" buttons
    if (event.target.classList.contains("increment-btn")) {
      const productId = event.target.dataset.id;
      await window.cart.incrementQuantity(productId);
      await renderCartModal();
    }

    // Handle "Decrement Quantity" buttons
    if (event.target.classList.contains("decrement-btn")) {
      const productId = event.target.dataset.id;
      window.cart.decrementQuantity(productId);
      await renderCartModal();
    }

    // Handle "Close Cart" buttons
    if (
      event.target.classList.contains("continue-shopping-btn") ||
      event.target.classList.contains("continue-shopping-btn2")
    ) {
      const cartSlide = document.querySelector(".cartSlide");
      if (cartSlide) {
        cartSlide.remove();
      }
    }
  });

  // Set up periodic stock checking (every 5 minutes)
  setInterval(async () => {
    await window.cart.checkDiscountExpiration();
  }, 5 * 60 * 1000);

  // Listen for currency changes
  const currencyObserver = new MutationObserver(async (mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "cookie") {
        const cookieCurrency =
          document.cookie
            .split("; ")
            .find((row) => row.startsWith("currency="))
            ?.split("=")[1] || "EG";

        // Update cart items to match the new currency
        await window.cart.updateCartCurrency(cookieCurrency);
      }
    }
  });

  // Observe document for cookie changes
  currencyObserver.observe(document, { attributes: true });
});
