const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const multer = require("multer");
const upload = multer({ dest: "uploads/", limits: { fileSize: 3 * 1024 * 1024 } });
const cloudinary = require("cloudinary").v2;
const { Timestamp } = admin.firestore;
const verifyAdmin = require("../middlewares/verifyAdmin");
const RepliedTicketTemplate = require("../templates/RepliedTicketTemplate");
const { sendEmail } = require("../utils/mailer");

const fs = require("fs");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

router.get("/tickets", verifyAdmin, async (req, res) => {
  try {
    const filterType = (req.query.type || "").toLowerCase();
    const collDocs = (await db.collection("tickets").get()).docs;
    let tickets = [];
    collDocs.forEach((docSnap) => {
      const data = docSnap.data();
      tickets.push({ id: docSnap.id, ...data });
    });
    if (filterType === "custom") {
      tickets = tickets.filter((t) => (t.issueCategory || "") === "CustomRequest");
    }
    res.render("tickets/tickets", { tickets });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.get("/tickets/:ticketId", verifyAdmin, async (req, res) => {
  const ticketId = req.params.ticketId;
  try {
    const ticket = await db.collection("tickets").doc(ticketId).get();
    const ticketData = { id: ticket.id, ...ticket.data() };
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    // res.json(ticket);
    res.render("tickets/view-ticket", { ticket: ticketData });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/reply/ticket", upload.array("files", 5), verifyAdmin, async (req, res) => {
  const { message, ticketId, status, adminOfferPrice } = req.body;
  const files = req.files;
  try {
    const ticket = await db.collection("tickets").doc(ticketId).get();
    if (!ticket.exists) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }
    const ticketData = ticket.data();

    const replies = ticketData.messages || [];
    const reply = {
      message: message,
      attachments: [],
      createdAt: Timestamp.now(),
      senderType: "admin",
      messageId: replies.length + 1,
    };
    for (let i = 0; i < files.length; i++) {
      const result = await cloudinary.uploader.upload(files[i].path);
      reply.attachments.push({ file: result.secure_url, fileName: files[i].originalname, fileSize: files[i].size });
      fs.unlinkSync(files[i].path);
    }
    replies.push(reply);
    const updatePayload = { messages: replies, updatedAt: Timestamp.now(), status };
    // If adminOfferPrice is provided and valid, persist it
    if (adminOfferPrice !== undefined && adminOfferPrice !== null && String(adminOfferPrice).trim() !== "") {
      const priceNum = Number(adminOfferPrice);
      if (!Number.isNaN(priceNum) && priceNum >= 0) {
        updatePayload.adminOfferPrice = priceNum;
      }
    }
    await db.collection("tickets").doc(ticketId).update(updatePayload);

    // Send email only if we have a recipient email on the ticket (some CustomRequest tickets may miss it)
    if (ticketData && ticketData.email) {
      const emailTicketData = { ticketId: ticketId, status: status, createdAt: reply.createdAt };
      const emailTicketTemplate = new RepliedTicketTemplate(emailTicketData);
      await sendEmail(ticketData.email, emailTicketTemplate);
    } else {
      console.warn("Skipping email: ticket has no email field", { ticketId });
    }

    res.json({ message: "Reply sent successfully" });
  } catch (error) {
    console.error("Error replying to ticket:", error);
    res.status(500).json({ error: "Failed to reply to ticket" });
  }
});

module.exports = router;
