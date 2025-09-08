const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const verifyAdmin = require("../middlewares/verifyAdmin");
const { Timestamp } = admin.firestore;
const { sendEmail } = require("../utils/mailer");
const { enqueueReviewRequest } = require("../utils/emailQueue");
const {
  ToPayTemplate,
  DeliveredTemplate,
  ConfirmedTemplate,
  EmailVerifyTemplate,
  rejectedTemplate,
  GiftRecipientTemplate,
  ReviewRequestTemplate,
} = require("../templates");
const { encryptData, decryptData } = require("../utils/cryptoHelper");
const egiftly = require("../utils/egiftly");

function formatTransactionData(transaction) {
  return {
    orderId: transaction.id,
    placedDate: new Date(transaction.createdAt._seconds * 1000).toISOString().split("T")[0], // Convert timestamp to YYYY-MM-DD
    paymentMethod: transaction.paymentMethod,
    currency: transaction.currency,
    items: transaction.products.map((product) => ({
      orderItem: product.name,
      totalPrice: parseFloat(product.price), // Convert price string to number
    })),
  };
}

router.get("/transactions", verifyAdmin, async (req, res) => {
  const transactions = await db.collection("transactions").get();
  const formattedData = transactions.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const amPm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${year}-${month}-${day} ${hours}:${minutes} ${amPm}`;
  }

  // Pass it to EJS templates
  res.locals.formatTimestamp = formatTimestamp;

  // res.status(200).json({ transactions: formattedData });

  res.render("transactions/transactions", { transactions: formattedData });
});

// Admin Gifts Listing
router.get("/gifts", verifyAdmin, async (req, res) => {
  try {
    const giftsSnap = await db.collection("transactions").where("isGift", "==", true).get();
    const gifts = giftsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    function formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const amPm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;
      return `${year}-${month}-${day} ${hours}:${minutes} ${amPm}`;
    }
    res.locals.formatTimestamp = formatTimestamp;

    res.render("transactions/gifts", { gifts });
  } catch (err) {
    console.error("Error loading gifts:", err);
    res.status(500).send("Failed to load gifts");
  }
});

// Send gift to recipient: email and mark as Delivered
router.post("/gifts/send", verifyAdmin, async (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: "transactionId is required" });

    const docRef = await db.collection("transactions").doc(transactionId).get();
    if (!docRef.exists) return res.status(404).json({ error: "Transaction not found" });
    const t = { id: docRef.id, ...docRef.data() };

    if (!t.isGift || !t.giftRecipient) return res.status(400).json({ error: "Not a gift transaction" });
    if (!t.giftRecipient.email && !t.giftRecipient.phone)
      return res.status(400).json({ error: "Recipient contact info missing" });

    const products = (t.products || []).map((p) => ({ title: p.title || p.name }));

    // Send email if available
    if (t.giftRecipient.email) {
      const emailTpl = new GiftRecipientTemplate({
        purchaserName: t.name || "Your friend",
        recipientName: t.giftRecipient.name || "Friend",
        note: t.giftRecipient.note || "",
        products,
        actionUrl: `${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/profile/gifts`,
      });
      try {
        await sendEmail(t.giftRecipient.email, emailTpl);
      } catch (e) {
        // continue but report error
        console.error("Failed to send gift email:", e);
      }
    }

    // Grant ownership to recipient if user exists by email
    let granted = false;
    let recipientUid = null;
    if (t.giftRecipient && t.giftRecipient.email) {
      try {
        const userRecord = await admin.auth().getUserByEmail(t.giftRecipient.email);
        recipientUid = userRecord.uid;
        const ownedItems = (t.products || []).map((p) => ({
          productId: p.productId || p.id,
          title: p.title || p.name,
          acquiredAt: Timestamp.now(),
          acquiredVia: "gift",
          transactionId: t.id,
        }));
        const userRef = db.collection("users").doc(recipientUid);
        // Merge owned products into array field
        for (const item of ownedItems) {
          await userRef.set(
            { ownedProducts: admin.firestore.FieldValue.arrayUnion(item) },
            { merge: true }
          );
        }
        granted = true;
      } catch (e) {
        // User not found or error; skip granting, email already attempted above
        console.warn("Recipient user not found for email:", t.giftRecipient.email);
      }
    }

    // Update status to Delivered (or GiftSent) with admin audit
    const nextStatus = {
      state: "Delivered",
      message: granted ? "Gift sent and granted to recipient account" : "Gift sent to recipient",
      updatedAt: Timestamp.now(),
      actor: "admin",
      adminUid: req.uid || null,
      recipientUid: recipientUid,
    };
    await db
      .collection("transactions")
      .doc(transactionId)
      .update({
        status: admin.firestore.FieldValue.arrayUnion(nextStatus),
      });

    return res.json({ success: true, granted, recipientUid });
  } catch (err) {
    console.error("Error sending gift:", err);
    res.status(500).json({ error: "Failed to send gift" });
  }
});


router.post("/transaction/update-transaction", verifyAdmin, async (req, res) => {
  const { transactionId, status, proof } = req.body;

  if (!transactionId) {
    return res.status(400).json({ error: "Transaction ID is required." });
  }

  try {
    const transactionRef = await db.collection("transactions").doc(transactionId).get();
    if (!transactionRef.exists) {
      console.error("Transaction not found.");
      return res.status(404).json({ error: "Transaction not found." });
    }
    const transData = {
      id: transactionRef.id,
      ...transactionRef.data(),
    };

    let updatedProduct;
    if (proof && proof.id) {
      transData.products.forEach((product) => {
        if (product.productId === proof.id) {
          updatedProduct = proof.data;
        }
      });
    }

    if (status) {
      status.updatedAt = Timestamp.now();
      await db
        .collection("transactions")
        .doc(transactionId)
        .update({
          status: admin.firestore.FieldValue.arrayUnion(status),
        });

      // !-------------------------------------------------------!
      const userRecord = await admin.auth().getUser(transData.uid);
      const userEmail = userRecord.email;
      // ?=-----------------------------------------------------?

      switch (status.state) {
        case "ToPay":
          const formattedToPayOrder = formatTransactionData(transData);
          const toPayEmail = new ToPayTemplate(formattedToPayOrder);
          await sendEmail(userEmail, toPayEmail);
          break;

        case "Delivered":
          const formattedDeliveredOrder = formatTransactionData(transData);
          const DeliveredEmail = new DeliveredTemplate(formattedDeliveredOrder);
          await sendEmail(userEmail, DeliveredEmail);
          try {
            // Idempotent awarding controlled by flags stored on transaction
            const txRef = db.collection("transactions").doc(transactionId);
            const freshTxSnap = await txRef.get();
            const freshTx = freshTxSnap.exists ? freshTxSnap.data() : transData;

            const totalPriceNum = Number(freshTx.totalPrice) || 0;
            const pointsToAdd = Math.floor(totalPriceNum * 0.01);

            // Award buyer points if not already awarded
            if (!freshTx.cashbackAwarded && pointsToAdd > 0 && freshTx.uid) {
              await db
                .collection("users")
                .doc(freshTx.uid)
                .set(
                  { cashbackPoints: admin.firestore.FieldValue.increment(pointsToAdd) },
                  { merge: true }
                );
              await txRef.set({ cashbackAwarded: true }, { merge: true });
            }

            // Award referrer points if referralEmail provided and not yet awarded
            const referralEmail = (freshTx.referralEmail || "").toLowerCase();
            if (referralEmail && !freshTx.referralCashbackAwarded) {
              try {
                const refUser = await admin.auth().getUserByEmail(referralEmail);
                if (refUser && refUser.uid) {
                  // Prevent self-referral double award
                  const isSelf = refUser.uid === freshTx.uid;
                  if (!isSelf && pointsToAdd > 0) {
                    await db
                      .collection("users")
                      .doc(refUser.uid)
                      .set(
                        { cashbackPoints: admin.firestore.FieldValue.increment(pointsToAdd) },
                        { merge: true }
                      );
                  }
                  await txRef.set({ referralCashbackAwarded: true, referrerUid: refUser.uid }, { merge: true });
                }
              } catch (refErr) {
                // Referrer may not exist; log and continue
                console.warn("Referral email not linked to a user:", referralEmail, refErr?.message || refErr);
                await txRef.set({ referralCashbackAwarded: true }, { merge: true });
              }
            }

            // 1) External fulfillment via EGIFTLY for items that require it (idempotent per item)
            try {
              let productsMutated = false;
              const products = Array.isArray(freshTx.products) ? [...freshTx.products] : [];
              for (let i = 0; i < products.length; i++) {
                const p = products[i] || {};
                const f = p.fulfillment || {};
                const vendor = (f.vendor || "").toLowerCase();
                const alreadyProvisioned = f.status === "provisioned" && f.providerOrderId;
                if (vendor === "egiftly" && !alreadyProvisioned) {
                  try {
                    const qty = Number(p.quantity || 1) || 1;
                    const ref = `${transactionId}-${p.productId || p.id || i}`;
                    const resp = await egiftly.createOrder({
                      brandId: f.brandId,
                      denominationId: f.denominationId,
                      uniqueDenominationId: f.uniqueDenominationId,
                      quantity: qty,
                      reference: ref,
                      recipient: { email: userEmail },
                    });
                    const orderId = resp?.data?.transactionId || resp?.transactionId || resp?.data?.order_id || resp?.order_id || resp?.id || null;
                    const codes = resp?.data?.code || resp?.code || resp?.data?.codes || resp?.codes || resp?.data?.vouchers || [];
                    // Encrypt codes and attach to product.proof
                    const nowTs = Timestamp.now();
                    const encryptedProof = Array.isArray(codes) && codes.length
                      ? codes.map((c) => {
                          const row = typeof c === "string" ? { code: c } : { ...c };
                          const encryptedRow = {};
                          for (const k in row) {
                            encryptedRow[k] = encryptData(String(row[k]));
                          }
                          encryptedRow.createdAt = nowTs;
                          return encryptedRow;
                        })
                      : [];
                    p.proof = encryptedProof; // safe to overwrite; previous is only for this item
                    p.fulfillment = {
                      ...f,
                      status: "provisioned",
                      provider: "egiftly",
                      providerOrderId: orderId,
                      updatedAt: nowTs,
                      attempts: (f.attempts || 0) + 1,
                      lastError: null,
                    };
                    products[i] = p;
                    productsMutated = true;
                  } catch (egErr) {
                    // Mark failure but continue processing other items
                    const nowTs = Timestamp.now();
                    p.fulfillment = {
                      ...f,
                      status: "failed",
                      provider: "egiftly",
                      updatedAt: nowTs,
                      attempts: (f.attempts || 0) + 1,
                      lastError: egErr?.message || String(egErr),
                    };
                    products[i] = p;
                    productsMutated = true;
                    console.error("EGIFTLY fulfillment failed for product", p.productId || p.id, egErr);
                  }
                }
              }
              if (productsMutated) {
                await txRef.set({ products }, { merge: true });
              }
            } catch (fulfillErr) {
              console.error("Failed during external fulfillment phase:", fulfillErr);
              // non-fatal: do not fail the request
            }

            // 2) If all products are now delivered/provisioned or local, proceed with granting local ownership once
            // Grant ownership of purchased items to the buyer (one-time)
            try {
              if (!freshTx.ownershipGranted && freshTx.uid && Array.isArray(freshTx.products)) {
                const ownedItems = freshTx.products.map((p) => ({
                  productId: p.productId || p.id,
                  title: p.title || p.name,
                  acquiredAt: Timestamp.now(),
                  acquiredVia: "purchase",
                  transactionId: transactionId,
                }));
                const userRef = db.collection("users").doc(freshTx.uid);
                for (const item of ownedItems) {
                  await userRef.set(
                    { ownedProducts: admin.firestore.FieldValue.arrayUnion(item) },
                    { merge: true }
                  );
                }
                await txRef.set({ ownershipGranted: true }, { merge: true });
              }
            } catch (ownErr) {
              console.error("Failed to grant ownership to buyer:", ownErr);
              // non-fatal: do not fail the request
            }
          } catch (e) {
            console.error("Failed to award cashback points:", e);
            // Do not fail the request if points update fails
          }
          // Enqueue review/feedback follow-up email (best-effort), default delay ~36h
          try {
            await enqueueReviewRequest({
              to: userEmail,
              orderId: formattedDeliveredOrder.orderId,
              items: formattedDeliveredOrder.items,
              name: transData.name || (userRecord && userRecord.displayName) || "Friend",
              delayHours: Number(process.env.REVIEW_EMAIL_DELAY_HOURS) || 36,
            });
          } catch (e) {
            console.warn("Failed to enqueue review request email:", e?.message || e);
          }
          break;

        case "Preparing":
          const formattedPreparingOrder = formatTransactionData(transData);
          const PreparingEmail = new ConfirmedTemplate(formattedPreparingOrder);
          await sendEmail(userEmail, PreparingEmail);
          // Auto-fulfill EGIFTLY items at Preparing state
          try {
            let productsMutated = false;
            const txRefPrep = db.collection("transactions").doc(transactionId);
            const freshTxSnapPrep = await txRefPrep.get();
            const freshTxPrep = freshTxSnapPrep.exists ? freshTxSnapPrep.data() : transData;
            const productsPrep = Array.isArray(freshTxPrep.products) ? [...freshTxPrep.products] : [];
            for (let i = 0; i < productsPrep.length; i++) {
              const p = productsPrep[i] || {};
              const f = p.fulfillment || {};
              const vendor = (f.vendor || "").toLowerCase();
              const alreadyProvisioned = f.status === "provisioned" && f.providerOrderId;
              if (vendor === "egiftly" && !alreadyProvisioned) {
                try {
                  const qty = Number(p.quantity || 1) || 1;
                  const ref = `${transactionId}-${p.productId || p.id || i}`;
                  const resp = await egiftly.createOrder({
                    brandId: f.brandId,
                    denominationId: f.denominationId,
                    uniqueDenominationId: f.uniqueDenominationId,
                    quantity: qty,
                    reference: ref,
                    recipient: { email: userEmail },
                  });
                  const orderId = resp?.data?.transactionId || resp?.transactionId || resp?.data?.order_id || resp?.order_id || resp?.id || null;
                  const codes = resp?.data?.code || resp?.code || resp?.data?.codes || resp?.codes || resp?.data?.vouchers || [];
                  // Encrypt codes and attach to product.proof
                  const nowTs = Timestamp.now();
                  const encryptedProof = Array.isArray(codes) && codes.length
                    ? codes.map((c) => {
                        const row = typeof c === "string" ? { code: c } : { ...c };
                        const encryptedRow = {};
                        for (const k in row) {
                          encryptedRow[k] = encryptData(String(row[k]));
                        }
                        encryptedRow.createdAt = nowTs;
                        return encryptedRow;
                      })
                    : [];
                  p.proof = encryptedProof;
                  p.fulfillment = {
                    ...f,
                    status: "provisioned",
                    provider: "egiftly",
                    providerOrderId: orderId,
                    updatedAt: nowTs,
                    attempts: (f.attempts || 0) + 1,
                    lastError: null,
                  };
                  productsPrep[i] = p;
                  productsMutated = true;
                } catch (egErr) {
                  const nowTs = Timestamp.now();
                  p.fulfillment = {
                    ...f,
                    status: "failed",
                    provider: "egiftly",
                    updatedAt: nowTs,
                    attempts: (f.attempts || 0) + 1,
                    lastError: egErr?.message || String(egErr),
                  };
                  productsPrep[i] = p;
                  productsMutated = true;
                  console.error("EGIFTLY fulfillment failed at Preparing for product", p.productId || p.id, egErr);
                }
              }
            }
            if (productsMutated) {
              await txRefPrep.set({ products: productsPrep }, { merge: true });
            }
          } catch (fulfillErr) {
            console.error("Failed during EGIFTLY fulfillment at Preparing:", fulfillErr);
            // non-fatal
          }
          break;

        case "Rejected":
          const formattedRejectedOrder = formatTransactionData(transData);
          const rejectedEmail = new rejectedTemplate(formattedRejectedOrder, status.message, status.state);
          await sendEmail(userEmail, rejectedEmail);
          break;

        default:
          break;
      }

      return res.status(200).json({ success: true, message: "Transaction updated successfully." });
    }
    updatedProduct.forEach((product) => {
      product.createdAt = Timestamp.now();
    });

    if (proof) {
      const encryptedProofData = proof.data.map((p) => {
        const encryptedData = {};
        for (let k in p) {
          if (k !== "createdAt") {
            encryptedData[k] = encryptData(p[k]);
          } else {
            encryptedData[k] = p[k];
          }
        }
        encryptedData.updatedAt = Timestamp.now();
        return encryptedData;
      });
      const transactionDoc = await db.collection("transactions").doc(transactionId).get();
      const transactionData = transactionDoc.data();
      const updatedProduct = transactionData.products.map((product) => {
        if (product.productId === proof.id) {
          product.proof = encryptedProofData;
          return product;
        }
        return product;
      });

      await db.collection("transactions").doc(transactionId).update(
        {
          products: updatedProduct,
        },
        { merge: true }
      );

      return res.status(200).json({ success: true, message: "Transaction updated successfully." });
    }
  } catch (error) {
    console.error("Error updating transaction:", error);
    res.status(500).json({ error: "Failed to update transaction." });
  }
});

router.get("/view/transaction/:transacationId", verifyAdmin, async (req, res) => {
  const transactionId = req.params.transacationId;
  try {
    const transaction = await db.collection("transactions").doc(transactionId).get();

    if (!transaction.exists) {
      return res.status(404).json({ error: "Transaction not found." });
    }
    const data = transaction.data();

    res.render("transactions/view-transacation", { transaction: data, transactionId }); // Ensure the response wraps the data in a 'transaction' key
  } catch (error) {
    console.error("Error getting transaction:", error);
    res.status(500).json({ error: "Failed to get transaction." });
  }
});

router.post("/view/user", verifyAdmin, async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "User ID is required." });
  }
  try {
    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) {
      return res.status(404).json({ error: "User not found." });
    }
    const userData = userSnapshot.data();
    res.status(200).json({ user: userData });
  } catch (error) {
    console.error("Error getting user:", error);
    res.status(500).json({ error: "Failed to get user." });
  }
});

router.get("/deliver-order/:orderId", verifyAdmin, async (req, res) => {
  const orderId = req.params.orderId;
  try {
    const orderRef = db.collection("transactions").doc(orderId);
    const orderSnapshot = await orderRef.get();
    if (!orderSnapshot.exists) {
      return res.status(404).json({ error: "Order not found." });
    }
    const orderData = {
      id: orderSnapshot.id,
      ...orderSnapshot.data(),
    };
    const order = {
      orderId: orderData.id,
      orderDate: orderData.createdAt,
      status: orderData.status,
      totalPrice: orderData.totalPrice,
      currency: orderData.currency,
      products: orderData.products.map((p) => ({
        id: p.productId,
        title: p.title,
        price: p.price,
        quantity: p.quantity,
        details: p.description,
        img: p.img,
        proof: p.proof?.map((p) => {
          const decryptedData = {};
          for (let k in p) {
            if (k !== "createdAt" && k !== "updatedAt") {
              decryptedData[k] = decryptData(p[k], false);
            } else {
              decryptedData[k] = p[k];
            }
          }
          return decryptedData;
        }),
      })),
      paymentMethod: orderData.paymentMethod,
    };

    // Render the admin order page with data
    res.render("transactions/deliver-transaation", { order });
  } catch (error) {
    console.error("Error delivering order:", error);
    res.status(500).json({ error: "Failed to deliver order." });
  }
});

module.exports = router;
