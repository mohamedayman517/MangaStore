const express = require("express");
const router = express.Router();
const validateSession = require("../middlewares/validateSession");
const { getExchangeRate } = require("../utils/currencyCache");
const cache = require("../utils/cache");
const cacheMiddleware = require("../middlewares/cacheMiddleware");
const { getCoupouns } = require("../utils/coupon-cached");
const { decryptData } = require("../utils/cryptoHelper");
const { sanitizeInput } = require("../utils/security"); // Add this utility
const { frontDB } = require("../utils/firebase");
const { getDoc, doc } = require("firebase/firestore");
const checkActivateAccount = require("../middlewares/checkActivateAccount");

// Helper function to check discount expiration
function isDiscountExpired(product) {
  if (!product.discount || !product.discountEndDate) {
    return false;
  }

  const discountEndDate = new Date(product.discountEndDate);
  const now = new Date();

  return now > discountEndDate;
}

// Helper function to check coupon validity
function isCouponValid(coupon) {
  if (!coupon || !coupon.isValid) {
    return false;
  }

  // Check if coupon is expired
  if (coupon.expired) {
    return false;
  }

  // Check expiration date if available
  if (coupon.endDate) {
    const endDate = new Date(coupon.endDate);
    const now = new Date();
    if (now > endDate) {
      return false;
    }
  }

  return true;
}

router.get("/checkout", validateSession, checkActivateAccount, async (req, res) => {
  const currency = req.cookies.currency || "EG"; // Get currency from cookies (default to "EG")
  const isGift = String(req.query.gift || "") === "1";
  try {
    // Load user's cashback points to display available balance for redemption
    const userSnap = await getDoc(doc(frontDB, "users", req.uid));
    const cashbackPoints = userSnap.exists() ? Number(userSnap.data().cashbackPoints || 0) : 0;
    res.render("checkout", { currency, isGift, cashbackPoints });
  } catch (e) {
    console.error("Failed to load cashback points for checkout:", e);
    // Render without points on failure
    res.render("checkout", { currency, isGift, cashbackPoints: 0 });
  }
});

