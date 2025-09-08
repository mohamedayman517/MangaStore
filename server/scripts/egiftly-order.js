require("dotenv").config();
(async()=>{
  const eg = require("../utils/egiftly");
  const resp = await eg.createOrder({
    brandId: 56,           // <-- عدّلها
    denominationId: 123,   // <-- عدّلها
    quantity: 1,
    reference: "manual-" + Date.now(),
    recipient: { email: "test@example.com" }
  });
  console.log("DATA", JSON.stringify(resp, null, 2));
})().catch(e=>{
  console.error("STATUS", e?.response?.status);
  console.error("DATA", JSON.stringify(e?.response?.data || e.message, null, 2));
  process.exit(1);
});
