const { getDocs, collection } = require("firebase/firestore");
const { frontDB } = require("../utils/firebase");
const cache = require("./cache");

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

// Fetch & Process Products
const fetchProductsFromFirebase = async () => {
  try {
    const productsCollection = collection(frontDB, "products");
    const discountsCollection = collection(frontDB, "discounts");

    const [productsSnapshot, discountsSnapshot] = await Promise.all([
      getDocs(productsCollection),
      getDocs(discountsCollection),
    ]);

    const products = productsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const discounts = discountsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const processedProducts = products.map((product) => {
      const discount = discounts.find((d) => d.productId === product.id);
      return processProductDiscount(product, discount);
    });

    // Store in cache
    const data = { products: processedProducts };
    // console.log(processedProducts);
    cache.set("products", data);
    return data;
  } catch (error) {
    console.error("Error fetching products:", error);
    return null;
  }
};

module.exports = fetchProductsFromFirebase;
