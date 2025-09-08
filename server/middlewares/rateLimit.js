// Simple in-memory rate limiting middleware (IP-based)
// Usage:
//   const { rateLimit, strictRateLimit } = require("./middlewares/rateLimit");
//   app.use(rateLimit());
//   app.use(["/login", "/register", "/checkout", "/profile", "/admin", "/api"], strictRateLimit());

const store = new Map(); // key -> { count, resetTime }
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60 * 1000) return; // cleanup at most once/min
  for (const [key, value] of store.entries()) {
    if (value.resetTime <= now) store.delete(key);
  }
  lastCleanup = now;
}

function createLimiter({ windowMs, max, keyGenerator, message }) {
  return function rateLimiter(req, res, next) {
    cleanup();

    const key = (keyGenerator ? keyGenerator(req) : req.ip) || req.ip || "global";
    const now = Date.now();

    let item = store.get(key);
    if (!item || item.resetTime <= now) {
      item = { count: 0, resetTime: now + windowMs };
      store.set(key, item);
    }

    item.count += 1;

    const remaining = Math.max(0, max - item.count);
    const retryAfterSec = Math.ceil((item.resetTime - now) / 1000);

    // Standard rate limit headers
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("X-RateLimit-Reset", String(Math.floor(item.resetTime / 1000)));

    if (item.count > max) {
      res.setHeader("Retry-After", String(retryAfterSec));
      const accept = (req.headers["accept"] || "").toLowerCase();
      const isApi = (req.originalUrl || req.url || "").startsWith("/api");
      res.status(429);
      if (isApi || accept.includes("json")) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(JSON.stringify({ error: "Too many requests", retryAfterSec }));
      }
      return res.send("Too many requests. Please try again later.");
    }

    next();
  };
}

function rateLimit(config = {}) {
  return createLimiter({
    windowMs: config.windowMs ?? 15 * 60 * 1000, // 15 minutes
    max: config.max ?? 1000, // global generous cap
    keyGenerator: config.keyGenerator,
    message: config.message,
  });
}

function strictRateLimit(config = {}) {
  return createLimiter({
    windowMs: config.windowMs ?? 15 * 60 * 1000,
    max: config.max ?? 100, // stricter for auth/payment/profile
    keyGenerator: config.keyGenerator,
    message: config.message,
  });
}

module.exports = { rateLimit, strictRateLimit };
