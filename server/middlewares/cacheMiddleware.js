const cache = require("../utils/cache");

const cacheMiddleware = (key) => (req, res, next) => {
  const cachedData = cache.get(key);
  if (cachedData) {
    console.log(`Cache hit for ${key}`);
    req.cachedData = cachedData; // Attach cached data to the request
  }
  next(); // Always call next() so the route handler runs
};

module.exports = cacheMiddleware;
