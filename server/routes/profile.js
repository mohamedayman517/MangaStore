const express = require("express");
const axios = require("axios");
const fs = require("fs");
const router = express.Router();
const { strictRateLimit } = require("../middlewares/rateLimit");
const validateSession = require("../middlewares/validateSession");
const { getExchangeRate } = require("../utils/currencyCache");
const multer = require("multer");
const upload = multer({ dest: "uploads/", limits: { fileSize: 3 * 1024 * 1024 }   }
);
const cloudinary = require("cloudinary").v2;
const { encryptData, decryptData } = require("../utils/cryptoHelper");
const { getCoupouns } = require("../utils/coupon-cached");
const checkActivateAccount = require("../middlewares/checkActivateAccount");
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// Lightweight endpoint to get current user's avatar URL (decrypted)
router.get("/me/avatar", validateSession, async (req, res) => {
  try {
    const uid = req.uid;
    const snap = await getDoc(doc(frontDB, "users", uid));
    if (!snap.exists()) return res.status(404).json({ error: "User not found" });
    const data = snap.data();
    const photoURL = data.photoURL ? decryptData(data.photoURL) : null;
    return res.json({ photoURL });
  } catch (err) {
    console.error("/me/avatar error:", err);
    return res.status(500).json({ error: "Failed to load avatar" });
  }
});

const { admin, frontDB } = require("../utils/firebase");
const { getDoc, doc, updateDoc, getDocs, collection, query, where } = require("firebase/firestore");

async function checkPasswordStrength(password) {
  const minLength = 8;
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*]/.test(password);
  let strength = 0;
  if (password.length >= minLength) {
    strength++;
  } else {
    strength = 0;
  }
  hasLowercase ? strength++ : strength--;
  if (hasUppercase) {
    strength++;
  } else {
    strength--;
  }
  if (hasNumber) {
    strength++;
  } else {
    strength--;
  }
  if (hasSpecialChar) {
    strength++;
  } else {
    strength--;
  }
  switch (strength) {
    case 5:
      return true;
    case 4:
      return false;
    case 3:
      return false;
    case 2:
      return false;
    default:
      return false;
  }
}

