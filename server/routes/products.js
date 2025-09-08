const express = require("express");
const router = express.Router();
const fetchProductsFromFirebase = require("../utils/fetchProducts");
const cache = require("../utils/cache");
const cacheMiddleware = require("../middlewares/cacheMiddleware");
const { getExchangeRate } = require("../utils/currencyCache");
const { admin } = require("../utils/firebase");
const { getCoupouns } = require("../utils/coupon-cached");
const { decryptData } = require("../utils/cryptoHelper");

router.patch("/products", cacheMiddleware("products"), async (req, res) => {
  try {
    let products = req.cachedData || cache.get("products");

    res.json({ success: true, products });
  } catch (error) {
    console.error("Error updating products cache:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Render customer field input page (no secret validation)
router.get("/product/:id/customer-field", cacheMiddleware("products"), async (req, res) => {
  try {
    const productId = req.params.id;
    let products = req.cachedData || cache.get("products");
    if (!products || !products.products) {
      products = await fetchProductsFromFirebase();
      cache.set("products", products);
    }
    const product = products.products.find((p) => p.id === productId);
    if (!product) return res.status(404).send("Product not found");
    const sanitized = sanitizeProduct(product);
    if (!sanitized.requireCustomerField) {
      return res.redirect(`/view/product/${sanitized.id}`);
    }
    res.render("product-customer-field", { product: sanitized, next: req.query.next || `/view/product/${sanitized.id}` });
  } catch (e) {
    console.error("Error rendering customer field page:", e);
    res.status(500).send("Internal Server Error");
  }
});

// Legacy route support: redirect old key page to new customer-field page
router.get("/product/:id/key", (req, res) => {
  const id = req.params.id;
  const nextParam = req.query.next ? `?next=${encodeURIComponent(req.query.next)}` : "";
  return res.redirect(`/product/${id}/customer-field${nextParam}`);
});

router.get("/products", cacheMiddleware("products"), async (req, res) => {
  res.locals.generatePageUrl = function (page, currentQuery) {
    const queryParams = new URLSearchParams(currentQuery);
    queryParams.set("page", page);
    return `?${queryParams.toString()}`;
  };

  try {
    // Step 1: Read user currency preference from cookies
    const userCurrency = req.cookies.currency || "EG"; // Default to EGP

    // Step 2: Fetch exchange rate if needed
    let exchangeRate = 1; // Default exchange rate for EGP
    if (userCurrency === "US") {
      exchangeRate = await getExchangeRate();
    }

    // Step 3: Use cached data if available
    let products = req.cachedData || cache.get("products");

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

    // Step 5: Process featured products
    const featuredProducts = products.products.filter((p) => p.isFeatured).map(sanitizeProduct);

    const page = parseInt(req.query.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    // Step 6: Process product prices and discounts
    let processedProducts = products.products.map((product) => {
      // console.log(product);
      let processedProduct;
      const discount = discounts.find((d) => d.productId === product.id);
      // console.log(new Date(product.endDate).getTime());
      if (new Date(product.endDate).getTime() < Date.now()) {
        // console.log(`Product ${product.id} has an expired discount.`);
        processedProduct = product;
      } else {
        // console.log(`Processing discount for product ${product.id}.`);
        processedProduct = processProductDiscount(product, discount);
      }

      // Convert price and bfDiscount if needed
      if (userCurrency === "US") {
        processedProduct.price = (processedProduct.price / exchangeRate).toFixed(2); // Convert price to USD
        if (processedProduct.bfDiscount) {
          processedProduct.bfDiscount = (processedProduct.bfDiscount / exchangeRate).toFixed(2); // Convert bfDiscount to USD
        }
      }

      return sanitizeProduct(processedProduct);
    });

    // Step 7: Apply filters
    processedProducts = applyFilters(processedProducts, req.query);

    // Sorting
    const sortBy = req.query.sortBy;
    if (sortBy === "price_asc") processedProducts.sort((a, b) => a.price - b.price);
    else if (sortBy === "price_desc") processedProducts.sort((a, b) => b.price - a.price);
    else if (sortBy === "name_asc") processedProducts.sort((a, b) => a.name.localeCompare(b.name));
    else if (sortBy === "name_desc") processedProducts.sort((a, b) => b.name.localeCompare(a.name));

    // Pagination
    const totalProducts = processedProducts.length;
    const totalPages = Math.ceil(totalProducts / limit);
    const paginatedProducts = processedProducts.slice(skip, skip + limit);

    // Unique categories with subcategories
    const categories = products.products.reduce((acc, product) => {
      const category = acc.find((c) => c.id === product.categoryId);
      if (category) {
        if (product.subcategoryName && !category.subcategories.includes(product.subcategoryName)) {
          category.subcategories.push(product.subcategoryName);
        }
      } else {
        acc.push({ id: product.categoryId, subcategories: product.subcategoryName ? [product.subcategoryName] : [] });
      }
      return acc;
    }, []);

    // console.log(categories);

    // Unique subcategories
    const subcategories = [...new Set(products.products.map((p) => p.subcategoryName).filter(Boolean))];

    // Step 8: Render the page with the correct currency
    res.render("products", {
      products: paginatedProducts,
      featuredProducts,
      currentPage: page,
      totalPages,
      categories,
      subcategories,
      currency: userCurrency, // Pass currency for display purposes
      filterValues: {
        search: req.query.search || "",
        selectedCategories: req.query.categories ? req.query.categories.split(",") : [],
        minPrice: req.query.minPrice || "",
        maxPrice: req.query.maxPrice || "",
        sortBy,
      },
      query: req.query,
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/all-products", cacheMiddleware("products"), async (req, res) => {
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

    // Step 5: Process product prices and discounts
    let processedProducts = products.products.map((product) => {
      const discount = discounts.find((d) => d.productId === product.id);
      let processedProduct = processProductDiscount(product, discount);

      // Convert price and bfDiscount if needed
      if (userCurrency === "US") {
        processedProduct.price = (processedProduct.price / exchangeRate).toFixed(2); // Convert price to USD
        if (processedProduct.bfDiscount) {
          processedProduct.bfDiscount = (processedProduct.bfDiscount / exchangeRate).toFixed(2); // Convert bfDiscount to USD
        }
      }

      return sanitizeProduct(processedProduct);
    });

    // Step 6: Respond with processed products
    res.json({
      success: true,
      products: processedProducts.map(sanitizeProduct),
      featuredProducts: products.products.filter((p) => p.isFeatured).map(sanitizeProduct),
    });
  } catch (error) {
    console.error("Error fetching all products:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/view/product/:id", cacheMiddleware("products"), async (req, res) => {
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

    // Step 5: Process product discounts and normalize account types
    let processedProducts = products.products.map((product) => {
      const discount = discounts.find((d) => d.productId === product.id);
      let processedProduct = processProductDiscount(product, discount);

      // Normalize accountTypes and convert prices based on currency
      if (Array.isArray(product.accountTypes)) {
        const at = product.accountTypes
          .filter((o) => o && typeof o.label === "string" && o.label.trim())
          .map((o) => {
            const months = Number.isFinite(parseInt(o.months, 10)) ? parseInt(o.months, 10) : 0;
            const rawPrice = Number.parseFloat(o.price || 0);
            const converted = userCurrency === "US" ? rawPrice / exchangeRate : rawPrice;
            return {
              label: o.label.trim(),
              months,
              price: Number(converted.toFixed(2)),
            };
          });
        processedProduct.accountTypes = at;
      }

      // Convert price and bfDiscount if needed
      if (userCurrency === "US") {
        processedProduct.price = (processedProduct.price / exchangeRate).toFixed(2); // Convert price to USD
        if (processedProduct.bfDiscount) {
          processedProduct.bfDiscount = (processedProduct.bfDiscount / exchangeRate).toFixed(2); // Convert bfDiscount to USD
        }
      }

      return processedProduct;
    });

    // Step 6: Find the product by ID
    const product = processedProducts.find((p) => p.id === req.params.id);

    if (!product) {
      return res.status(404).send("Product not found");
    }

    // Step 7: Fetch product-scoped coupons (valid, not expired)
    let productCoupons = [];
    try {
      const allCoupons = await getCoupouns();
      const now = Date.now();
      productCoupons = allCoupons
        .filter((c) => c && c.isValid && c.expired && c.expired.toMillis && c.expired.toMillis() > now && c.productId)
        .map((c) => ({
          id: c.id,
          name: c.name ? decryptData(c.name) : null,
          type: c.type ? decryptData(c.type) : null,
          amount: c.amount ? Number(decryptData(c.amount)) : null,
          productId: c.productId ? decryptData(c.productId) : null,
        }))
        .filter((c) => c.productId === product.id);
    } catch (e) {
      console.error("Error getting coupons for product:", e);
      productCoupons = [];
    }

    // Step 8: Build dynamic SEO meta data (prefer stored SEO fields when present)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const safeDesc = (product.description || "").toString().replace(/\s+/g, ' ').trim();
    const fallbackTitle = `${product.name} – ${product.categoryId} | Manga Store`;
    const fallbackDesc = safeDesc.length > 0 ? (safeDesc.length > 160 ? `${safeDesc.slice(0,157)}...` : safeDesc) : `${product.name} available on Manga Store.`;
    const fallbackKeywords = [product.name, product.categoryId, product.subcategoryName, 'manga', 'buy online', 'best price']
      .filter(Boolean)
      .join(', ');

    const metaTitle = (product.seoTitle && String(product.seoTitle).trim()) || fallbackTitle;
    const metaDescription = (product.seoDescription && String(product.seoDescription).trim()) || fallbackDesc;
    const metaKeywords = (() => {
      if (Array.isArray(product.seoKeywords) && product.seoKeywords.length) {
        return product.seoKeywords.map(String).join(', ');
      }
      if (product.seoKeywords && typeof product.seoKeywords === 'string') {
        return product.seoKeywords;
      }
      return fallbackKeywords;
    })();
    const metaImage = product.images;
    const metaUrl = `${baseUrl}/view/product/${product.id}`;

    // Step 9: Render the product page with the adjusted price, coupons, and meta
    res.render("view-product", {
      product: sanitizeProduct(product),
      currency: userCurrency,
      coupons: productCoupons,
      metaTitle,
      metaDescription,
      metaKeywords,
      metaImage,
      metaUrl,
    });
  } catch (error) {
    console.error("Error fetching product:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/update-products", async (req, res) => {
  const uid = req.body.uid;

  try {
    // Fetch user data from Firebase Auth
    const user = await admin.auth().getUser(uid);

    // Check if the user has the required role
    const userRole = user.customClaims && user.customClaims.role;
    if (userRole !== "admin" && userRole !== "moderator") {
      return res.status(403).json({ success: false, message: "Forbidden: Insufficient permissions" });
    }

    const products = await fetchProductsFromFirebase();

    if (!products || !products.products) {
      throw new Error("Fetched products data is invalid!");
    }

    cache.set("products", products);

    res.json({ success: true, message: "Products cache updated successfully" });
  } catch (error) {
    console.error("Error updating products cache:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Add this new route after the existing routes
router.get("/api/product/:id", cacheMiddleware("products"), async (req, res) => {
  try {
    const productId = req.params.id;

    if (!productId) {
      return res.status(400).json({ success: false, error: "Product ID is required" });
    }

    // Get products from cache or fetch them
    let products = req.cachedData || cache.get("products");

    if (!products || !products.products) {
      console.log("Cache is empty or invalid, fetching fresh data...");
      products = await fetchProductsFromFirebase();
      if (!products || !products.products) {
        throw new Error("Fetched products data is invalid!");
      }
      cache.set("products", products);
    }

    // Find the product by ID
    const product = products.products.find((p) => p.id === productId);

    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }

    // Get discount information if available
    const discounts = products.discounts || [];
    const discount = discounts.find((d) => d.productId === productId);

    // Process the product with discount information
    const processedProduct = processProductDiscount(product, discount);

    // Return the product data
    res.json({
      ...sanitizeProduct(processedProduct),
      success: true,
    });
  } catch (error) {
    console.error(`Error fetching product ${req.params.id}:`, error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

// Helper Functions
function processProductDiscount(product, discount) {
  if (!discount) return product;

  const now = new Date();
  const startDate = discount.startDate.toDate();
  const endDate = discount.endDate.toDate();

  if (now >= startDate && now <= endDate) {
    const finalPrice =
      discount.discountType === "fixed"
        ? product.price - discount.discountValue
        : product.price * (1 - discount.discountValue / 100);

    return {
      ...product,
      bfDiscount: product.price,
      price: finalPrice,
      discount: discount.discountType
        ? `${discount.discountValue} ${discount.discountType === "percentage" ? "%" : "L.E"}`
        : null,
      startDate,
      endDate,
    };
  }

  return product;
}

function applyFilters(products, query) {
  return products.filter((product) => {
    // Search filter
    if (query.search && !product.name.toLowerCase().includes(query.search.toLowerCase())) {
      return false;
    }

    // Subcategory filter
    if (query.subCategory && query.subCategory.length > 0) {
      const selectedSubcategories = query.subCategory.split(",");
      if (!selectedSubcategories.includes(product.subcategoryName)) return false;
    }

    // Category filter
    if (query.categories && query.categories.length > 0) {
      const selectedCategories = query.categories.split(",");
      
      // Special case for Top Sellers
      if (selectedCategories.includes('Top Sellers')) {
        // If Top Sellers is selected, include products that are featured
        if (product.isFeatured) {
          return true;
        }
      }
      
      if (!selectedCategories.includes(product.categoryId)) return false;
    }

    // Price filter
    const price = product.price || product.bfDiscount;
    if (query.minPrice && price < parseFloat(query.minPrice)) return false;
    if (query.maxPrice && price > parseFloat(query.maxPrice)) return false;

    return true;
  });
}

module.exports = router;

// Ensure we never leak secret fields and always include a normalized flag
function sanitizeProduct(product) {
  if (!product || typeof product !== 'object') return product;
  const { productKeyEncrypted, ...rest } = product;
  // Backward compatibility: if legacy requireKey is still set, treat it as requireCustomerField
  const legacyRequire = !!product.requireKey;
  const requireCF = legacyRequire || !!product.requireCustomerField;
  const label = product.customerFieldLabel || product.keyLabel || null;
  return {
    ...rest,
    // expose new customer field flags for frontend
    requireCustomerField: requireCF,
    customerFieldLabel: label ? String(label) : null,
  };
}
