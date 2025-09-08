const fs = require("fs");
const path = require("path");
const router = require("express").Router();

// Resolve public assets directory compatible with split client/server
const SERVER_DIR = path.resolve(__dirname, "..");
const CLIENT_DIR = (() => {
  if (process.env.CLIENT_DIR) return path.resolve(SERVER_DIR, process.env.CLIENT_DIR);
  const sibling = path.resolve(SERVER_DIR, "..", "client");
  if (fs.existsSync(sibling)) return sibling;
  return path.resolve(SERVER_DIR, "client");
})();
const PUBLIC_DIR = fs.existsSync(path.join(CLIENT_DIR, "public"))
  ? path.join(CLIENT_DIR, "public")
  : path.join(SERVER_DIR, "public");

const dataPath = path.join(PUBLIC_DIR, "assets", "countries.min.json"); // Path to your JSON file
let cachedData = null;
// Load and cache countries and cities data
fs.readFile(dataPath, "utf8", (err, data) => {
  if (err) {
    console.error("Error loading countries and cities data:", err);
  } else {
    cachedData = JSON.parse(data); // Cache the data in memory
    console.log("Countries and cities data loaded successfully.");
  }
});

router.get("/api/countries", (req, res) => {
  const countries = cachedData.map(({ cities, phonecode, flag, ...rest }) => rest);
  res.status(200).json({ success: true, data: countries });
});

// Endpoint to fetch cities by country code
router.get("/api/cities", (req, res) => {
  if (!cachedData) {
    return res.status(500).json({ error: "Data not available" });
  }

  const countryCode = req.query.country; // e.g., "US"
  if (!countryCode) {
    return res.status(400).json({ error: "Country code is required" });
  }

  const country = cachedData.find((c) => c.iso2 === countryCode.toUpperCase());
  if (!country) {
    return res.status(404).json({ error: "Country not found" });
  }

  res.json(country.cities);
});

router.get("/api/countries/flags/:countryCode", (req, res) => {
  if (!cachedData) {
    return res.status(500).json({ error: "Data not available" });
  }

  const countryCode = req.params.countryCode.toUpperCase();
  const country = cachedData.find((c) => c.iso2 === countryCode);
  if (!country) {
    return res.status(404).json({ error: "Country not found" });
  }

  res.json({ flag: country.flag });
});

let cachedCountries = null;

router.get("/api/countries", (req, res) => {
  if (!cachedData) {
    return res.status(500).json({ error: "Data not available" });
  }

  cachedCountries = cachedData.map(({ cities, phonecode, ...rest }) => rest);

  res.json(cachedCountries);
});

let cachedPhonePrefixes = null;

// Load phone prefixes data

// API Endpoint to fetch phone prefixes
router.get("/api/phonePrefixes", (req, res) => {
  if (!cachedData) {
    return res.status(500).json({ error: "Data not available" });
  }
  cachedPhonePrefixes = cachedData.map(({ cities, name, ...rest }) => rest);

  res.json(cachedPhonePrefixes);
});

module.exports = router;
