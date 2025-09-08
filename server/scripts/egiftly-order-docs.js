require("dotenv").config();
(async()=>{
  const eg = require("../utils/egiftly");
  const resp = await eg.createOrder({
    denominationId: 155,        // من الـ detail/list
    uniqueDenominationId: 1009, // إن كان موجودًا/مطلوبًا
    quantity: 1,
    reference: "manual-" + Date.now()
  });
  console.log("DATA", JSON.stringify(resp, null, 2));
})().catch(e=>{
  console.error("STATUS", e?.response?.status);
  console.error("DATA", JSON.stringify(e?.response?.data || e.message, null, 2));
  process.exit(1);
});
