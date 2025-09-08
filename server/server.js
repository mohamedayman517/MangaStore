const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const cache = require("./utils/cache");

const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");

const fetchProductsFromFirebase = require("./utils/fetchProducts");
require("dotenv").config();
const app = express();
const PORT = process.env.PORT || 3000; // Use environment variable for production
const path = require("path");
const fs = require("fs");

// Resolve client directories (supports future client/ folder)
const ROOT_DIR = __dirname;
const CLIENT_DIR = process.env.CLIENT_DIR
  ? path.resolve(process.env.CLIENT_DIR)
  : path.resolve(ROOT_DIR, "client");
const VIEWS_DIR = fs.existsSync(path.join(CLIENT_DIR, "views"))
  ? path.join(CLIENT_DIR, "views")
  : path.join(ROOT_DIR, "views");
const PUBLIC_DIR = fs.existsSync(path.join(CLIENT_DIR, "public"))
  ? path.join(CLIENT_DIR, "public")
  : path.join(ROOT_DIR, "public");

// Middlewarees
app.use(compression());
app.use(morgan("tiny"));
// app.use(helmet());
// app.use(
//   cors({
//     origin: ["http://localhost:3000", "'https://ipwho.is/'", "'https://identitytoolkit.googleapis.com/'"],
//     methods: ["GET", "POST", "PUT", "DELETE"],
//     credentials: true,
//   })
// );
app.use(cookieParser());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.set("views", VIEWS_DIR);
app.disable("x-powered-by");

// auth route
const loginRoutes = require("./routes/login");
app.use("/", loginRoutes);

// profile route
const profileRoute = require("./routes/profile");
app.use("/", profileRoute);

// home Route
const homeRoute = require("./routes/home");
app.use("/", homeRoute);

// Products Route
const productsRoute = require("./routes/products");
app.use("/", productsRoute);

// Chaeckout Methods Route
const checkoutRoute = require("./routes/checkout");
app.use("/", checkoutRoute);

// Payment Methods Route
const paymentRoute = require("./routes/payment");
app.use("/", paymentRoute);

// Register Route
const regitserRoute = require("./routes/register");
app.use("/", regitserRoute);

// Google login Route
const googleLoginRoutes = require("./routes/google-login");

app.use("/", googleLoginRoutes);

// Logout Route
const logoutRoute = require("./routes/logout");
app.use("/", logoutRoute);

// Load countries data
const countries = require("./routes/countries");
app.use("/", countries);

// Orders Route
const ordersRoute = require("./routes/orders");
app.use("/", ordersRoute);

// Support Route
const supportRoute = require("./routes/support");
app.use("/", supportRoute);

// Currency Route api
const currencyRoute = require("./routes/currency");
app.use("/", currencyRoute);

// Support Route
const resetPasswordRoute = require("./routes/reset-password");
app.use("/", resetPasswordRoute);

// Verify email Route
const verifyEmailRoutes = require("./routes/verify-email");
app.use("/", verifyEmailRoutes);

// Public Q&A API for chatbot
const publicQnaRoutes = require("./routes/public-qna");
app.use("/", publicQnaRoutes);

// AI routes (admin AI tools + public chatbot)
const aiRoutes = require("./routes/ai");
app.use("/", aiRoutes);

// Admin middleware
const verifyAdmin = require("./middlewares/verifyAdmin");

// Admin dashboard route
app.get("/admin", verifyAdmin, async (req, res) => {
  res.render("index");
});

// Admin users route
const usersRouter = require("./routes/users");
app.use("/users", usersRouter);

// Admin Categories and products
const addCategoryRoute = require("./routes/manage-categories");
app.use("/admin", addCategoryRoute);

// Admin Coupons
const couponsRoutes = require("./routes/coupon");
app.use("/admin", couponsRoutes);

// Admin sliders
const slidersRoutes = require("./routes/sliders");
app.use("/admin", slidersRoutes);

// Admin discounts
const discountsRoutes = require("./routes/discounts");
app.use("/admin", discountsRoutes);

// Admin banner
const bannerRoutes = require("./routes/banner");
app.use("/admin", bannerRoutes);

// Admin Transactions
const transacationsRoutes = require("./routes/transacations");
app.use("/admin", transacationsRoutes);

// Admin Tickets
const ticketsRoutes = require("./routes/tickets");
app.use("/admin", ticketsRoutes);

// Admin Q&A
const questionsAndAnswers = require("./routes/questions-answers");
app.use("/admin", questionsAndAnswers);

// Admin Home Sections (custom homepage sections)
const homeSectionsRoutes = require("./routes/home-sections");
app.use("/admin", homeSectionsRoutes);

// Admin Pin category
const pinCategory = require("./routes/pin-category");
app.use("/", pinCategory);

// Admin Batch operations
const batchOperationsRoutes = require("./routes/batch-operations");
app.use("/", batchOperationsRoutes);

// Admin Marketing emails
const marketingEmails = require("./routes/marketing");
app.use("/", marketingEmails);

app.get("/config", (req, res) => {
  res.status(200).json({ message: "Service is healthy" });
});

app.post("/admin/update-products", async (req, res) => {
  console.log("Admin updated products, refreshing cache...");
  cache.del("products"); // Clear cache
  const data = await fetchFromFirebase(); // Fetch fresh data
  cache.set("products", data); // Update cache
  res.json({ success: true, message: "Cache updated" });
});
fetchProductsFromFirebase();
// Refresh cache every 24 hours (1 day)
setInterval(() => {
  console.log("Refreshing cache automatically...");
  fetchProductsFromFirebase();
}, 24 * 60 * 60 * 1000);

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
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
