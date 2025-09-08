class Checkout {
  constructor() {
    // Cart data
    this.cartData = JSON.parse(localStorage.getItem("cart")) || [];
    console.log(this.cartData);

    this.currency = this.getCurrencyFromCookie() || "EG";
    this.exchangeRate = 1; // Default to 1 until fetched

    this.appliedCoupon = null;
    this.redeemPoints = 0; // cashback points to redeem (integer)

    // Check if there's a saved coupon in localStorage
    const savedCoupon = localStorage.getItem("coupon");
    if (savedCoupon) {
      try {
        this.appliedCoupon = JSON.parse(savedCoupon);
      } catch (error) {
        console.error("Error parsing saved coupon:", error);
        localStorage.removeItem("coupon");
      }
    }

    // DOM Elements
    this.elements = {
      orderSummary: document.getElementById("order-summary"),
      subtotal: document.getElementById("subtotal-amount"),
      tax: document.getElementById("taxAmount"),
      total: document.getElementById("total-amount"),
      coupon: {
        name: document.getElementById("couponName"),
        input: document.getElementById("couponCode"),
        value: document.getElementById("couponValue"),
        applyButton: document.getElementById("applyCoupon"),
        removeButton: document.getElementById("removeCouponButton"),
      },
      cashback: {
        availableEl: document.getElementById("cashback-available"),
        input: document.getElementById("redeemPoints"),
        applyButton: document.getElementById("applyCashback"),
        error: document.getElementById("cashbackError"),
        value: document.getElementById("cashbackValue"),
      },
      suggested: {
        container: document.getElementById("suggested-coupons"),
        list: document.getElementById("suggested-coupons-list"),
      },
      paymentMethods: document.querySelectorAll('input[name="payment-method"]'),
      goToPaymentBtn: document.getElementById("goToPayment"),
    };

    // Gift flag from server-rendered DOM
    const giftFlag = document.getElementById("giftFlag");
    this.isGift = giftFlag?.dataset?.gift === "1";

    // Tax rates for different payment methods
    this.paymentMethodTaxRates = {
      VodafoneCash: { amount: 0.01, type: "percentage" },
      telda: { amount: 5, type: "fixed" },
      bybit: { amount: 0, type: "percentage" },
      binance: { amount: 0, type: "percentage" },
      instapay: { amount: 0, type: "percentage" },
    };

    // Initialize
    this.init();
  }

  getCurrencyFromCookie() {
    const match = document.cookie.match(/(?:^|;\s*)currency=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  async init() {
    await this.fetchExchangeRate();
    // Ensure cart items are in the correct currency
    await this.updateCartItemsCurrency();
    this.updateCartDisplay();
    this.updateOrderSummary();
    // Fetch and render suggested coupons for current cart
    this.fetchAndRenderSuggestedCoupons();
    this.setupEventListeners();
  }

  getCartProductIds() {
    if (!Array.isArray(this.cartData)) return [];
    return this.cartData.map((i) => i.productId).filter(Boolean);
  }

  async fetchAndRenderSuggestedCoupons() {
    try {
      const productIds = this.getCartProductIds();
      if (!productIds.length) {
        if (this.elements.suggested?.container) this.elements.suggested.container.classList.add("hidden");
        return;
      }

      const resp = await fetch("/api/coupons/applicable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds }),
      });
      if (!resp.ok) throw new Error("Failed to fetch applicable coupons");
      const data = await resp.json();
      if (!data.success || !Array.isArray(data.coupons)) {
        if (this.elements.suggested?.container) this.elements.suggested.container.classList.add("hidden");
        return;
      }

      const coupons = data.coupons;
      if (!coupons.length) {
        if (this.elements.suggested?.container) this.elements.suggested.container.classList.add("hidden");
        return;
      }

      // Render chips
      const chips = coupons
        .map((c) => {
          const label = c.type === "percentage" ? `${c.name} • ${c.amount}%` : `${c.name} • ${Number(c.amount).toFixed(0)}`;
          return `<button type=\"button\" class=\"suggested-coupon text-xs px-2 py-1 rounded-full bg-secondary-light/20 dark:bg-secondary-dark/30 hover:bg-primary-light/20 dark:hover:bg-primary-dark/20 transition\" data-code=\"${c.name}\">${label}</button>`;
        })
        .join(" ");

      if (this.elements.suggested?.list) this.elements.suggested.list.innerHTML = chips;
      if (this.elements.suggested?.container) this.elements.suggested.container.classList.remove("hidden");
    } catch (err) {
      console.error("Error loading suggested coupons:", err);
      if (this.elements.suggested?.container) this.elements.suggested.container.classList.add("hidden");
    }
  }

  async fetchExchangeRate() {
    if (this.currency === "US") {
      try {
        const response = await fetch("/exchange-rate/US");
        const data = await response.json();
        if (data.exchangeRate) {
          this.exchangeRate = data.exchangeRate;
          console.log("Exchange rate fetched:", this.exchangeRate);
          this.updateOrderSummary(); // Recalculate after updating exchange rate
        }
      } catch (error) {
        console.error("Failed to fetch exchange rate:", error);
      }
    }
  }

  async updateCartItemsCurrency() {
    // This method ensures all cart items are in the current currency
    if (!this.cartData || this.cartData.length === 0) return;

    let updated = false;

    for (const item of this.cartData) {
      if (item.currency !== this.currency) {
        // Convert price based on currency direction
        if (item.currency === "EG" && this.currency === "US") {
          // Convert from EGP to USD
          item.price = item.price / this.exchangeRate;
        } else if (item.currency === "US" && this.currency === "EG") {
          // Convert from USD to EGP
          item.price = item.price * this.exchangeRate;
        }

        // Update subtotal and currency
        item.subTotal = item.price * item.quantity;
        item.currency = this.currency;
        updated = true;
      }
    }

    if (updated) {
      localStorage.setItem("cart", JSON.stringify(this.cartData));
    }
  }

  setupEventListeners() {
    this.elements.coupon.applyButton.addEventListener("click", () => {
      this.applyCoupon();
    });

    this.elements.coupon.removeButton.addEventListener("click", () => {
      this.removeCoupon();
    });

    this.elements.paymentMethods.forEach((radio) => {
      radio.addEventListener("change", () => {
        this.updateTotalWithSelectedPaymentMethod();
      });
    });

    this.elements.goToPaymentBtn.addEventListener("click", () => {
      this.goToPayment();
    });

    // Cashback: apply button
    if (this.elements.cashback.applyButton && this.elements.cashback.input) {
      this.elements.cashback.applyButton.addEventListener("click", () => {
        this.applyCashback();
      });
      this.elements.cashback.input.addEventListener("input", () => {
        // Clear previous error as user types
        if (this.elements.cashback.error) {
          this.elements.cashback.error.classList.add("hidden");
          this.elements.cashback.error.textContent = "";
        }
      });
    }

    // Apply suggested coupon via event delegation
    if (this.elements.suggested?.list) {
      this.elements.suggested.list.addEventListener("click", (e) => {
        const btn = e.target.closest(".suggested-coupon");
        if (!btn) return;
        const code = btn.dataset.code;
        if (!code) return;
        if (this.elements.coupon.input) {
          this.elements.coupon.input.value = code;
          this.applyCoupon();
        }
      });
    }

    // Listen for currency changes
    document.addEventListener("cookieChange", async () => {
      const newCurrency = this.getCurrencyFromCookie();
      if (newCurrency !== this.currency) {
        this.currency = newCurrency;
        await this.fetchExchangeRate();
        await this.updateCartItemsCurrency();
        this.updateCartDisplay();
        this.updateOrderSummary();
      }
    });
  }

  updateCartDisplay() {
    if (!this.cartData || this.cartData.length === 0) {
      this.elements.orderSummary.innerHTML = "<p>Your cart is empty.</p>";
      return;
    }

    let cartHTML = "";
    const currencySymbol = this.currency === "US" ? "$" : "L.E";

    this.cartData.forEach((item) => {
      cartHTML += `
        <div class="cart-item">
          <span>${item.title} x ${item.quantity}</span>
          <span>${Number(item.price).toFixed(2)} ${currencySymbol}</span>
        </div>
      `;
    });

    this.elements.orderSummary.innerHTML = cartHTML;
  }

  calculateSubtotal() {
    if (!this.cartData || this.cartData.length === 0) return 0;

    let subtotal = 0;
    this.cartData.forEach((item) => {
      subtotal += item.price * item.quantity;
    });

    return subtotal;
  }

  updateOrderSummary() {
    const subtotal = this.calculateSubtotal();
    this.elements.subtotal.textContent = subtotal.toFixed(2);

    // Calculate discount
    const couponDiscount = this.calculateDiscount(subtotal);
    let discountedAmount = subtotal - couponDiscount;

    // Cashback discount from points (valued in EGP; convert to USD if needed for display)
    const cashbackDiscountEGP = this.calculateCashbackDiscountEGP();
    const cashbackDiscountDisplay = this.currency === "US" ? cashbackDiscountEGP / this.exchangeRate : cashbackDiscountEGP;
    if (this.elements.cashback?.value) this.elements.cashback.value.textContent = (cashbackDiscountDisplay || 0).toFixed(2);
    discountedAmount -= cashbackDiscountDisplay;

    // Update coupon value display
    if (this.appliedCoupon && this.elements.coupon.value) {
      if (this.appliedCoupon.type === "fixed") {
        const couponValue =
          this.currency === "US"
            ? (this.appliedCoupon.amount / this.exchangeRate).toFixed(2)
            : this.appliedCoupon.amount.toFixed(2);
        this.elements.coupon.value.textContent = couponValue;
      } else {
        this.elements.coupon.value.textContent = `${this.appliedCoupon.amount}%`;
      }
    }

    // Calculate tax based on selected payment method
    const selectedPaymentMethod = document.querySelector('input[name="payment-method"]:checked')?.id;
    let taxAmount = 0;

    if (selectedPaymentMethod && this.paymentMethodTaxRates[selectedPaymentMethod]) {
      const taxInfo = this.paymentMethodTaxRates[selectedPaymentMethod];

      if (taxInfo.type === "fixed") {
        taxAmount = this.currency === "EG" ? taxInfo.amount : taxInfo.amount / this.exchangeRate;
      } else {
        taxAmount = discountedAmount * taxInfo.amount;
      }
    }

    this.elements.tax.textContent = taxAmount.toFixed(2);

    // Calculate final total
    const total = discountedAmount + taxAmount;
    this.elements.total.textContent = total.toFixed(2);
    this.elements.total.dataset.amount = total.toFixed(2);

    // Enable payment button if a payment method is selected
    if (selectedPaymentMethod) {
      this.elements.goToPaymentBtn.disabled = false;
    }
  }

  calculateDiscount(subtotal) {
    if (!this.appliedCoupon) return 0;

    if (this.appliedCoupon.type === "fixed") {
      return this.currency === "EG" ? this.appliedCoupon.amount : this.appliedCoupon.amount / this.exchangeRate;
    } else if (this.appliedCoupon.type === "percentage") {
      return subtotal * (this.appliedCoupon.amount / 100);
    }

    return 0;
  }

  applyCoupon() {
    const couponCode = this.elements.coupon.input.value;
    if (!couponCode.trim()) {
      errorAlert("Please enter a coupon code");
      return;
    }

    fetch("/validate/coupon", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ couponCode }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          console.log("Coupon data:", data);
          this.appliedCoupon = data.data;

          // Save coupon data to localStorage for backend processing
          localStorage.setItem("coupon", JSON.stringify(this.appliedCoupon));

          // Make sure coupon name element exists before setting content
          if (this.elements.coupon.name) {
            this.elements.coupon.name.textContent = this.appliedCoupon.name || couponCode;
          }

          // Make sure coupon value element exists before setting content
          if (this.elements.coupon.value) {
            if (this.appliedCoupon.type === "fixed") {
              const couponValue =
                this.currency === "US"
                  ? (this.appliedCoupon.amount / this.exchangeRate).toFixed(2)
                  : this.appliedCoupon.amount.toFixed(2);
              this.elements.coupon.value.textContent = couponValue;
            } else {
              this.elements.coupon.value.textContent = `${this.appliedCoupon.amount}%`;
            }
          }

          this.elements.coupon.applyButton.style.display = "none";
          this.elements.coupon.removeButton.style.display = "inline-block";

          // Update order summary with the applied coupon
          this.updateOrderSummary();

          successAlert("Coupon applied successfully");
        } else {
          console.error("Error not success request:", data.error);
          errorAlert("Invalid coupon code");
        }
      })
      .catch((error) => {
        console.error("Error applying coupon:", error);
        errorAlert("Error applying coupon");
      });
  }

  removeCoupon() {
    this.appliedCoupon = null;

    // Remove coupon data from localStorage
    localStorage.removeItem("coupon");

    if (this.elements.coupon.name) this.elements.coupon.name.textContent = "";
    if (this.elements.coupon.value) this.elements.coupon.value.textContent = "0";
    if (this.elements.coupon.input) this.elements.coupon.input.value = "";

    this.elements.coupon.applyButton.style.display = "inline-block";
    this.elements.coupon.removeButton.style.display = "none";

    this.updateOrderSummary();
    successAlert("Coupon removed");
  }

  processCheckout() {
    // First check for out-of-stock items
    this.checkStockStatus().then(() => {
      const checkoutData = {
        cart: this.cartData,
        coupon: this.appliedCoupon,
      };

      fetch("/process-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(checkoutData),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.success) {
            console.log(data.data);
            this.currency = data.data.currency;
            this.exchangeRate = data.data.exchangeRate;
            this.updateOrderSummary(data.data);
            successAlert("Checkout processed successfully");
          } else {
            errorAlert("Error processing checkout");
          }
        })
        .catch((error) => {
          console.error("Error processing checkout:", error);
          errorAlert("Error processing checkout");
        });
    });
  }

  async checkStockStatus() {
    if (!this.cartData || this.cartData.length === 0) return;

    const outOfStockItems = [];
    const updatedCart = [...this.cartData];
    const missingCustomerFieldItems = [];

    for (let i = 0; i < this.cartData.length; i++) {
      const item = this.cartData[i];
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

        // Ensure customer field if required
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

    // If any items are out of stock, update the cart and show notifications
    if (outOfStockItems.length > 0) {
      localStorage.setItem("cart", JSON.stringify(updatedCart));
      this.cartData = updatedCart;

      // Show notification for each out of stock item
      outOfStockItems.forEach((item) => {
        errorAlert(`"${item.title}" has been removed from your cart because it is out of stock.`);
      });
    }

    // If any items are missing required customer field, block and redirect
    this.missingCustomerFieldItems = missingCustomerFieldItems;
    if (missingCustomerFieldItems.length > 0) {
      const first = missingCustomerFieldItems[0];
      errorAlert(`Additional info is required for "${first.title}". You will be redirected to enter it.`);
      // Give a brief delay for the alert to be visible
      setTimeout(() => {
        window.location.assign(`/product/${first.id}/customer-field?next=${encodeURIComponent('/checkout')}`);
      }, 800);
      return;
    }
  }

  async goToPayment() {
    const city = document.getElementById("city").value;
    const country = document.getElementById("country").value;
    const phone = document.getElementById("phone").value;
    const name = document.getElementById("name").value;
    const referralEmail = document.getElementById("referralEmail")?.value?.trim().toLowerCase();
    const selectedPaymentMethod = document.querySelector('input[name="payment-method"]:checked')?.id;

    // Validate inputs
    if (!city || !country || !phone || !name) {
      errorAlert("Please fill all fields");
      return;
    }

    if (!selectedPaymentMethod) {
      errorAlert("Please select a payment method");
      return;
    }

    // Optional referral email validation
    if (referralEmail) {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(referralEmail);
      if (!emailOk) {
        errorAlert("Please enter a valid referral email or leave it empty");
        return;
      }
    }

    this.elements.goToPaymentBtn.disabled = true;
    this.elements.goToPaymentBtn.innerHTML = `<div class="loaderBtn"></div>`;

    // Check stock status before proceeding
    await this.checkStockStatus();

    // If cart is empty after stock check, stop the process
    if (this.cartData.length === 0) {
      errorAlert("Your cart is empty. All items were out of stock.");
      this.elements.goToPaymentBtn.disabled = false;
      this.elements.goToPaymentBtn.innerHTML = `Go To Payment`;
      return;
    }

    // If any customer fields missing, stop the process (redirect is triggered in checkStockStatus)
    if (Array.isArray(this.missingCustomerFieldItems) && this.missingCustomerFieldItems.length > 0) {
      this.elements.goToPaymentBtn.disabled = false;
      this.elements.goToPaymentBtn.innerHTML = `Go To Payment`;
      return;
    }

    const data = {
      city,
      country,
      phone,
      name,
      paymentMethod: selectedPaymentMethod,
    };

    if (referralEmail) {
      data.referralEmail = referralEmail;
    }

    // If gifting, collect friend info and validate
    if (this.isGift) {
      const friendName = document.getElementById("friendName")?.value?.trim();
      const friendEmail = document.getElementById("friendEmail")?.value?.trim();
      const friendPhone = document.getElementById("friendPhone")?.value?.trim();
      const friendNote = document.getElementById("friendNote")?.value?.trim();

      if (!friendName) {
        errorAlert("Please enter your friend's name");
        this.elements.goToPaymentBtn.disabled = false;
        this.elements.goToPaymentBtn.innerHTML = `Go To Payment`;
        return;
      }
      if (!friendEmail && !friendPhone) {
        errorAlert("Please provide at least friend's email or phone");
        this.elements.goToPaymentBtn.disabled = false;
        this.elements.goToPaymentBtn.innerHTML = `Go To Payment`;
        return;
      }
      if (friendEmail) {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(friendEmail);
        if (!emailOk) {
          errorAlert("Please enter a valid friend email");
          this.elements.goToPaymentBtn.disabled = false;
          this.elements.goToPaymentBtn.innerHTML = `Go To Payment`;
          return;
        }
      }

      data.isGift = true;
      data.friend = {
        name: friendName,
        email: friendEmail || null,
        phone: friendPhone || null,
        note: friendNote || "",
      };
    }

    // Include cashback redeem points if any
    if (Number(this.redeemPoints) > 0) {
      data.redeemPoints = Number(this.redeemPoints);
    }

    sessionStorage.setItem("checkoutData", JSON.stringify(data));
    window.location.href = "/payment";
  }

  updateTotalWithSelectedPaymentMethod() {
    const selectedPaymentMethod = document.querySelector('input[name="payment-method"]:checked')?.id;
    if (!selectedPaymentMethod) return;

    const subtotal = this.calculateSubtotal();

    // Calculate discounts: coupon + cashback
    const couponDiscount = this.calculateDiscount(subtotal);
    let discountedAmount = subtotal - couponDiscount;
    const cashbackDiscountEGP = this.calculateCashbackDiscountEGP();
    const cashbackDiscountDisplay = this.currency === "US" ? cashbackDiscountEGP / this.exchangeRate : cashbackDiscountEGP;
    discountedAmount -= cashbackDiscountDisplay;

    // Calculate tax on the discounted amount
    let taxAmount = 0;
    const taxInfo = this.paymentMethodTaxRates[selectedPaymentMethod];

    if (taxInfo.type === "fixed") {
      taxAmount = this.currency === "EG" ? taxInfo.amount : taxInfo.amount / this.exchangeRate;
    } else {
      // Apply percentage tax to the discounted amount, not the original subtotal
      taxAmount = discountedAmount * taxInfo.amount;
    }

    this.elements.tax.textContent = taxAmount.toFixed(2);

    // Calculate final total
    const total = discountedAmount + taxAmount;

    this.elements.total.textContent = total.toFixed(2);
    this.elements.total.dataset.amount = total.toFixed(2);

    // Enable the Go to Payment button when a payment method is selected
    this.elements.goToPaymentBtn.disabled = false;
  }
}

// Initialize checkout
document.addEventListener("DOMContentLoaded", () => {
  const checkout = new Checkout();
  document.querySelectorAll('input[name="payment-method"]').forEach((method) => {
    method.addEventListener("change", () => {
      checkout.updateTotalWithSelectedPaymentMethod();
    });
  });

  // Create a custom event for cookie changes
  let lastCookieValue = document.cookie;
  setInterval(() => {
    if (document.cookie !== lastCookieValue) {
      lastCookieValue = document.cookie;
      document.dispatchEvent(new Event("cookieChange"));
    }
  }, 1000); // Check every second
});