router.post("/calculateTax/:payMethod", validateSession, checkActivateAccount, (req, res) => {
  try {
    const currency = req.cookies.currency || "EG"; // Get currency from cookies (default to "EG")
    const payMethod = req.params.payMethod;
    const subtotal = parseFloat(req.body.subtotal);

    // Validate inputs
    if (isNaN(subtotal) || subtotal < 0) {
      return res.status(400).json({ error: "Invalid subtotal amount" });
    }

    // Use object for faster lookup
    const taxRates = {
      VodafoneCash: 0.01,
      instapay: 0,
      telda: 5, // Fixed amount in EGP
      binance: 0,
      bybit: 0,
    };

    // Get tax rate or handle invalid payment method
    const taxRate = taxRates[payMethod];
    if (taxRate === undefined) {
      return res.status(400).json({ error: "Invalid payment method" });
    }

    // Calculate tax
    let tax = payMethod === "telda" ? taxRate : subtotal * taxRate; // Fixed tax for Telda, percentage for others
    let total = subtotal + tax;

    // Convert subtotal, tax, and total to the selected currency
    const convertedSubtotal = convertPrice(subtotal, currency);
    const convertedTax = convertPrice(tax, currency);
    const convertedTotal = convertPrice(total, currency);

    res.json({
      subtotal: convertedSubtotal.toFixed(2),
      tax: convertedTax.toFixed(2),
      total: convertedTotal.toFixed(2),
      currency, // Now it reflects the user's selected currency
      paymentMethod: payMethod,
    });
  } catch (error) {
    console.error("Error calculating tax:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/validate/coupon", validateSession, checkActivateAccount, async (req, res) => {
  const couponCode = sanitizeInput(req.body.couponCode);

  if (!couponCode || typeof couponCode !== "string") {
    console.error("Invalid coupon code provided");
    return res.status(400).json({ success: false, error: "Invalid coupon code" });
  }

  try {
    const coupons = await getCoupouns();

    let couponFound = false;

    for (const coupon of coupons) {
      if (decryptData(coupon.name) === couponCode) {
        couponFound = true;

        // If coupon is assigned to a specific user, ensure it matches the logged-in user
        try {
          if (coupon.userId) {
            const assignedUid = decryptData(coupon.userId);
            if (assignedUid && req.uid && assignedUid !== req.uid) {
              return res.status(403).json({
                success: false,
                error: "This coupon is not available for your account",
              });
            }
          }
        } catch (e) {
          console.error("Error validating user-specific coupon:", e);
        }

        if (!coupon.isValid || new Date(coupon.expired) < new Date()) {
          return res.status(400).json({
            success: false,
            error: "Coupon has expired or is no longer valid",
          });
        }

        if (coupon.expired) {
          const endDate = new Date(coupon.expired);
          const now = new Date();
          if (now > endDate) {
            return res.status(400).json({
              success: false,
              error: "Coupon has expired",
            });
          }
        }

        // Enforce one-time use per user
        try {
          const uid = req.uid;
          const rid = `${uid}_${coupon.id || "name_" + decryptData(coupon.name)}`;
          const redemptionSnap = await getDoc(doc(frontDB, "couponRedemptions", rid));
          if (redemptionSnap.exists()) {
            return res.status(403).json({ success: false, error: "Coupon already used by this account" });
          }
        } catch (e) {
          console.error("Error checking coupon redemption:", e);
        }

        const decryptedCouponData = {
          id: coupon.id || "unknown",
          name: decryptData(coupon.name),
          isValid: coupon.isValid,
          expired: coupon.expired,
          startDate: coupon.startDate,
          amount: Number(decryptData(coupon.amount)),
          type: decryptData(coupon.type),
        };

        return res.status(200).json({ success: true, data: decryptedCouponData });
      }
    }

    if (!couponFound) {
      console.error("Coupon not found");
      return res.status(404).json({ success: false, error: "Coupon not found" });
    }
  } catch (error) {
    console.error("Error validating coupon:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/process-checkout",
  validateSession,
  cacheMiddleware("products"),
  checkActivateAccount,
  async (req, res) => {
    try {
      let products = req.cachedData?.products || cache.get("products");
      if (!products || !Array.isArray(products)) {
        return res.status(500).json({ error: "Product data unavailable" });
      }

      const currency = req.cookies.currency || "EG"; // Get currency from cookies (default to "EG")
      const { cart, couponCode } = req.body;

      if (!cart || !Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({ error: "Invalid cart data" });
      }

      let subtotal = 0;
      const processedCart = [];
      const outOfStockItems = [];
      const insufficientStockItems = [];

      // Validate and process each item in the cart
      for (const item of cart) {
        const cachedProduct = products.find((p) => p.id === item.productId);

        if (!cachedProduct) {
          console.error(`Product with id ${item.productId} not found`);
          return res.status(400).json({ error: `Product with id ${item.productId} not found` });
        }

        // Check stock availability
        if (cachedProduct.stock !== undefined) {
          if (cachedProduct.stock <= 0) {
            outOfStockItems.push({
              id: item.productId,
              title: item.title || cachedProduct.name || "Unknown product",
            });
            continue;
          } else if (item.quantity > cachedProduct.stock) {
            insufficientStockItems.push({
              id: item.productId,
              title: item.title || cachedProduct.name || "Unknown product",
              requested: item.quantity,
              available: cachedProduct.stock,
            });
            continue;
          }
        }

        // No server-side secret key enforcement. Customer field is collected client-side and stored with order.

        // Check if the discount is still valid
        let price = cachedProduct.price;
        let discountApplied = false;

        if (cachedProduct.discount && !isDiscountExpired(cachedProduct)) {
          price = cachedProduct.price - (cachedProduct.price * cachedProduct.discount) / 100;
          discountApplied = true;
        }

        // Validate and convert currency if necessary
        if (cachedProduct.currency && cachedProduct.currency !== currency) {
          price = await convertPrice(price, currency);
        }

        const itemSubtotal = parseFloat(price) * item.quantity;
        subtotal += itemSubtotal;

        // Convert item price to selected currency
        const convertedPrice = await convertPrice(price, currency);
        processedCart.push({
          ...item,
          price: parseFloat(convertedPrice).toFixed(2),
          originalPrice: cachedProduct.price,
          discountApplied,
          stock: cachedProduct.stock,
        });
      }

      // Handle stock issues
      if (outOfStockItems.length > 0 || insufficientStockItems.length > 0) {
        const errorMessages = [];

        outOfStockItems.forEach((item) => {
          errorMessages.push(`${item.title} is out of stock`);
        });

        insufficientStockItems.forEach((item) => {
          errorMessages.push(
            `Only ${item.available} units of ${item.title} are available (you requested ${item.requested})`
          );
        });

        return res.status(400).json({
          success: false,
          error: "Stock issues detected",
          details: errorMessages,
          outOfStockItems,
          insufficientStockItems,
          validItems: processedCart,
        });
      }

      // Convert subtotal to selected currency
      const convertedSubtotal = await convertPrice(subtotal, currency);

      // Process coupon if provided
      let discount = 0;
      let appliedCoupon = null;

      if (couponCode) {
        const coupons = await getCoupouns();
        const coupon = coupons.find((c) => decryptData(c.name) === couponCode);

        if (coupon && isCouponValid(coupon)) {
          // Block reuse here as well
          try {
            const redemptionId = `${req.uid}_${coupon.id || "name_" + decryptData(coupon.name)}`;
            const redemptionSnap = await getDoc(doc(frontDB, "couponRedemptions", redemptionId));
            if (redemptionSnap.exists()) {
              return res.status(400).json({ success: false, error: "Coupon already used by this account" });
            }
          } catch (e) {
            console.error("Error checking coupon redemption in /process-checkout:", e);
          }
          // Validate user-specific coupon ownership
          if (coupon.userId) {
            try {
              const assignedUid = decryptData(coupon.userId);
              if (assignedUid && req.uid && assignedUid !== req.uid) {
                return res.status(403).json({ success: false, error: "This coupon is not available for your account" });
              }
            } catch (e) {
              console.error("Error validating user-specific coupon:", e);
              return res.status(400).json({ success: false, error: "Invalid coupon" });
            }
          }
          // Scope discount to category or product if coupon is scoped
          let eligibleSubtotal = subtotal;
          try {
            if (coupon.categoryName) {
              const targetCategoryName = decryptData(coupon.categoryName);
              // Compute subtotal only for items in the target category
              eligibleSubtotal = 0;
              for (const item of cart) {
                const prod = products.find((p) => p.id === item.productId);
                if (prod && prod.categoryId === targetCategoryName) {
                  // Recompute effective price similarly to above logic (respect product discount and currency)
                  let price = prod.price;
                  if (prod.discount && !isDiscountExpired(prod)) {
                    price = prod.price - (prod.price * prod.discount) / 100;
                  }
                  if (prod.currency && prod.currency !== currency) {
                    price = await convertPrice(price, currency);
                  }
                  eligibleSubtotal += parseFloat(price) * item.quantity;
                }
              }
            } else if (coupon.productId) {
              const targetProductId = decryptData(coupon.productId);
              eligibleSubtotal = 0;
              for (const item of cart) {
                if (item.productId === targetProductId) {
                  const prod = products.find((p) => p.id === item.productId);
                  if (!prod) continue;
                  let price = prod.price;
                  if (prod.discount && !isDiscountExpired(prod)) {
                    price = prod.price - (prod.price * prod.discount) / 100;
                  }
                  if (prod.currency && prod.currency !== currency) {
                    price = await convertPrice(price, currency);
                  }
                  eligibleSubtotal += parseFloat(price) * item.quantity;
                }
              }
            }
          } catch (e) {
            // Fallback to full subtotal on any error determining eligibility
            eligibleSubtotal = subtotal;
          }

          const amt = Number(decryptData(coupon.amount));
          const ctype = decryptData(coupon.type);
          if (ctype === "percentage") {
            discount = (eligibleSubtotal * amt) / 100;
          } else if (ctype === "fixed") {
            discount = Math.min(amt, eligibleSubtotal);
          }

          appliedCoupon = {
            name: decryptData(coupon.name),
            amount: Number(decryptData(coupon.amount)),
            type: decryptData(coupon.type),
            categoryName: coupon.categoryName ? decryptData(coupon.categoryName) : undefined,
            productId: coupon.productId ? decryptData(coupon.productId) : undefined,
          };
        }
      }

      // Calculate total after discount
      const totalAfterDiscount = subtotal - discount;
      const convertedTotalAfterDiscount = await convertPrice(totalAfterDiscount, currency);

      // Prepare the response data
      const responseData = {
        subtotal: parseFloat(convertedSubtotal).toFixed(2),
        discount: parseFloat(discount).toFixed(2),
        total: parseFloat(convertedTotalAfterDiscount).toFixed(2),
        currency,
        cart: processedCart,
        coupon: appliedCoupon,
        exchangeRate: await getExchangeRate(),
      };

      res.status(200).json({ success: true, data: responseData });
    } catch (error) {
      console.error("Error processing payment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

async function convertPrice(amount, currency) {
  try {
    const exchangeRate = await getExchangeRate();
    const exchangeRates = {
      US: 1 / exchangeRate,
      EG: 1,
    };

    return Number(amount * (exchangeRates[currency] || 1)).toFixed(2);
  } catch (error) {
    console.error("Error converting price:", error);
    return Number(amount).toFixed(2); // Return original amount in case of error
  }
}

module.exports = router;
