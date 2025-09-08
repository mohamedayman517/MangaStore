// utils/currencyCache.js
const axios = require("axios");
const cache = require("./cache");

const EXCHANGE_API_URL = `https://v6.exchangerate-api.com/v6/${process.env.CURRENCY_API_KEY}/pair/USD/EGP`;

const getExchangeRate = async () => {
  // Check if rate is cached
  let rate = cache.get("usdToEgpRate");

  if (!rate) {
    try {
      // Fetch the latest rate from the API
      const response = await axios.get(EXCHANGE_API_URL);
      rate = response.data.conversion_rate;

      // Cache the rate for 24 hours
      cache.set("usdToEgpRate", rate);
    } catch (error) {
      throw new Error("Failed to fetch exchange rate");
    }
  }

  return rate;
};

const refreshExchangeRate = () => {
  setTimeout(async () => {
    cache.del("usdToEgpRate");
    await getExchangeRate();
    refreshExchangeRate(); // Schedule the next refresh
  }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
};

// Start the repeated execution
refreshExchangeRate();

module.exports = { getExchangeRate };
