const express = require("express");
const router = express.Router();
const { frontDB } = require("../utils/firebase");
const { getDoc, getDocs, collection, doc } = require("firebase/firestore");
const { getExchangeRate } = require("../utils/currencyCache");

const fetchProductsFromFirebase = require("../utils/fetchProducts");
const cache = require("../utils/cache");
const cacheMiddleware = require("../middlewares/cacheMiddleware");

const bannerRef = getDoc(doc(frontDB, "settings", "banner"));

router.get("/", cacheMiddleware("products"), async (req, res) => {
  try {
    // Step 1: Read user currency preference from cookies
    const userCurrency = req.cookies.currency || "EG"; // Default to EGP

    // Step 2: Fetch exchange rate if needed
    let exchangeRate = 1; // Default exchange rate for EGP
    if (userCurrency === "US") {
      exchangeRate = await getExchangeRate();
    }

    let products = req.cachedData || cache.get("products");

    // Step 3: Validate data structure
    if (!products || !products.products) {
      console.log("Cache is empty or invalid, fetching fresh data...");
      products = await fetchProductsFromFirebase();
      if (!products || !products.products) {
        throw new Error("Fetched products data is invalid!");
      }
      cache.set("products", products);
    }

    // Step 4: Ensure discounts is always an array
    const discounts = products.discounts || [];

    // Step 5: Process product discounts safely and filter featured products
    // Added filter to remove products with stock: 0
    let processedProducts = products.products
      .filter((product) => product.isFeatured === true && (product.stock === undefined || product.stock > 0))
      .map((product) => {
        const discount = discounts.find((d) => d.productId === product.id);
        let processedProduct = processProductDiscount(product, discount);

        // Convert price and bfDiscount if needed
        if (userCurrency === "US") {
          processedProduct.price = (processedProduct.price / exchangeRate).toFixed(2); // Convert price to USD
          if (processedProduct.bfDiscount) {
            processedProduct.bfDiscount = (processedProduct.bfDiscount / exchangeRate).toFixed(2); // Convert bfDiscount to USD
          }
        }

        return processedProduct;
      });

    // Step 5.1: Prepare ALL products processed (for custom home sections)
    const allProcessedProducts = products.products
      .filter((product) => product.stock === undefined || product.stock > 0)
      .map((product) => {
        const discount = discounts.find((d) => d.productId === product.id);
        let processedProduct = processProductDiscount(product, discount);

        if (userCurrency === "US") {
          processedProduct.price = (processedProduct.price / exchangeRate).toFixed(2);
          if (processedProduct.bfDiscount) {
            processedProduct.bfDiscount = (processedProduct.bfDiscount / exchangeRate).toFixed(2);
          }
        }

        return processedProduct;
      });

    // Step 6: Extract unique categories for featured products
    const categories = [...new Set(processedProducts.map((product) => product.categoryId))];

    // Step 7: Fetch banner and compute visibility + runtime content (manual or auto)
    let banner = null;
    try {
      const bSnap = await getDoc(doc(frontDB, "settings", "banner"));
      banner = bSnap.exists() ? bSnap.data() : null;
      if (banner) {
        const now = new Date();
        const isEnabled = !!banner.isEnabled;
        let withinSchedule = true; // default true if no schedule
        if (banner.autoPublish) {
          const start = banner.scheduleStart ? new Date(banner.scheduleStart) : null;
          const end = banner.scheduleEnd ? new Date(banner.scheduleEnd) : null;
          if (start && end) {
            withinSchedule = now >= start && now <= end;
          } else if (start && !end) {
            withinSchedule = now >= start;
          } else if (!start && end) {
            withinSchedule = now <= end;
          } else {
            // autoPublish true but no dates -> treat as within schedule
            withinSchedule = true;
          }
        }
        const visible = isEnabled && withinSchedule;

        // Prepare runtime banner object expected by the partial
        const runtime = { isEnabled: visible };
        if (visible) {
          const mode = banner.mode === 'auto' ? 'auto' : 'manual';
          const pickFrom = processedProducts || [];
          let chosenProduct = null;

          if (mode === 'auto' && Array.isArray(pickFrom) && pickFrom.length > 0) {
            // Deterministic index using provided randomSeed or daily seed
            const dailySeed = Math.floor(new Date().setHours(0,0,0,0) / (24 * 60 * 60 * 1000));
            const seed = Number(banner.randomSeed) || dailySeed;
            const idx = Math.abs(seed) % pickFrom.length;
            chosenProduct = pickFrom[idx];
          } else if (mode === 'manual' && banner.manualProductId) {
            chosenProduct = (pickFrom.find(p => String(p.id) === String(banner.manualProductId)) || null);
          }

          // Build fields
          const p = chosenProduct;
          if (mode === 'auto' && p) {
            // In auto mode, show product-derived banner by default so changes are visible
            runtime.image = (p && p.images) || banner.image || '';
            runtime.mainTitle = (p && p.name) || banner.mainTitle || '';
            runtime.subtitle = (p && (p.categoryName || p.categoryId || '')) || banner.subtitle || '';
            runtime.body = (p && (p.description ? String(p.description).slice(0, 120) : '')) || banner.body || '';
            runtime.actionText = banner.actionText || 'Shop Now';
            runtime.actionLink = `view/product/${p.id}`;
          } else {
            // Manual mode or no product available: prefer admin-provided fields
            runtime.image = banner.image || (p && p.images) || '';
            runtime.mainTitle = banner.mainTitle || (p && p.name) || '';
            runtime.subtitle = banner.subtitle || (p && (p.categoryName || p.categoryId || '')) || '';
            runtime.body = banner.body || (p && (p.description ? String(p.description).slice(0, 120) : '')) || '';
            runtime.actionText = banner.actionText || 'Shop Now';
            runtime.actionLink = banner.actionLink || (p ? `view/product/${p.id}` : 'products');
          }
        }

        banner = runtime;
      }
    } catch (e) {
      console.warn("Failed to fetch banner:", e.message);
      banner = null;
    }

    // Step 8: Fetch slider data
    const slider = [];
    const sliderSnapshot = await getDocs(collection(frontDB, "slider"));
    sliderSnapshot.forEach((doc) => {
      slider.push({ ...doc.data() });
    });

    const pinnedCategoriesSnapshot = await getDocs(collection(frontDB, "pinned-categories"));
    const pinnedCategories = [];
    pinnedCategoriesSnapshot.forEach((doc) => {
      pinnedCategories.push({ ...doc.data() });
    });

    // Step 9: Fetch all categories (admin-managed)
    const allCategories = [];
    const allCategoriesSnapshot = await getDocs(collection(frontDB, "categories"));
    allCategoriesSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data && data.name) allCategories.push(data.name);
    });

    // Step 9.5: Fetch custom home sections (admin-managed)
    const homeSections = [];
    const homeSectionsSnapshot = await getDocs(collection(frontDB, "home-sections"));
    homeSectionsSnapshot.forEach((doc) => {
      const data = doc.data();
      if (!data) return;
      // Normalize and push; expect fields: title, order, isActive, productIds
      homeSections.push({
        title: data.title || "Untitled",
        order: typeof data.order === "number" ? data.order : 0,
        isActive: data.isActive !== false, // default active
        productIds: Array.isArray(data.productIds) ? data.productIds : [],
      });
    });
    // Keep only active and sort by order asc
    const activeHomeSections = homeSections.filter((s) => s.isActive).sort((a, b) => a.order - b.order);

    // Step 10: Render the homepage with adjusted products and slider
    res.render("home", {
      products: processedProducts,
      slider,
      banner,
      categories,
      currency: userCurrency,
      pinnedCategories,
      allCategories,
      homeSections: activeHomeSections,
      allProducts: allProcessedProducts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch categories with products", details: error.message });
  }
});

// Helper Functions
function processProductDiscount(product, discount, exchangeRate = 1, userCurrency = "EG") {
  if (!discount) return product;

  const now = new Date();
  const startDate = discount.startDate.toDate();
  const endDate = discount.endDate.toDate();

  if (now >= startDate && now <= endDate) {
    // Calculate final price based on discount type
    const finalPrice =
      discount.discountType === "fixed"
        ? product.price - discount.discountValue
        : product.price * (1 - discount.discountValue / 100);

    // Adjust prices for currency conversion
    const adjustedPrice = (finalPrice / exchangeRate).toFixed(2);
    const originalPrice = (product.price / exchangeRate).toFixed(2);

    return {
      ...product,
      bfDiscount: originalPrice,
      price: adjustedPrice,
      discount: discount.discountType
        ? `${discount.discountValue} ${
            discount.discountType === "percentage" ? "%" : userCurrency === "US" ? "$" : "L.E"
          }`
        : null,
      startDate,
      endDate,
    };
  }

  // No active discount, convert price if needed
  return {
    ...product,
    price: (product.price / exchangeRate).toFixed(2),
    bfDiscount: null,
  };
}

module.exports = router;
