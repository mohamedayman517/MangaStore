const cache = require("./cache");
const { admin, db, storage, frontDB, adminAuth, frontAuth } = require("./firebase");

const CACHE_KEY = "coupons";
const CACHE_DURATION = 24 * 60 * 60; // 24 hours in seconds

const getCoupouns = async () => {
  let coupons = cache.get(CACHE_KEY);

  if (!coupons) {
    try {
      const snapshot = await db.collection("coupons").get();

      coupons = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      cache.set(CACHE_KEY, coupons, CACHE_DURATION);
    } catch (error) {
      console.error("Error fetching coupons from Firebase:", error);
      return [];
    }
  }

  return coupons;
};

module.exports = { getCoupouns };
