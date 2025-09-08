const express = require("express");
const router = express.Router();
const validateSession = require("../middlewares/validateSession");
const { decryptData } = require("../utils/cryptoHelper");
const checkActivateAccount = require("../middlewares/checkActivateAccount");

const { frontDB } = require("../utils/firebase");
const { getDoc, doc } = require("firebase/firestore");

const { admin } = require("../utils/firebase");
const fs = require("fs");
const path = require("path");
const { Timestamp } = require("firebase-admin/firestore");
const { strictRateLimit } = require("../middlewares/rateLimit");

router.get("/orders", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const uid = req.uid;
    if (!uid) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    const userDoc = await getDoc(doc(frontDB, "users", uid));
    if (!userDoc.exists()) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const userData = userDoc.data();
    let transactionData = [];

    if (userData.transactions && userData.transactions.length > 0) {
      transactionData = await Promise.all(
        userData.transactions.map(async (transactionId) => {
          const transactionDoc = await getDoc(doc(frontDB, "transactions", transactionId));
          if (transactionDoc.exists()) {
            return { id: transactionId, ...transactionDoc.data() };
          }
          return null;
        })
      );
      // Remove any null transactions in case some don't exist
      transactionData = transactionData.filter((t) => t);
    }

    let productsLength = 0;
    let totalOrders = 0;

    // Calculate total amount and total number of products
    const totalAmount = transactionData.reduce((sum, transaction) => {
      const latestStatus = transaction.status[transaction.status.length - 1].state;
      if (
        latestStatus !== "Canceled" &&
        latestStatus !== "unconfirmed" &&
        latestStatus !== "ToPay" &&
        latestStatus !== "Rejected"
      ) {
        productsLength += transaction.products.length;
        totalOrders++;
        return sum + transaction.totalPrice;
      }
      return sum;
    }, 0);
    // const productsLength = transactionData.reduce((count, transaction) => count + transaction.products.length, 0);

    res.render("orders", {
      user: {
    name: userData.name ? decryptData(userData.name) : "",
    email: userData.email ? decryptData(userData.email) : "",
    phoneNumber: userData.phoneNumber ? decryptData(userData.phoneNumber) : "",
    photoURL: userData.photoURL ? decryptData(userData.photoURL) : "",
    regionCode: userData.countryCode ? decryptData(userData.countryCode) : "",
    createdAt: userData.createdAt,
  },

      orders: transactionData,
      totalAmount,
      totalOrders,
      productsLength,
    });
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

router.get("/view-order/:orderId", validateSession, checkActivateAccount, async (req, res) => {
  const uid = req.uid;
  const orderId = req.params.orderId;
  if (!uid) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  if (!orderId) {
    return res.status(400).json({ success: false, error: "Invalid order ID" });
  }
  const userDoc = await getDoc(doc(frontDB, "users", uid));
  if (!userDoc.exists()) {
    return res.status(404).json({ success: false, error: "User not found" });
  }
  const userData = userDoc.data();
  const userTransactions = userData.transactions || [];
  if (!userTransactions.includes(orderId)) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  const transactionDoc = await getDoc(doc(frontDB, "transactions", orderId));
  if (!transactionDoc.exists()) {
    return res.status(404).json({ success: false, error: "Transaction not found" });
  }
  const transactionData = {
    id: transactionDoc.id,
    ...transactionDoc.data(),
  };

  res.render("view-order", {
    success: true,
    order: {
      orderId: transactionData.id,
      orderDate: transactionData.createdAt,
      status: transactionData.status,
      totalPrice: transactionData.totalPrice,
      currency: transactionData.currency,
      deliveryItems: transactionData.products.map((p) => {
        return {
          id: p.productId,
          title: p.name,
          price: p.price,
          quantity: p.quantity,
          details: p.description,
          img: p.img,
          proof: p.proof,
        };
      }),
    },
  });
});

router.post(
  "/view-order-data/:orderId",
  validateSession,
  checkActivateAccount,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 50, keyGenerator: (req) => req.uid || req.ip }),
  async (req, res) => {
  try {
    const uid = req.uid;
    const orderId = req.params.orderId;
    const { itemId, index } = req.body;

    // Validate user authentication
    if (!uid) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }
    if (!orderId || itemId === undefined) {
      return res.status(400).json({ success: false, error: "Invalid parameters" });
    }

    // Fetch user document
    const userDoc = await getDoc(doc(frontDB, "users", uid));
    if (!userDoc.exists()) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Check if user has access to this order
    const userData = userDoc.data();
    if (!userData.transactions || !userData.transactions.includes(orderId)) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // Fetch transaction data
    const transactionDoc = await getDoc(doc(frontDB, "transactions", orderId));
    if (!transactionDoc.exists()) {
      return res.status(404).json({ success: false, error: "Transaction not found" });
    }

    const transactionData = transactionDoc.data();
    const products = transactionData.products || [];

    // Find product by itemId
    const product = products[index];

    // Extract proof data
    const proofData = product.proof.map((proofItem) => {
      const proof = {};
      for (let field in proofItem) {
        if (field === "createdAt" || field === "updatedAt") {
          if (proofItem[field]) {
            proof[field] = proofItem[field]; // Add timestamps without decrypting
          }
        } else {
          proof[field] = decryptData(proofItem[field]);
        }
      }
      return proof;
    });
    if (proofData.length === 0) {
      return res.status(404).json({ success: false, error: "Product haven't arrived yet" });
    }
    // Create a txt file content from proofData
    const proofContent = proofData.map((item) => `${item.key}: ${item.value}`).join("\n");

    // Create a download link for the txt file
    const downloadsDir = path.join(__dirname, "../public/downloads");
    // Create the directory if it doesn't exist
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }
    const filePath = path.join(downloadsDir, `proof_${orderId}_${index}.txt`);
    fs.writeFileSync(filePath, proofContent);

    // Set headers to force download
    res.setHeader("Content-Disposition", `attachment; filename=proof_${orderId}_${index}.txt`);
    res.setHeader("Content-Type", "text/plain");

    const downloadLink = `/downloads/proof_${orderId}_${index}.txt`;

    // console.log("transactionData.status", transactionData.status);

    if (transactionData.status !== "Viewed") {
      const status = {
        message: "You have viewed the proof",
        updatedAt: Timestamp.now(),
        state: "Viewed",
      };
      await admin
        .firestore()
        .collection("transactions")
        .doc(orderId)
        .update({ status: admin.firestore.FieldValue.arrayUnion(status) });
    }

    // console.log("proofData", proofData);

    res.json({
      success: true,
      data: { proof: proofData },
      downloadLink, // Provide a direct link if proof is a file URL
    });
  } catch (error) {
    console.error("Error fetching order data:", error);
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

module.exports = router;
