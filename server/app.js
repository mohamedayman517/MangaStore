const express = require("express");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
// const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
// Load env vars BEFORE importing any modules that depend on them (e.g., firebase-admin)
dotenv.config();
// Import after dotenv is configured
const verifyAdmin = require("./middlewares/verifyAdmin");
const { rateLimit, strictRateLimit } = require("./middlewares/rateLimit");
const { exportAllToSheets } = require("./utils/exports");

const app = express();
// Resolve client directories (supports future client/ folder)
const ROOT_DIR = __dirname;
const CLIENT_DIR = (() => {
  if (process.env.CLIENT_DIR) return path.resolve(process.env.CLIENT_DIR);
  const sibling = path.resolve(ROOT_DIR, "..", "client");
  if (fs.existsSync(sibling)) return sibling;
  return path.resolve(ROOT_DIR, "client");
})();
const VIEWS_DIR = fs.existsSync(path.join(CLIENT_DIR, "views"))
  ? path.join(CLIENT_DIR, "views")
  : path.join(ROOT_DIR, "views");
const PUBLIC_DIR = fs.existsSync(path.join(CLIENT_DIR, "public"))
  ? path.join(CLIENT_DIR, "public")
  : path.join(ROOT_DIR, "public");
// Middleware
app.set("trust proxy", true);
app.use(compression());
app.use(morgan("combined"));

// Rate limiting: global and stricter for sensitive paths
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // global generous cap
  })
);
// Apply strict limiter only for POST requests on sensitive paths
const sensitivePaths = [
  "/login",
  "/register",
  "/checkout",
  "/payment",
  "/users",
  "/admin",
];
app.use(sensitivePaths, (req, res, next) => {
  if (req.method !== "POST") return next();
  // Allow disabling strict rate limit for rapid local testing
  const disabled = String(process.env.RATE_LIMIT_DISABLE || "false").toLowerCase() === "true";
  if (disabled) return next();
  // Use per-path key to avoid exhausting budget across different endpoints
  return strictRateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    keyGenerator: (req) => `${req.uid || req.ip}:${req.path}`,
  })(req, res, next);
});

// Moderate limiter for public APIs (countries, cities, flags, etc.)
app.use(
  "/api",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 })
);

// Generous limiter for exchange-rate endpoint (frontend relies on it often)
app.use(
  "/exchange-rate",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 2000 })
);

app.set("view engine", "ejs");
app.set("views", VIEWS_DIR);

app.use(express.static(PUBLIC_DIR));
// Serve favicon to avoid 404 noise
app.get("/favicon.ico", (req, res) => {
  const iconPath = fs.existsSync(path.join(PUBLIC_DIR, "icons", "mango_32x32.png"))
    ? path.join(PUBLIC_DIR, "icons", "mango_32x32.png")
    : path.join(PUBLIC_DIR, "icons", "mango_32x32.png");
  res.sendFile(iconPath);
});
app.use(express.json());
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));

// Public home routes (data-driven)
const homeRoute = require("./routes/home");
app.use("/", homeRoute);

// ! users
const usersRouter = require("./routes/users");
app.use("/users", usersRouter);

// Products and Countries APIs (needed by frontend JS)
const productsRoute = require("./routes/products");
app.use("/", productsRoute);

// Public Q&A API (for FAQ widget)
const publicQnaRoute = require("./routes/public-qna");
app.use("/", publicQnaRoute);

// Google Sheets (public read via API key)
const sheetsRoute = require("./routes/sheets");
app.use("/", sheetsRoute);

// Checkout and Payment Routes
const checkoutRoute = require("./routes/checkout");
app.use("/", checkoutRoute);

const paymentRoute = require("./routes/payment");
app.use("/", paymentRoute);

const countriesRoute = require("./routes/countries");
app.use("/", countriesRoute);

// Accounts claim (Google Sheets SITUATION=Yes -> return and mark USED)
const accountsRoute = require("./routes/accounts");
app.use("/", accountsRoute);

// Currency exchange rate API
const currencyRoute = require("./routes/currency");
app.use("/", currencyRoute);

// ! Orders (user orders pages)
const ordersRoutes = require("./routes/orders");
app.use("/", ordersRoutes);

// Reviews API (order-level reviews)
const reviewsRoutes = require("./routes/reviews");
app.use("/", reviewsRoutes);

// Admin-only landing (optional)
app.get("/admin", verifyAdmin, async (req, res) => {
  res.render("index");
});

// ! Categories and products
const addCategoryRoute = require("./routes/manage-categories");
app.use("/admin", addCategoryRoute);

// ! Coupons
const couponsRoutes = require("./routes/coupon");
app.use("/admin", couponsRoutes);

// ! sliders
const slidersRoutes = require("./routes/sliders");
app.use("/admin", slidersRoutes);

// ! discounts
const discountsRoutes = require("./routes/discounts");
app.use("/admin", discountsRoutes);

// ! banner
const bannerRoutes = require("./routes/banner");
app.use("/admin", bannerRoutes);