router.get("/profile", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const userId = req.uid; // Get authenticated user's ID
    // await admin.auth().setCustomUserClaims(userId, { subscribed: false });
    const userRecord = await admin.auth().getUser(userId);
    const subscribed = userRecord.customClaims?.subscribed || true;

    // console.log("subscribed", subscribed);

    // Step 1: Read user currency preference from cookies
    const userCurrency = req.cookies.currency || "EG"; // Default to EGP

    // Step 2: Fetch USD->EGP exchange rate (used for level thresholds and optional USD display)
    let exchangeRate = 1; // USD->EGP
    try {
      exchangeRate = await getExchangeRate();
    } catch (_) {
      exchangeRate = 1; // fallback
    }

    // Step 3: Fetch user data
    const userData = await getDoc(doc(frontDB, "users", userId));
    if (!userData.exists()) {
      return res.status(404).json({ error: "User not found" });
    }
    const user = userData.data();
    const cashbackPoints = Number(user.cashbackPoints || 0);

    // Step 4: Fetch transactions concurrently
    const transactionData = await Promise.all(
      (user.transactions || []).map(async (transactionId) => {
        const transactionDoc = await getDoc(doc(frontDB, "transactions", transactionId));
        if (!transactionDoc.exists()) return null;

        const transaction = transactionDoc.data();

        // Only consider successfully purchased transactions
        if (
          transaction.status === "Canceled" ||
          transaction.status === "Rejected" ||
          transaction.status === "unconfirmed"
        ) {
          return null;
        }

        // Keep original EGP amount for level calculation
        const amountEgp = parseFloat(transaction.amount || 0) || 0;
        transaction._amountEgp = amountEgp;

        // Convert transaction amount for display if needed (mutates amount only)
        if (userCurrency === "US") {
          transaction.amount = (amountEgp / exchangeRate).toFixed(2);
        }

        return { id: transactionDoc.id, ...transaction };
      })
    );

    // Step 5: Filter out null transactions and sort by `createdAt` (assuming it's a timestamp)
    const validTransactions = transactionData
      .filter((transaction) => transaction !== null)
      .sort((a, b) => b.createdAt - a.createdAt);

    // Step 6.1: Lifetime spend in EGP (sum of successful transactions)
    const totalSpendEgp = validTransactions.reduce((sum, t) => sum + (parseFloat(t._amountEgp || 0) || 0), 0);

    // Step 6.2: Derive level (1–100) using USD curve scaled to EGP
    // Base unit in EGP equivalent to $100: baseUnitEgp = 100 * rate
    const baseUnitEgp = 100 * exchangeRate;
    // Threshold(L) = baseUnitEgp * L^1.5, Inverse L = (spend / baseUnitEgp)^(2/3)
    const rawLevel = Math.pow(Math.max(totalSpendEgp, 0) / baseUnitEgp, 2 / 3);
    let level = Math.floor(rawLevel);
    if (level < 1 && totalSpendEgp >= baseUnitEgp) level = 1; // reach Lv.1 at ~$100 in EGP
    if (totalSpendEgp < baseUnitEgp) level = 0; // show progress to Lv.1 when below
    if (level > 100) level = 100;

    const threshold = (L) => baseUnitEgp * Math.pow(L, 1.5);
    const prevLevel = Math.max(0, Math.min(100, level));
    const nextLevel = Math.min(100, level + 1);
    const prevThresholdEgp = prevLevel === 0 ? 0 : threshold(prevLevel);
    const nextThresholdEgp = nextLevel === 0 ? threshold(1) : threshold(nextLevel);
    const range = Math.max(1, nextThresholdEgp - prevThresholdEgp);
    const progressPct = Math.max(0, Math.min(100, ((totalSpendEgp - prevThresholdEgp) / range) * 100));
    const remainingToNext = level >= 100 ? 0 : Math.max(0, nextThresholdEgp - totalSpendEgp);

    // Step 6: Extract the last 4 successfully purchased products, add transaction ID & date
    const lastFourOrders = validTransactions
      .flatMap((transaction) =>
        (transaction.products || []).map((product) => {
          // Convert product price if needed
          if (userCurrency === "US") {
            product.price = (parseFloat(product.price) / exchangeRate).toFixed(2);
          }
          return {
            ...product,
            transactionId: transaction.id, // Add transaction ID
            transactionDate: transaction.createdAt, // Add transaction date
            status: transaction.status, // Add transaction status
            img: product.images && product.images[0] ? product.images[0] : product.img || "/icons/mango_144x144.png",
          };
        })
      )
      .slice(0, 4); // Get last 4 successfully purchased products

    // Step 7: Badges
    const purchaseCount = validTransactions.length;
    // Membership by purchases
    let membershipBadge = { emoji: "🥉", name: "Bronze Member" };
    if (purchaseCount >= 100) membershipBadge = { emoji: "💎", name: "Diamond Member" };
    else if (purchaseCount >= 20) membershipBadge = { emoji: "🥇", name: "Gold Member" };
    else if (purchaseCount >= 5) membershipBadge = { emoji: "🥈", name: "Silver Member" };

    // Coder badge by level
    let coderBadge = null;
    if (level >= 61) coderBadge = { emoji: "💎", name: "Diamond Coder" };
    else if (level >= 31) coderBadge = { emoji: "🥇", name: "Golden Coder" };
    else if (level >= 11) coderBadge = { emoji: "🥈", name: "Silver Coder" };
    else if (level >= 1) coderBadge = { emoji: "🥉", name: "Bronze Coder" };

    // Step 7: Get available coupons for this user (valid, not expired, and either general or assigned to this uid)
    const allCoupons = await getCoupouns();
    const now = Date.now();
    const userCoupons = allCoupons
      .filter((c) => c && c.isValid && c.expired && typeof c.expired.toMillis === "function" && c.expired.toMillis() > now)
      .map((c) => {
        const base = {
          id: c.id,
          name: c.name ? decryptData(c.name) : null,
          type: c.type ? decryptData(c.type) : null,
          amount: c.amount ? Number(decryptData(c.amount)) : null,
          expiredAt: c.expired,
        };
        const scope = {
          userId: c.userId ? decryptData(c.userId) : null,
          categoryName: c.categoryName ? decryptData(c.categoryName) : null,
          productId: c.productId ? decryptData(c.productId) : null,
        };
        return { ...base, ...scope };
      })
      .filter((c) => {
        if (c.userId) return c.userId === userId; // only user-specific for this user
        return true; // include general/product/category coupons for visibility
      })
      .sort((a, b) => a.expiredAt.toMillis() - b.expiredAt.toMillis())
      .slice(0, 6); // preview up to 6

    // Step 8: Prepare user data for rendering (keeping it unchanged)
    res.render("profile", {
      user: {
        name: user.name ? decryptData(user.name) : null,
        email: user.email ? decryptData(user.email) : null,
        user: user,
        gender: user.gender ? decryptData(user.gender) : null,
        phoneNumber: user.phoneNumber ? decryptData(user.phoneNumber) : null,
        countryCode: user.countryCode ? decryptData(user.countryCode) : null,
        photoURL: user.photoURL ? decryptData(user.photoURL) : null,
        createdAt: user.createdAt,
        signupMethod: user.signupMethod,
        subscribed: subscribed,
      },
      lastFourOrders, // Send last 4 orders separately
      userCoupons, // Send preview of available coupons
      currency: userCurrency, // Send currency data
      cashbackPoints, // User cashback points
      levelInfo: {
        level: level, // 0..100 (0 shown as progress to Lv.1)
        totalSpendEgp: Math.round(totalSpendEgp),
        prevThresholdEgp: Math.round(prevThresholdEgp),
        nextThresholdEgp: Math.round(nextThresholdEgp),
        progressPct: Math.round(progressPct),
        remainingEgp: Math.round(remainingToNext),
      },
      badges: {
        purchaseCount,
        membershipBadge,
        coderBadge,
      },
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    res.status(500).json({ error: "Failed to fetch user profile", details: error.message });
  }
});

