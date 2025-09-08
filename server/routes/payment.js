const express = require("express");
const router = express.Router();
const validateSession = require("../middlewares/validateSession");
const { getExchangeRate } = require("../utils/currencyCache");
const { getCoupouns } = require("../utils/coupon-cached");
const cache = require("../utils/cache");
const cacheMiddleware = require("../middlewares/cacheMiddleware");
const { sanitizeInput, validateObjectId } = require("../utils/security"); // Add this utility
const checkActivateAccount = require("../middlewares/checkActivateAccount");

// const ConfirmedTemplate = require("../templates/ConfirmedTemplate");
const rejectedTemplate = require("../templates/rejectedTemplate");
const ToPayTemplate = require("../templates/ToPayTemplate");
const AdminTransactionTemplate = require("../templates/adminTransacationTemplate");
const { sendEmail } = require("../utils/mailer");

const multer = require("multer");
// Improve file upload security
const upload = multer({
  dest: "uploads/",
  limits: {
    fileSize: 3 * 1024 * 1024, // 3MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

function formatTransactionData(transaction) {
  return {
    orderId: transaction.id,
    placedDate: transaction.createdAt.toDate().toISOString().split("T")[0],
    paymentMethod: transaction.paymentMethod,
    currency: transaction.currency,
    items: transaction.products.map((product) => ({
      orderItem: product.name,
      totalPrice: parseFloat(product.price), // Convert price string to number
    })),
  };
}

const { frontDB } = require("../utils/firebase");
const {
  getDoc,
  collection,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  Timestamp,
  setDoc,
  runTransaction,
  increment,
} = require("firebase/firestore");
const { decryptData } = require("../utils/cryptoHelper");

const paymentMethods = {
  VodafoneCash: "01097616658",
  instapay: "mu7amedzuhair",
  telda: "01223017871",
  binance: "872727698",
  bybit: "10838389",
};

router.get("/payment", validateSession, checkActivateAccount, async (req, res) => {
  res.render("redirect-payment");
});

// Helper function to check product stock
async function checkProductStock(products, cachedProducts) {
  const outOfStockItems = [];
  const insufficientStockItems = [];
  const validProducts = [];

  for (const item of products) {
    const product = cachedProducts.find((p) => p.id === item.productId);

    if (!product) continue;

    // Check if product has stock property
    if (product.stock !== undefined) {
      if (product.stock <= 0) {
        outOfStockItems.push({
          id: item.productId,
          title: item.title || product.name || "Unknown product",
        });
      } else if (item.quantity > product.stock) {
        insufficientStockItems.push({
          id: item.productId,
          title: item.title || product.name || "Unknown product",
          requested: item.quantity,
          available: product.stock,
        });
      } else {
        validProducts.push(item);
      }
    } else {
      // If no stock property, assume it's in stock
      validProducts.push(item);
    }
  }

  return { outOfStockItems, insufficientStockItems, validProducts };
}

// Helper function to check discount expiration
function checkDiscountExpiration(product) {
  if (product.discount && product.discountEndDate) {
    const discountEndDate = new Date(product.discountEndDate);
    const now = new Date();

    if (now > discountEndDate) {
      // Discount has expired
      return {
        isExpired: true,
        originalPrice: product.price,
      };
    }
  }

  return { isExpired: false };
}

router.post("/payment/info", validateSession, cacheMiddleware("products"), checkActivateAccount, async (req, res) => {
  const cachedProducts = req.cachedData?.products || cache.get("products");
  const cachedCoupons = await getCoupouns();

  // Validate request body
  const { products, checkoutData, coupon } = req.body;
  // console.log("Processing payment info:", products, checkoutData, coupon);

  if (!products || !Array.isArray(products) || products.length === 0) {
    return res.status(400).json({ success: false, error: "Invalid products data" });
  }

  if (!checkoutData || !checkoutData.paymentMethod) {
    return res.status(400).json({ success: false, error: "Invalid checkout data" });
  }

  const uid = req.uid;

  try {
    // console.log("Processing payment info for user:", uid);

    // Step 1: Read user currency preference
    const userCurrency = req.cookies.currency || "EG"; // Default to EGP
    let exchangeRate = 1; // Default for EGP
    if (userCurrency === "US") {
      exchangeRate = await getExchangeRate();
    }
    // console.log("User currency:", userCurrency, "Exchange rate:", exchangeRate);

    // Step 2: Check product stock and validate quantities
    const { outOfStockItems, insufficientStockItems, validProducts } = await checkProductStock(
      products,
      cachedProducts
    );

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

      // console.log("Stock issues detected:", errorMessages);

      return res.status(400).json({
        success: false,
        error: "Stock issues detected",
        details: errorMessages,
        outOfStockItems,
        insufficientStockItems,
      });
    }

    if (validProducts.length === 0) {
      return res.status(400).json({ success: false, error: "No valid products in cart" });
    }

    // Step 3: Fetch product data from cache or Firestore
    let productData = [];
    const missingProducts = [];

    validProducts.forEach((currentProduct) => {
      const product = cachedProducts.find((p) => p.id === currentProduct.productId);
      if (product) {
        product.currency = currentProduct.currency;
        productData.push(product);
      } else {
        missingProducts.push(currentProduct.productId);
      }
    });

    if (missingProducts.length > 0) {
      const productDocs = await Promise.all(missingProducts.map((id) => getDoc(doc(frontDB, "products", id))));
      productDocs.forEach((snapshot) => {
        if (snapshot.exists()) {
          productData.push({ id: snapshot.id, ...snapshot.data() });
        }
      });
    }

    // console.log("Fetched product data:", productData);

    // Step 4: Process discounts and check for expiration
    let totalPrice = 0;
    const processedProducts = productData.map((product) => {
      const orderedProduct = validProducts.find((p) => p.productId === product.id);
      const quantity = orderedProduct ? orderedProduct.quantity : 1;

      // Check if discount has expired
      const { isExpired, originalPrice } = checkDiscountExpiration(product);

      let finalPrice = isExpired ? originalPrice : product.price;
      let appliedDiscount = !isExpired && product.discount > 0;

      // Convert currency if needed
      if (userCurrency === "US") {
        finalPrice = parseFloat(finalPrice / exchangeRate).toFixed(2);
      }

      const productTotal = finalPrice * quantity;
      totalPrice += productTotal;

      return {
        ...product,
        quantity,
        finalPrice,
        productTotal,
        appliedDiscount,
        discountExpired: isExpired,
      };
    });

    // console.log("Processed products with discounts:", processedProducts);

    // Step 4.1: Validate required customer fields presence based on product metadata
    try {
      for (const p of processedProducts) {
        const ordered = validProducts.find((vp) => vp.productId === p.id);
        const meta = productData.find((pd) => pd.id === p.id) || {};
        if (meta.requireCustomerField) {
          const cf = ordered && ordered.customerField;
          if (!cf || !cf.value || String(cf.value).trim().length === 0) {
            return res.status(400).json({
              success: false,
              error: `Missing required information for product: ${p.name || p.id}`,
              productId: p.id,
            });
          }
        }
      }
    } catch (e) {
      console.error("Error validating customer field presence:", e);
      return res.status(400).json({ success: false, error: "Failed to validate customer field presence" });
    }

    // Step 5: Prepare products data (attach customer field if provided)
    const productsData = processedProducts.map(({ id, quantity, name, price, images }) => {
      const ordered = validProducts.find((vp) => vp.productId === id);
      let customerField = null;
      if (ordered && ordered.customerField) {
        try {
          const label = ordered.customerField.label ? sanitizeInput(String(ordered.customerField.label)) : null;
          const value = ordered.customerField.value ? sanitizeInput(String(ordered.customerField.value)) : null;
          if (label || value) customerField = { label, value };
        } catch (e) {
          console.warn("Invalid customerField provided for product:", id, e);
        }
      }
      return {
        productId: id,
        quantity,
        name,
        price,
        img: images,
        ...(customerField ? { customerField } : {}),
      };
    });

    // console.log("Prepared products data:", productsData);

    // Step 6: Calculate tax
    const taxRates = {
      VodafoneCash: { value: 0.01, type: "percentage" },
      instapay: { value: 0, type: "percentage" },
      telda: { value: 5, type: "fixed" },
      binance: { value: 0, type: "percentage" },
      bybit: { value: 0, type: "percentage" },
    };

    const taxRate = taxRates[checkoutData.paymentMethod] || { value: 0, type: "percentage" };
    let tax = taxRate.type === "percentage" ? totalPrice * taxRate.value : taxRate.value;
    tax = parseFloat(tax / exchangeRate);

    // console.log("Calculated tax:", tax);

    // Step 7: Apply coupon
    let couponAmount = 0;
    let appliedCoupon = null;

    if (coupon?.name) {
      // console.log("Applying coupon:", coupon.name);
      const cachedCoupon = cachedCoupons.find((c) => decryptData(c.name) === coupon.name);
      // console.log("Cached coupon:", cachedCoupon);

      if (cachedCoupon) {
        // Block reuse: check redemption store
        try {
          const redemptionId = `${uid}_${cachedCoupon.id || "name_" + coupon.name}`;
          const redemptionSnap = await getDoc(doc(frontDB, "couponRedemptions", redemptionId));
          if (redemptionSnap.exists()) {
            // Already used by this user; ignore coupon
            // console.warn("Coupon already redeemed by user, ignoring.");
            return res.status(400).json({ success: false, error: "Coupon already used by this account" });
          }
        } catch (e) {
          console.error("Error checking coupon redemption in /payment/info:", e);
        }
        // Check if coupon is valid and not expired
        const now = new Date();
        const couponExpired = cachedCoupon.expired && new Date(cachedCoupon.expired) < now;
        // console.log("Coupon expired:", couponExpired);

        if (cachedCoupon.isValid && !couponExpired) {
          if (decryptData(cachedCoupon.type) === "percentage") {
            couponAmount = (totalPrice * Number(decryptData(cachedCoupon.amount))) / 100;
          } else if (decryptData(cachedCoupon.type) === "fixed") {
            couponAmount = Number(decryptData(cachedCoupon.amount));
          }

          // Adjust coupon amount based on exchange rate if currency is not EGP
          if (userCurrency !== "EG") {
            couponAmount = parseFloat(couponAmount / exchangeRate).toFixed(2);
          }

          appliedCoupon = {
            name: coupon.name,
            amount: decryptData(cachedCoupon.amount),
            type: decryptData(cachedCoupon.type),
          };
        }
      }
    }

    // console.log("Applied coupon:", appliedCoupon, "Coupon amount:", couponAmount);

    // Step 7.1: Cashback redemption validation and discount calculation
    let cashbackRedeem = null;
    try {
      const redeemPointsRaw = Number(checkoutData?.redeemPoints || 0);
      if (redeemPointsRaw > 0) {
        // Only positive, integer, multiple of 10
        if (!Number.isInteger(redeemPointsRaw) || redeemPointsRaw <= 0 || redeemPointsRaw % 10 !== 0) {
          return res.status(400).json({ success: false, error: "Invalid redeem points" });
        }
        const userSnap = await getDoc(doc(frontDB, "users", uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const availablePts = Number(userData.cashbackPoints || 0);
        if (redeemPointsRaw > availablePts) {
          return res.status(400).json({ success: false, error: "Insufficient cashback points" });
        }
        // Compute discount in EGP then convert to current currency for totals
        const discountEGP = redeemPointsRaw / 10; // 10 pts = 1 EGP
        const discountCurrency = userCurrency === "US" ? parseFloat((discountEGP / exchangeRate).toFixed(2)) : discountEGP;

        // Prevent discount exceeding (totalPrice - couponAmount) before tax
        const maxDiscount = Math.max(0, totalPrice - couponAmount);
        const appliedDiscountCurrency = Math.min(discountCurrency, maxDiscount);
        // Recalculate points to apply if clamped (convert back to EGP then points)
        let appliedPoints = redeemPointsRaw;
        if (appliedDiscountCurrency < discountCurrency) {
          const appliedDiscountEGP = userCurrency === "US" ? appliedDiscountCurrency * exchangeRate : appliedDiscountCurrency;
          appliedPoints = Math.floor(appliedDiscountEGP * 10);
        }

        cashbackRedeem = {
          requestedPoints: redeemPointsRaw,
          appliedPoints,
          discountEGP: appliedPoints / 10,
          discountCurrency: userCurrency === "US" ? parseFloat(((appliedPoints / 10) / exchangeRate).toFixed(2)) : appliedPoints / 10,
          debited: false,
          refunded: false,
        };
      }
    } catch (e) {
      console.error("Error validating cashback redemption:", e);
      return res.status(400).json({ success: false, error: "Failed to validate cashback redemption" });
    }

    // Step 8: Calculate final total including cashback discount
    const cashbackAmount = cashbackRedeem ? cashbackRedeem.discountCurrency : 0;
    const grandTotal = totalPrice + tax - couponAmount - cashbackAmount;

    // console.log("Calculated grand total:", grandTotal);

    // Step 9: Set expiration time
    const firestoreTimestamp = Timestamp.fromDate(new Date(Date.now() + 30 * 60 * 1000));

    // Step 9.1: Extract gift information (if present)
    const isGift = Boolean(checkoutData?.isGift);
    let giftRecipient = null;
    if (isGift && checkoutData.friend) {
      giftRecipient = {
        name: sanitizeInput(checkoutData.friend.name || ""),
        email: checkoutData.friend.email ? sanitizeInput(checkoutData.friend.email) : null,
        phone: checkoutData.friend.phone ? sanitizeInput(checkoutData.friend.phone) : null,
        note: checkoutData.friend.note ? sanitizeInput(checkoutData.friend.note) : "",
      };
    }

    // Normalize and sanitize referral email if provided
    const referralEmail = checkoutData?.referralEmail
      ? sanitizeInput(String(checkoutData.referralEmail).toLowerCase())
      : null;

    // Step 10: Save transaction
    const transactionRef = await addDoc(collection(frontDB, "transactions"), {
      uid,
      name: sanitizeInput(checkoutData.name),
      phoneNumber: sanitizeInput(checkoutData.phone),
      country: sanitizeInput(checkoutData.country),
      city: sanitizeInput(checkoutData.city),
      paymentMethod: checkoutData.paymentMethod,
      appliedCoupon: appliedCoupon,
      products: productsData,
      createdAt: Timestamp.now(),
      totalPrice: grandTotal,
      discountApplied: processedProducts.some((p) => p.appliedDiscount),
      tax,
      cashbackRedeem: cashbackRedeem || null,
      status: arrayUnion({
        updatedAt: Timestamp.now(),
        message: "Awaiting for your confirm...",
        state: "unconfirmed",
      }),
      endDate: firestoreTimestamp,
      currency: userCurrency,
      exchangeRate,
      isGift,
      giftRecipient,
      // Store referral email for cashback logic and auditing
      referralEmail: referralEmail,
    });

    // console.log("Transaction saved with ID:", transactionRef.id);

    // Step 11: Update user transactions
    await updateDoc(doc(frontDB, "users", uid), {
      transactions: arrayUnion(transactionRef.id),
    });

    // Step 11.1: Persist referral email on user profile if provided
    try {
      if (referralEmail) {
        await setDoc(
          doc(frontDB, "users", uid),
          { referralEmail },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn("Failed to set referralEmail on user profile:", e);
      // Non-fatal; continue
    }

    // console.log("Updated user transactions for user:", uid);

    res.status(200).json({
      success: true,
      message: "Payment info processed successfully",
      transactionId: transactionRef.id,
      uid,
    });
  } catch (error) {
    console.error("Error processing payment info:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/payment/:userId/:transactionId", validateSession, checkActivateAccount, async (req, res) => {
  const { userId, transactionId } = req.params;
  const uid = req.uid;

  // console.log(`Fetching payment details for user: ${userId}, transaction: ${transactionId}`);

  // Validate parameters
  if (!validateObjectId(transactionId)) {
    // console.log("Invalid transaction ID format");
    return res.status(400).json({ success: false, error: "Invalid transaction ID format" });
  }

  try {
    // Fetch transaction data
    const transactionRef = doc(frontDB, "transactions", transactionId);
    const transactionSnapshot = await getDoc(transactionRef);
    if (!transactionSnapshot.exists()) {
      // console.log("Transaction not found");
      return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    const transactionData = transactionSnapshot.data();

    // Validate transaction status
    if (transactionData.status.some((status) => status.state !== "unconfirmed")) {
      // console.log("Transaction already processed, redirecting to success page");
      return res.redirect(`/payment/success/${userId}/${transactionId}`);
    }

    // Check user authorization
    if (transactionData.uid !== userId || uid !== userId) {
      // console.log("Unauthorized access attempt");
      return res.status(403).send("Unauthorized");
    }

    // Check expiration
    const now = new Date();
    const endDate = transactionData.endDate.toDate();
    if (endDate < now) {
      // console.log("Transaction has expired");
      return res.status(400).json({ success: false, error: "Transaction has expired" });
    }

    // Validate payment method
    const paymentMethod = paymentMethods[transactionData.paymentMethod];
    if (!paymentMethod) {
      // console.log("Invalid payment method");
      return res.status(400).json({ success: false, error: "Invalid payment method" });
    }

    const paymentCurrency = transactionData.currency;

    // Convert amount if needed
    const amountToPay = Number(transactionData.totalPrice).toFixed(2);

    // console.log(
    //   `Rendering payment gateway for transaction: ${transactionId}, amount: ${amountToPay}, currency: ${paymentCurrency}`
    // );

    // Render payment gateway
    res.render("payment-gateway", {
      payment: {
        paymentDetails: {
          payMethod: transactionData.paymentMethod,
          info: paymentMethod,
          id: transactionId,
          uid: userId,
        },
        amountToPay,
        endDate,
        currency: paymentCurrency,
      },
    });
  } catch (error) {
    console.error("Error fetching transaction data:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Helper function to update product stock with race condition protection
async function updateProductStock(products) {
  try {
    // Get cached products
    let cachedProducts = cache.get("products");
    if (!cachedProducts || !cachedProducts.products) {
      // console.log("No cached products found, fetching from database");
      return;
    }

    // Update stock in both cache and database
    const updatePromises = [];
    const stockUpdates = [];

    for (const purchasedProduct of products) {
      // Find the product in cache
      const productIndex = cachedProducts.products.findIndex((p) => p.id === purchasedProduct.productId);

      if (productIndex !== -1) {
        const product = cachedProducts.products[productIndex];

        // Initialize stock if it doesn't exist
        if (product.stock === undefined) {
          product.stock = 100; // Default stock value if not set
        }

        // Validate quantity against current stock
        if (purchasedProduct.quantity > product.stock) {
          throw new Error(
            `Insufficient stock for product ${purchasedProduct.productId}. Requested: ${purchasedProduct.quantity}, Available: ${product.stock}`
          );
        }

        // Calculate new stock
        const newStock = Math.max(0, product.stock - purchasedProduct.quantity);

        // Store update info
        stockUpdates.push({
          productId: purchasedProduct.productId,
          oldStock: product.stock,
          newStock,
          quantity: purchasedProduct.quantity,
        });

        // Update cached product
        cachedProducts.products[productIndex].stock = newStock;

        // Update database with transaction to prevent race conditions
        const productRef = doc(frontDB, "products", purchasedProduct.productId);

        // Use a transaction to safely update stock
        updatePromises.push(
          getDoc(productRef).then((snapshot) => {
            if (snapshot.exists()) {
              const currentData = snapshot.data();
              const currentStock = currentData.stock !== undefined ? currentData.stock : 100;

              // Double-check if we have enough stock
              if (purchasedProduct.quantity > currentStock) {
                throw new Error(
                  `Insufficient stock for product ${purchasedProduct.productId}. Requested: ${purchasedProduct.quantity}, Available: ${currentStock}`
                );
              }

              // Update with the actual current stock value
              return updateDoc(productRef, {
                stock: Math.max(0, currentStock - purchasedProduct.quantity),
              });
            }
          })
        );
      }
    }

    // Save updated cache
    cache.set("products", cachedProducts);

    // Wait for all database updates to complete
    await Promise.all(updatePromises);

    // console.log("Stock updates:", stockUpdates);
    // console.log("Successfully updated stock for all products");

    return stockUpdates;
  } catch (error) {
    console.error("Error updating product stock:", error);
    throw error;
  }
}

router.post(
  "/payment/upload-screenshot",
  validateSession,
  upload.single("screenshot"),
  checkActivateAccount,
  async (req, res) => {
    const { transactionId, userId } = req.body;

    // Validate required fields
    if (!transactionId || !userId) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // Validate transaction ID format
    if (!validateObjectId(transactionId)) {
      return res.status(400).json({ success: false, error: "Invalid transaction ID format" });
    }

    let image = null;

    try {
      // Process uploaded image
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: "payment/screenshots",
          allowed_formats: ["jpg", "jpeg", "png", "gif"], // Restrict file types
          transformation: [
            { width: 1200, height: 1200, crop: "limit" }, // Resize image
            { quality: "auto:good" }, // Optimize quality
          ],
        });
        image = result.secure_url;
      } else if (req.body.imageUrl) {
        // Validate image URL
        const imageUrl = req.body.imageUrl;
        if (!/^https:\/\//.test(imageUrl)) {
          return res.status(400).json({ success: false, error: "Invalid image URL" });
        }
        image = imageUrl;
      } else {
        return res.status(400).json({ success: false, error: "No image provided" });
      }

      // Get transaction data to access products
      const transactionRef = doc(frontDB, "transactions", transactionId);
      const transactionSnapshot = await getDoc(transactionRef);

      if (!transactionSnapshot.exists()) {
        return res.status(404).json({ success: false, error: "Transaction not found" });
      }

      const transactionData = transactionSnapshot.data();

      // Verify user owns this transaction
      if (transactionData.uid !== userId || transactionData.uid !== req.uid) {
        return res.status(403).json({ success: false, error: "Unauthorized" });
      }

      // Check if transaction is already processed
      const currentStatus = transactionData.status[transactionData.status.length - 1]?.state;
      if (currentStatus && currentStatus !== "unconfirmed") {
        return res.status(400).json({
          success: false,
          error: "Transaction already processed",
          status: currentStatus,
        });
      }

      // Enforce one-time coupon use at upload step as well
      try {
        if (transactionData.appliedCoupon && transactionData.appliedCoupon.name) {
          const redemptionId = `${userId}_${transactionData.appliedCoupon.id || "name_" + transactionData.appliedCoupon.name}`;
          const redemptionRef = doc(frontDB, "couponRedemptions", redemptionId);
          const redemptionSnap = await getDoc(redemptionRef);
          if (redemptionSnap.exists()) {
            return res.status(400).json({ success: false, error: "Coupon already used by this account" });
          }
        }
      } catch (e) {
        console.error("Error enforcing one-time use on upload:", e);
      }

      // If cashback redemption exists and not debited yet, atomically deduct points
      try {
        const txRef = doc(frontDB, "transactions", transactionId);
        const userRef = doc(frontDB, "users", userId);
        await runTransaction(frontDB, async (trx) => {
          const [txSnap, userSnap] = await Promise.all([trx.get(txRef), trx.get(userRef)]);
          if (!txSnap.exists()) throw new Error("Transaction not found");
          const txData = txSnap.data();
          const redeem = txData.cashbackRedeem;
          if (redeem && redeem.appliedPoints > 0 && !redeem.debited) {
            const currentPts = Number((userSnap.exists() ? userSnap.data().cashbackPoints : 0) || 0);
            if (currentPts < redeem.appliedPoints) throw new Error("Insufficient cashback points at debit time");
            // Deduct and mark debited
            trx.update(userRef, { cashbackPoints: currentPts - redeem.appliedPoints });
            trx.update(txRef, { cashbackRedeem: { ...redeem, debited: true } });
          }
        });
      } catch (e) {
        console.error("Cashback debit failed:", e);
        return res.status(400).json({ success: false, error: "Failed to debit cashback points" });
      }

      // Update transaction status
      await updateDoc(transactionRef, {
        screenshot: image,
        status: arrayUnion({
          updatedAt: Timestamp.now(),
          state: "ToPay",
          message: "Awaiting for seller confirmation...",
        }),
      });

      // Record coupon redemption (one-time use) when user submits payment evidence
      try {
        if (transactionData.appliedCoupon && transactionData.appliedCoupon.name) {
          const redemptionId = `${userId}_${transactionData.appliedCoupon.id || "name_" + transactionData.appliedCoupon.name}`;
          const redemptionRef = doc(frontDB, "couponRedemptions", redemptionId);
          const redemptionSnap = await getDoc(redemptionRef);
          if (!redemptionSnap.exists()) {
            await setDoc(redemptionRef, {
              uid: userId,
              couponName: transactionData.appliedCoupon.name,
              redeemedAt: Timestamp.now(),
            });
          }
        }
      } catch (e) {
        console.error("Error recording coupon redemption:", e);
      }

      // Update product stock when payment is submitted
      const stockUpdates = await updateProductStock(transactionData.products);

      const orderDate = formatTransactionData(transactionData);

      const confirmedPaymentEmailTemplate = new ToPayTemplate(orderDate);
      const userEmail = req.user.email;
      await sendEmail(userEmail, confirmedPaymentEmailTemplate);

      const adminMail = new AdminTransactionTemplate(orderDate);
      await sendEmail("mangaststore@gmail.com", adminMail);

      res.status(200).json({
        success: true,
        message: "Payment sent successfully",
        stockUpdates,
      });
    } catch (error) {
      console.error("Error uploading screenshot:", error);

      // Provide more specific error messages
      if (error.message && error.message.includes("Insufficient stock")) {
        return res.status(400).json({
          success: false,
          error: "Stock changed while processing",
          details: error.message,
        });
      }

      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.get("/payment/success/:userId/:transnId", validateSession, checkActivateAccount, async (req, res) => {
  const { transnId, userId } = req.params;

  // Validate parameters
  if (!validateObjectId(transnId)) {
    return res.status(400).render("error-page", { message: "Invalid transaction ID format" });
  }

  try {
    const docRef = doc(frontDB, "transactions", transnId);
    const docdata = await getDoc(docRef);

    if (!docdata.exists()) {
      return res.status(404).render("transaction-not-found", { transnId });
    }

    const data = docdata.data();

    // Verify user owns this transaction
    if (data.uid !== userId || data.uid !== req.uid) {
      return res.status(403).render("error-page", { message: "Unauthorized" });
    }

    // Convert prices if needed
    if (data.currency == "US") {
      data.products.forEach((product) => {
        product.price = product.price / data.exchangeRate;
      });
    }

    const state = data.status.length > 0 ? data.status[data.status.length - 1].state : null;

    if (["canceled", "rejected"].includes(state)) {
      return res.redirect(`/payment/failed/${userId}/${transnId}`);
    }

    if (state === "unconfirmed") {
      return res.redirect(`/payment/${userId}/${transnId}`);
    }

    res.render("payment-success", {
      createdAt: data.createdAt,
      products: data.products,
      totalPrice: data.totalPrice,
      currency: data.currency,
      transnId,
    });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).render("error-page", { message: "Internal Server Error" });
  }
});

router.get("/payment/failed/:userId/:transnId", validateSession, checkActivateAccount, async (req, res) => {
  const { transnId, userId } = req.params;

  // Validate parameters
  if (!validateObjectId(transnId)) {
    return res.status(400).render("error-page", { message: "Invalid transaction ID format" });
  }

  try {
    const docRef = doc(frontDB, "transactions", transnId);
    const docdata = await getDoc(docRef);

    if (!docdata.exists()) {
      return res.status(404).render("transaction-not-found", { transnId });
    }

    const data = docdata.data();

    // Verify user owns this transaction
    if (data.uid !== userId || data.uid !== req.uid) {
      return res.status(403).render("error-page", { message: "Unauthorized" });
    }

    if (!data.status.some((status) => ["canceled", "rejected", "unconfirmed"].includes(status.state))) {
      return res.redirect(`/payment/success/${userId}/${transnId}`);
    }

    res.render("payment-failed", { data, transnId });
  } catch (error) {
    console.error("Error fetching transaction:", error);
    res.status(500).render("error-page", { message: "Internal Server Error" });
  }
});

router.post("/cancel-payment", validateSession, checkActivateAccount, async (req, res) => {
  const { transactionId } = req.body;
  const userId = req.uid;
  const email = req.user.email;

  // Validate transaction ID
  if (!validateObjectId(transactionId)) {
    return res.status(400).json({ success: false, error: "Invalid transaction ID format" });
  }

  try {
    const userRef = await getDoc(doc(frontDB, "users", userId));
    if (!userRef.exists()) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const transactions = userRef.data().transactions || [];
    if (!transactions.includes(transactionId)) {
      return res.status(400).json({ success: false, error: "Transaction not found for this user" });
    }

    // Get transaction to check current status
    const transactionRef = doc(frontDB, "transactions", transactionId);
    const transactionSnapshot = await getDoc(transactionRef);

    if (!transactionSnapshot.exists()) {
      return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    const transactionData = transactionSnapshot.data();
    const currentStatus = transactionData.status[transactionData.status.length - 1]?.state;

    // Only allow cancellation of unconfirmed or ToPay transactions
    if (!["unconfirmed", "ToPay"].includes(currentStatus)) {
      return res.status(400).json({
        success: false,
        error: "Cannot cancel transaction in current state",
        currentState: currentStatus,
      });
    }

    // If cashback was debited, refund it atomically and mark refunded
    try {
      const txRef = doc(frontDB, "transactions", transactionId);
      const userRef = doc(frontDB, "users", userId);
      await runTransaction(frontDB, async (trx) => {
        const [txSnap, userSnap] = await Promise.all([trx.get(txRef), trx.get(userRef)]);
        if (!txSnap.exists()) return; // nothing to do
        const txData = txSnap.data();
        const redeem = txData.cashbackRedeem;
        if (redeem && redeem.appliedPoints > 0 && redeem.debited && !redeem.refunded) {
          const currentPts = Number((userSnap.exists() ? userSnap.data().cashbackPoints : 0) || 0);
          trx.update(userRef, { cashbackPoints: currentPts + redeem.appliedPoints });
          trx.update(txRef, { cashbackRedeem: { ...redeem, refunded: true } });
        }
      });
    } catch (e) {
      console.error("Cashback refund on cancel failed:", e);
      // continue; cancellation proceeds even if refund fails
    }

    // Update transaction status
    await updateDoc(transactionRef, {
      status: arrayUnion({
        updatedAt: Timestamp.now(),
        message: "Canceled by user",
        state: "canceled",
      }),
    });

    const orderData = formatTransactionData(transactionData);
    const canceledEmailTemplate = new rejectedTemplate(orderData, "Canceled by user", "canceled");
    await sendEmail(email, canceledEmailTemplate);

    // If items were already deducted from stock, restore them
    if (currentStatus === "ToPay") {
      try {
        // Restore stock for canceled orders
        const products = transactionData.products || [];
        const restorePromises = [];

        for (const product of products) {
          const productRef = doc(frontDB, "products", product.productId);

          // Use a transaction to safely update stock
          restorePromises.push(
            getDoc(productRef).then((snapshot) => {
              if (snapshot.exists()) {
                const currentData = snapshot.data();
                const currentStock = currentData.stock !== undefined ? currentData.stock : 0;

                // Restore the quantity
                return updateDoc(productRef, {
                  stock: currentStock + product.quantity,
                });
              }
            })
          );
        }

        await Promise.all(restorePromises);
        // console.log(`Restored stock for canceled transaction ${transactionId}`);
      } catch (error) {
        console.error("Error restoring stock:", error);
        // Continue with cancellation even if stock restoration fails
      }
    }

    res.status(200).json({ success: true, message: "Payment canceled successfully" });
  } catch (error) {
    console.error("Error canceling payment:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

module.exports = router;
