require("dotenv").config();
(async()=>{
  const axios = require("axios");
  const svc = require("../utils/egiftly");
  const t = await svc.login();
  const { EGIFTLY_BASE_URL, EGIFTLY_CLIENT_ID, EGIFTLY_ORDER_CREATE_PATH } = process.env;
  const base = EGIFTLY_BASE_URL;
  const path1 = EGIFTLY_ORDER_CREATE_PATH || "/api/orders";
  const path2 = "/api/order/create"; // مسار بديل شائع
  const headers = { "egiftly-client-id": EGIFTLY_CLIENT_ID, "Authorization": "Bearer " + t, "Content-Type":"application/json", "Accept":"application/json" };

  const brandId = 56;   // عدّلها
  const denomId = 123;  // عدّلها من ناتج الـ denominations

  const ref = "manual-" + Date.now();
  const variants = [
    {
      name: "camelCase objects",
      body: { brandId: { id: brandId }, denominationId: { id: denomId }, quantity: 1, reference: ref, uniqueOrderId: { id: ref }, recipient: { email: "test@example.com" } }
    },
    {
      name: "items[] variant",
      body: { items: [ { brandId: { id: brandId }, denominationId: { id: denomId }, quantity: 1 } ], reference: ref, uniqueOrderId: { id: ref }, recipient: { email: "test@example.com" } }
    },
    {
      name: "snake_case primitives",
      body: { brand_id: brandId, denomination_id: denomId, quantity: 1, reference: ref, uniqueOrderId: { id: ref }, recipient: { email: "test@example.com" } }
    }
  ];

  for (const v of variants) {
    for (const p of [path1, path2]) {
      try {
        console.log("== Trying", v.name, "on", p);
        const r = await axios.post(base + p, v.body, { headers });
        console.log("OK status", r.status);
        console.log("DATA", JSON.stringify(r.data, null, 2));
        process.exit(0);
      } catch (e) {
        console.error("Failed", v.name, "on", p, "status", e?.response?.status);
        console.error("DATA", JSON.stringify(e?.response?.data || e.message, null, 2));
      }
    }
  }
  process.exit(1);
})().catch(e=>{
  console.error("FATAL", e?.response?.status, JSON.stringify(e?.response?.data || e.message, null, 2));
  process.exit(1);
});
