const { getExchangeRate } = require("../utils/currencyCache");
const express = require("express");
const router = express.Router();

router.get("/exchange-rate/:currency", async (req, res) => {
  const currency = req.params.currency;
  if (currency === "US") {
    const exchangeRate = await getExchangeRate();
    res.json({ exchangeRate });
  } else if (currency === "EG") {
    res.json({ exchangeRate: 1 });
  } else {
    res.status(400).json({ error: "Invalid currency" });
  }
});

module.exports = router;