// ! Transacations
const transacationsRoutes = require("./routes/transacations");
app.use("/admin", transacationsRoutes);

// ! Tickets
const ticketsRoutes = require("./routes/tickets");
app.use("/admin", ticketsRoutes);

// ! Admin Auto-Prepare (claim from Google Sheet and fill proof)
const autoPrepareRoute = require("./routes/auto-prepare");
app.use("/", autoPrepareRoute);

// ! Admin Reviews
const adminReviewsRoutes = require("./routes/admin-reviews");
app.use("/admin", adminReviewsRoutes);

// ! Q&A
const questionsAndAnswers = require("./routes/questions-answers");
app.use("/admin", questionsAndAnswers);

// ! Admin Exports (Google Sheets)
const adminExportsRoutes = require("./routes/admin-exports");
app.use("/", adminExportsRoutes);

// ! Home Sections (custom homepage sections)
const homeSectionsRoutes = require("./routes/home-sections");
app.use("/admin", homeSectionsRoutes);

// ! Login
const loginRoutes = require("./routes/login");
app.use("/", loginRoutes);

// ! Register
const registerRoutes = require("./routes/register");
app.use("/", registerRoutes);

// ! Logout
const logoutRoute = require("./routes/logout");
app.use("/", logoutRoute);

// ! Google Login (OAuth callback)
const googleLoginRoutes = require("./routes/google-login");
app.use("/", googleLoginRoutes);

// ! Profile
const profileRoutes = require("./routes/profile");
app.use("/", profileRoutes);

// ! Wishlist
const wishlistRoutes = require("./routes/wishlist");
app.use("/", wishlistRoutes);

// Avatar proxy (to avoid browser ORB/CORS on external profile images)
const avatarProxyRoute = require("./routes/avatar");
app.use("/", avatarProxyRoute);

// ! Pin category
const pinCategory = require("./routes/pin-category");
app.use("/", pinCategory);

// ! Batch operations
const batchOperationsRoutes = require("./routes/batch-operations");
app.use("/", batchOperationsRoutes);

// ! Marketing emails
const marketingEmails = require("./routes/marketing");
app.use("/", marketingEmails);

// ! Support (tickets)
const supportRoutes = require("./routes/support");
app.use("/", supportRoutes);

// AI utilities (descriptions, moderation)
const aiRoutes = require("./routes/ai");
app.use("/", aiRoutes);

// Email verification routes
const verifyEmailRoutes = require("./routes/verify-email");
app.use("/", verifyEmailRoutes);

// Debug SMTP (guarded by env)
if (String(process.env.SMTP_DEBUG_ENABLE || "false").toLowerCase() === "true") {
  try {
    const debugSmtpRoutes = require("./routes/debug-smtp");
    app.use("/", debugSmtpRoutes);
  } catch (e) {
    console.warn("Failed to mount debug-smtp routes:", e?.message || e);
  }
}

// Cron and unsubscribe routes
const cronRoutes = require("./routes/cron");
app.use("/", cronRoutes);
const unsubscribeRoutes = require("./routes/unsubscribe");
app.use("/", unsubscribeRoutes);

// Internal hourly export scheduler (optional)
let __exportLock = false;
function scheduleInternalExports() {
  const enabled = String(process.env.AUTO_EXPORT_CRON || "false").toLowerCase() === "true";
  if (!enabled) return;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId || !process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.warn("[AutoExport] Missing Google Sheets env vars; auto export disabled.");
    return;
  }
  const minutes = parseInt(process.env.EXPORT_INTERVAL_MINUTES || "60", 10);
  const intervalMs = Math.max(5, isFinite(minutes) ? minutes : 60) * 60 * 1000;

  async function runOnce(tag = "scheduled") {
    if (__exportLock) {
      console.log(`[AutoExport] Skip (${tag}): previous run still in progress`);
      return;
    }
    __exportLock = true;
    const started = new Date();
    console.log(`[AutoExport] Start (${tag}) at ${started.toISOString()}`);
    try {
      const result = await exportAllToSheets({ spreadsheetId });
      const finished = new Date();
      console.log(`[AutoExport] Done in ${((finished - started) / 1000).toFixed(1)}s ->`, result);
    } catch (e) {
      console.error("[AutoExport] Failed:", e && e.message ? e.message : e);
    } finally {
      __exportLock = false;
    }
  }

  // Kickoff once after boot
  setTimeout(() => runOnce("boot"), 10_000);
  // Schedule interval
  setInterval(() => runOnce("interval"), intervalMs);
  console.log(`[AutoExport] Enabled: interval ${minutes} minute(s)`);
}

scheduleInternalExports();

// Error handling
app.use((req, res, next) => {
  res.status(404).render("error", {
    title: "Page Not Found",
    message: "The page you are looking for does not exist.",
    statusCode: 404,
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error", {
    title: "Server Error",
    message: "Something went wrong on our end.",
    statusCode: 500,
  });
});

// Start the server
const PORT = process.env.PORT || 3200;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
