require("dotenv").config();
(async()=>{
  const axios = require("axios");
  const svc = require("../utils/egiftly");
  const t = await svc.login();
  const { EGIFTLY_BASE_URL, EGIFTLY_CLIENT_ID } = process.env;
  const BRAND_ID = 56; // <-- عدّلها
  const url = EGIFTLY_BASE_URL + "/api/denominations?brand_id=" + BRAND_ID;
  const r = await axios.get(url, {
    headers: { "egiftly-client-id": EGIFTLY_CLIENT_ID, "Authorization": "Bearer " + t, "Accept": "application/json" }
  });
  console.log("STATUS", r.status);
  console.log("DATA", JSON.stringify(r.data, null, 2));
})().catch(e=>{
  console.error("STATUS", e?.response?.status);
  console.error("DATA", JSON.stringify(e?.response?.data || e.message, null, 2));
  process.exit(1);
});