router.post(
  "/update-profile",
  validateSession,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 20, keyGenerator: (req) => req.uid || req.ip }),
  checkActivateAccount,
  upload.single("photo"),
  async (req, res) => {
  const uid = req.uid;
  const { name, email, phoneNumber, countryCode } = req.body;

  if (!name || !email || !phoneNumber || !countryCode) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    await admin.auth().updateUser(uid, {
      email: email,
      displayName: name,
      phoneNumber: `+${countryCode}${phoneNumber}`,
      photoURL: req.body.photoURL || null,
    });
  } catch (error) {
    console.error("Error updating user authentication data:", error);
    return res.status(500).json({ error: "Failed to update user authentication data" });
  }

  let photoURL = req.body.photoURL || null;

  if (req.file) {
    try {
      const result = await cloudinary.uploader.upload(req.file.path);
      photoURL = result.secure_url;
      fs.unlinkSync(req.file.path); // Remove the file from the server after upload
    } catch (error) {
      return res.status(500).json({ error: "Image upload failed" });
    }
  }

  const userRef = doc(frontDB, "users", uid);
  await updateDoc(userRef, {
    name: encryptData(name),
    email: encryptData(email),
    phoneNumber: encryptData(phoneNumber),
    countryCode: encryptData(countryCode),
    photoURL: encryptData(photoURL),
  });
  res.json({ message: "Profile updated successfully" });
});

router.post(
  "/update-password",
  validateSession,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyGenerator: (req) => req.uid || req.ip }),
  checkActivateAccount,
  async (req, res) => {
  const uid = req.uid;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  if (!(await checkPasswordStrength(newPassword))) {
    return res.status(400).json({
      error:
        "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character",
    });
  }

  if (!(await checkPasswordStrength(confirmNewPassword))) {
    return res.status(400).json({
      error:
        "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character",
    });
  }

  if (!(await checkPasswordStrength(currentPassword))) {
    return res.status(400).json({ error: "Invalid password" });
  }

  try {
    // Fetch the user from Firebase Auth
    const user = await admin.auth().getUser(uid);

    // Reauthenticate the user via Firebase REST API
    const loginResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        email: user.email,
        password: currentPassword,
        returnSecureToken: true,
      }
    );

    // Check if reauthentication was successful
    if (!loginResponse.data || !loginResponse.data.idToken) {
      return res.status(401).json({ error: "Invalid current password" });
    }

    // Update the user's password using the Admin SDK
    await admin.auth().updateUser(uid, { password: newPassword });

    // Optionally, revoke the user's refresh tokens to force a re-login
    await admin.auth().revokeRefreshTokens(uid);

    return res.json({ message: "Password updated successfully. Please log in again." });
  } catch (error) {
    console.error("Error updating user password:", error);

    // Optionally, inspect error.response for axios errors
    if (error.response && error.response.data) {
      return res.status(500).json({ error: error.response.data.error.message });
    }

    return res.status(500).json({ error: "Failed to update user password" });
  }
});

