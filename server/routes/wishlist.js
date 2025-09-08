const express = require("express");
const router = express.Router();
const validateSession = require("../middlewares/validateSession");
const { strictRateLimit } = require("../middlewares/rateLimit");
const cache = require("../utils/cache");
const cacheMiddleware = require("../middlewares/cacheMiddleware");
const fetchProductsFromFirebase = require("../utils/fetchProducts");
const { frontDB } = require("../utils/firebase");
const { getDoc, doc, setDoc, updateDoc } = require("firebase/firestore");

// Ensure user wishlist doc exists
async function ensureWishlistDoc(uid) {
  const userRef = doc(frontDB, "users", uid);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, { favorites: { products: [], categories: [] } }, { merge: true   }
);
    return { favorites: { products: [], categories: [] } };
  }
  const data = snap.data() || {};
  if (!data.favorites) {
    await updateDoc(userRef, { favorites: { products: [], categories: [] } });
    data.favorites = { products: [], categories: [] };
  } else {
    // normalize fields
    data.favorites.products = Array.isArray(data.favorites.products) ? data.favorites.products : [];
    data.favorites.categories = Array.isArray(data.favorites.categories) ? data.favorites.categories : [];
  }
  return data;
}

// Get wishlist (JSON)
router.get("/api/wishlist", validateSession, async (req, res) => {
  try {
    const uid = req.uid;
    const data = await ensureWishlistDoc(uid);
    res.json({ success: true, favorites: data.favorites });
  } catch (e) {
    console.error("Failed to load wishlist:", e);
    res.status(500).json({ success: false, message: "Failed to load wishlist" });
  }
});

// Toggle item in wishlist
router.post(
  "/api/wishlist/toggle",
  validateSession,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 200, keyGenerator: (req) => req.uid || req.ip }),
  express.json(),
  async (req, res) => {
  try {
    const uid = req.uid;
    const { type, id } = req.body || {};
    if (!id || !["product", "category"].includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid payload" });
    }
    const userRef = doc(frontDB, "users", uid);
    const data = await ensureWishlistDoc(uid);
    const fav = data.favorites || { products: [], categories: [] };

    if (type === "product") {
      const has = fav.products.includes(id);
      const next = has ? fav.products.filter((p) => p !== id) : [...fav.products, id];
      await updateDoc(userRef, { "favorites.products": next });
      return res.json({ success: true, action: has ? "removed" : "added", favorites: { ...fav, products: next } });
    }
    if (type === "category") {
      const has = fav.categories.includes(id);
      const next = has ? fav.categories.filter((c) => c !== id) : [...fav.categories, id];
      await updateDoc(userRef, { "favorites.categories": next });
      return res.json({ success: true, action: has ? "removed" : "added", favorites: { ...fav, categories: next } });
    }
  } catch (e) {
    console.error("Failed to toggle wishlist:", e);
    res.status(500).json({ success: false, message: "Failed to update wishlist" });
  }
});

// Wishlist page
router.get("/wishlist", validateSession, cacheMiddleware("products"), async (req, res) => {
  try {
    const uid = req.uid;
    const data = await ensureWishlistDoc(uid);

    let productsData = req.cachedData || cache.get("products");
    if (!productsData || !productsData.products) {
      productsData = await fetchProductsFromFirebase();
      cache.set("products", productsData);
    }

    const favProducts = (data.favorites.products || []).map((id) =>
      productsData.products.find((p) => p.id === id)
    ).filter(Boolean);

    // categories are only IDs for now; render as chips
    const favCategories = data.favorites.categories || [];

    res.render("wishlist", {
      title: "My Wishlist",
      products: favProducts,
      categories: favCategories,
    });
  } catch (e) {
    console.error("Failed to render wishlist page:", e);
    res.status(500).send("Failed to load wishlist");
  }
});

module.exports = router;
