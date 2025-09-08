const NodeCache = require("node-cache");
const cache = new NodeCache({ stdTTL: 86400, checkperiod: 3600 }); // 1-day cache

module.exports = cache;