router.post(
  "/api/newsletter/unsubscribe",
  validateSession,
  strictRateLimit({ windowMs: 60 * 60 * 1000, max: 5, keyGenerator: (req) => req.uid || req.ip }),
  checkActivateAccount,
  async (req, res) => {
  try {
    // Get the user from Firebase Auth
    const user = req.user;

    // Send unsubscribe request to the admin API
    await axios.post("https://admin.store.mohammed-zuhair.online/api/unsubscribe", {
      email: user.email,
    });
    res.json({ message: "Unsubscribed from newsletter" });
  } catch (error) {
    console.error("Error unsubscribing from newsletter:", error);
    res.status(500).json({ error: "Failed to unsubscribe from newsletter" });
  }
});

module.exports = router;

// List available coupons for the logged-in user
router.get("/profile/coupons", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const uid = req.uid;
    const allCoupons = await getCoupouns();

    const now = Date.now();
    const available = allCoupons
      .filter((c) => c && c.isValid && c.expired && c.expired.toMillis && c.expired.toMillis() > now)
      .map((c) => {
        const base = {
          id: c.id,
          name: c.name ? decryptData(c.name) : null,
          type: c.type ? decryptData(c.type) : null,
          amount: c.amount ? Number(decryptData(c.amount)) : null,
          expiredAt: c.expired,
        };
        const scope = {
          userId: c.userId ? decryptData(c.userId) : null,
          categoryName: c.categoryName ? decryptData(c.categoryName) : null,
          productId: c.productId ? decryptData(c.productId) : null,
        };
        return { ...base, ...scope };
      })
      .filter((c) => {
        // user-specific coupons must match uid; otherwise include general coupons
        if (c.userId) return c.userId === uid;
        return true;
      })
      .sort((a, b) => a.expiredAt.toMillis() - b.expiredAt.toMillis());

    res.render("profile-coupons", { coupons: available });
  } catch (err) {
    console.error("Error fetching profile coupons:", err);
    res.status(500).send("Failed to load coupons");
  }
});

// Gifts: show gifts sent and received
router.get("/profile/gifts", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const uid = req.uid;

    // Load user document to get decrypted contact info for matching
    const userSnap = await getDoc(doc(frontDB, "users", uid));
    if (!userSnap.exists()) return res.status(404).send("User not found");
    const u = userSnap.data();
    const userEmail = u.email ? decryptData(u.email) : null;
    const userPhone = u.phoneNumber ? decryptData(u.phoneNumber) : null;

    // Sent gifts (by uid)
    const sentQ = query(
      collection(frontDB, "transactions"),
      where("uid", "==", uid),
      where("isGift", "==", true)
    );
    const sentSnap = await getDocs(sentQ);
    const sent = sentSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Received gifts: match by giftRecipient.email or giftRecipient.phone
    let received = [];
    if (userEmail) {
      const recEmailQ = query(
        collection(frontDB, "transactions"),
        where("isGift", "==", true),
        where("giftRecipient.email", "==", userEmail)
      );
      const recEmailSnap = await getDocs(recEmailQ);
      received.push(...recEmailSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }
    if (userPhone) {
      const recPhoneQ = query(
        collection(frontDB, "transactions"),
        where("isGift", "==", true),
        where("giftRecipient.phone", "==", userPhone)
      );
      const recPhoneSnap = await getDocs(recPhoneQ);
      received.push(...recPhoneSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }

    // De-duplicate by id
    const dedup = (arr) => Object.values(arr.reduce((acc, it) => ((acc[it.id] = it), acc), {}));
    const receivedUnique = dedup(received).filter((g) => g.uid !== uid); // exclude self-sent

    res.render("profile-gifts", { sent, received: receivedUnique });
  } catch (err) {
    console.error("Error loading gifts:", err);
    res.status(500).send("Failed to load gifts");
  }
});
