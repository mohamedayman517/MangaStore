const { admin, db, storage, frontDB, adminAuth, frontAuth } = require("../utils/firebase");
const fetch = require("node-fetch");

async function fetchAndSaveCategoriesAndProducts() {
  try {
    // Fetch products from Fake Store API
    const response = await fetch("https://fakestoreapi.com/products");
    const products = await response.json();

    // Extract unique categories
    const categoriesSet = new Set(products.map((product) => product.category));
    const categories = Array.from(categoriesSet);

    // Save categories to Firestore
    const categoriesRef = db.collection("categories");
    for (const category of categories) {
      const categoryData = {
        name: category,
        createdAt: admin.firestore.Timestamp.now(),
      };

      await categoriesRef.doc(category).set(categoryData);
    }

    // Save products to Firestore
    const productsRef = db.collection("products");
    for (const product of products) {
      const productData = {
        id: product.id.toString(), // Convert ID to string for consistency
        name: product.title,
        description: product.description,
        stock: Math.floor(Math.random() * 100) + 1, // Random stock between 1 and 100
        images: product.image,
        price: product.price.toFixed(2), // Ensure price is a string with 2 decimals
        isFeatured: Math.random() < 0.5, // Randomly mark as featured
        categoryId: product.category, // Use category directly from the API
      };

      await productsRef.doc(productData.id).set(productData);
      console.log(`Product "${productData.name}" added to Firestore.`);
    }

    console.log("Categories and products successfully added to Firestore.");
  } catch (error) {
    console.error("Error fetching or saving data:", error);
  }
}

fetchAndSaveCategoriesAndProducts();
