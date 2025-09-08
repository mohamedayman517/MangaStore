const express = require("express");
const router = express.Router();
const validateSession = require("../middlewares/validateSession");
const checkActivateAccount = require("../middlewares/checkActivateAccount");
const { strictRateLimit } = require("../middlewares/rateLimit");
const multer = require("multer");
const upload = multer({ dest: "uploads/", limits: { fileSize: 3 * 1024 * 1024 } });
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const AdminSupportMessageTemplate = require("../templates/adminSupportMailAlert");
const { sendEmail } = require("../utils/mailer");

const { frontDB } = require("../utils/firebase");
const {
  query,
  where,
  getDoc,
  getDocs,
  collection,
  doc,
  addDoc,
  updateDoc,
  Timestamp,
  arrayUnion,
} = require("firebase/firestore");

router.get("/support/tickets", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const uid = req.uid;
    const userDoc = await getDoc(doc(frontDB, "users", uid));
    if (!userDoc.exists()) return res.status(404).send("User not found");

    const userData = userDoc.data();
    const ticketsIDs = userData.tickets ? userData.tickets : [];

    if (ticketsIDs.length === 0) {
      return res.render("manage-tickets", { tickets: [] });
    }

    // Fetch all tickets from the tickets collection
    const ticketsQuery = query(collection(frontDB, "tickets"), where("__name__", "in", ticketsIDs));
    const ticketsQuerySnapshot = await getDocs(ticketsQuery);
    const tickets = ticketsQuerySnapshot.docs.map((ticketDoc) => ({
      ...ticketDoc.data(),
      id: ticketDoc.id,
    }));

    // res.json(tickets);
    res.render("manage-tickets", { tickets });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/support/ticket/open-ticket", validateSession, checkActivateAccount, async (req, res) => {
  const qAndA = (await getDoc(doc(frontDB, "Q&A", "data"))).data().QA;
  //   res.json(qAndA);
  res.render("new-ticket", { qAndA });
});

// Custom Request landing page
router.get("/support/custom-request", validateSession, checkActivateAccount, async (req, res) => {
  try {
    res.render("custom-request");
  } catch (e) {
    console.error("Error rendering custom request page", e);
    res.status(500).send("Internal Server Error");
  }
});

// Custom Request form (similar layout to new-ticket but different fields)
router.get("/support/custom-request/open", validateSession, checkActivateAccount, async (req, res) => {
  try {
    res.render("custom-request-form");
  } catch (e) {
    console.error("Error rendering custom request form", e);
    res.status(500).send("Internal Server Error");
  }
});

router.post(
  "/support/custom-request/open",
  upload.array("attachments", 5),
  validateSession,
  checkActivateAccount,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 50, keyGenerator: (req) => req.uid || req.ip }),
  async (req, res) => {
    try {
      const { name, phone, subject, offeredPrice, description } = req.body;
      const uid = req.uid;

      if (!name || !phone || !subject || !description) {
        return res.status(400).json({ success: false, message: "Please fill in all required fields." });
      }
      if (name.length < 2) {
        return res.status(400).json({ success: false, message: "Please enter a valid name." });
      }
      if (!/^[+\d][\d\s()-]{6,}$/.test(phone)) {
        return res.status(400).json({ success: false, message: "Please enter a valid phone number." });
      }
      const priceNumber = offeredPrice !== undefined && offeredPrice !== null && offeredPrice !== ""
        ? Number(offeredPrice)
        : null;
      if (priceNumber !== null && (Number.isNaN(priceNumber) || priceNumber < 0)) {
        return res.status(400).json({ success: false, message: "Offered price must be a positive number." });
      }

      // Fetch user to ensure exists
      const userDocRef = doc(frontDB, "users", uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) return res.status(404).json({ success: false, message: "User not found" });

      // Validate and upload files
      const files = req.files || [];
      const maxSize = 5 * 1024 * 1024;
      for (const file of files) {
        if (file.size > maxSize) {
          return res.status(400).json({ success: false, message: `File "${file.originalname}" exceeds the 5MB limit.` });
        }
      }
      const uploadResults = await Promise.all(
        files.map((file) =>
          cloudinary.uploader.upload(file.path, {
            public_id: `custom-requests/${file.filename}`,
            resource_type: "auto",
          })
        )
      );
      const attachments = uploadResults.map((result, index) => ({
        file: result.secure_url,
        fileName: files[index].originalname,
        fileSize: files[index].size,
      }));

      const newTicket = {
        subject,
        name,
        phone,
        offeredPrice: priceNumber,
        description,
        issueCategory: "CustomRequest",
        attachments,
        status: "opened",
        createdAt: Timestamp.now(),
        messages: [],
      };

      // Add to Firestore and link to user
      const ticketRef = await addDoc(collection(frontDB, "tickets"), newTicket);
      await updateDoc(userDocRef, { tickets: arrayUnion(ticketRef.id) });

      // Notify admin via email
      const adminMail = new AdminSupportMessageTemplate({
        messageId: ticketRef.id,
        customerName: name,
        email: userDoc.data().email || "",
        messageDate: new Date().toLocaleString(),
        messageContent: `Custom Request Submitted.\nPhone: ${phone}\nOffered Price: ${priceNumber ?? "N/A"}\nSubject: ${subject}\nDescription: ${description}`,
      });
      await sendEmail("mangaststore@gmail.com", adminMail);

      return res.status(201).json({ success: true, message: "Custom request submitted successfully", ticketId: ticketRef.id });
    } catch (error) {
      console.error("Error submitting custom request:", error);
      return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  }
);

router.post(
  "/support/ticket/open-ticket",
  upload.array("files", 5),
  validateSession,
  checkActivateAccount,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 100, keyGenerator: (req) => req.uid || req.ip }),
  async (req, res) => {
    try {
      const { email, name, description, issueCategory, subject } = req.body;

      if (!name || !email || !description || !issueCategory || !subject) {
        return res.status(400).json({ success: false, message: "Please fill in all required fields" });
      }

      if (name.length < 4) {
        return res.status(400).json({ success: false, message: "Please enter a valid name." });
      }

      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ success: false, message: "Please enter a valid email address." });
      }

      const files = req.files;
      const maxSize = 5 * 1024 * 1024;
      const uid = req.uid;

      // Fetch User Data
      const userDocRef = doc(frontDB, "users", uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) return res.status(404).json({ success: false, message: "User not found" });

      // Validate File Size
      for (const file of files) {
        if (file.size > maxSize) {
          return res
            .status(400)
            .json({ success: false, message: `File "${file.originalname}" exceeds the 5MB limit.` });
        }
      }

      // Upload Files to Cloudinary in Parallel
      const uploadPromises = files.map((file) =>
        cloudinary.uploader.upload(file.path, {
          public_id: `support-tickets/${file.filename}`,
          resource_type: "auto",
        })
      );
      const uploadResults = await Promise.all(uploadPromises);
      const urls = uploadResults.map((result, index) => ({
        file: result.secure_url,
        fileName: files[index].originalname,
        fileSize: files[index].size,
      }));

      // Create New Ticket
      const newTicket = {
        subject,
        email,
        name,
        description,
        issueCategory,
        attachments: urls, // Store uploaded file URLs with additional data
        status: "opened",
        createdAt: Timestamp.now(),
        messages: [], // Empty messages array for future replies
      };

      // Add Ticket to Firestore and Get ID
      const ticketRef = await addDoc(collection(frontDB, "tickets"), newTicket);

      // Link Ticket ID to User's Document
      await updateDoc(userDocRef, {
        tickets: arrayUnion(ticketRef.id),
      });

      const adminMail = new AdminSupportMessageTemplate({
        messageId: ticketRef.id,
        customerName: name,
        email,
        messageDate: new Date().toLocaleString(),
        messageContent: description,
      });
      await sendEmail("mangaststore@gmail.com", adminMail);

      return res.status(201).json({ success: true, message: "Ticket submitted successfully", ticketId: ticketRef.id });
    } catch (error) {
      console.error("Error opening ticket:", error);
      return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  }
);

router.get("/support/ticket/view/:ticketId", validateSession, checkActivateAccount, async (req, res) => {
  const uid = req.uid;
  const ticketId = req.params.ticketId;
  const userData = (await getDoc(doc(frontDB, "users", uid))).data();

  if (!userData.tickets.includes(ticketId)) {
    return res.render("view-ticket", { message: "Ticket not found" });
  }

  const ticketDoc = await getDoc(doc(frontDB, "tickets", ticketId));
  const ticketData = ticketDoc.exists() ? { ...ticketDoc.data(), id: ticketDoc.id } : null;

  if (!ticketData) {
    return res.render("view-ticket", { message: "Ticket not found." });
  }

  res.render("view-ticket", { ticket: ticketData, message: "" });
});

router.post(
  "/support/ticket/view/:ticketId",
  upload.array("files", 5),
  validateSession,
  checkActivateAccount,
  strictRateLimit({ windowMs: 15 * 60 * 1000, max: 100, keyGenerator: (req) => req.uid || req.ip }),
  async (req, res) => {
    try {
      const ticketId = req.params.ticketId;
      const { message } = req.body;
      const uid = req.uid;

      if (!message) {
        return res.status(400).json({ success: false, message: "Please enter a message." });
      }

      // Fetch user document
      const userDocRef = doc(frontDB, "users", uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists() || !userDoc.data().tickets || !userDoc.data().tickets.includes(ticketId)) {
        return res.status(404).json({ success: false, message: "Ticket not found or unauthorized." });
      }

      // Fetch ticket document
      const ticketRef = doc(frontDB, "tickets", ticketId);
      const ticketDoc = await getDoc(ticketRef);
      if (!ticketDoc.exists()) {
        return res.status(404).json({ success: false, message: "Ticket does not exist." });
      }

      const ticketData = ticketDoc.data();

      if (ticketData.status === "resolved") {
        return res
          .status(403)
          .json({ success: false, message: "This ticket has been resolved and cannot be updated." });
      }

      const files = req.files;
      const maxSize = 5 * 1024 * 1024;
      let attachments = [];

      try {
        // Upload files to Cloudinary
        const uploadPromises = files.map(async (file) => {
          if (file.size > maxSize) {
            throw new Error(`File "${file.originalname}" exceeds the 5MB limit.`);
          }
          const uploadResult = await cloudinary.uploader.upload(file.path, {
            public_id: `support-tickets/${file.filename}`,
            resource_type: "auto",
          });
          return {
            file: uploadResult.secure_url,
            fileName: file.originalname,
            fileSize: file.size,
          };
        });

        attachments = await Promise.all(uploadPromises);
      } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
      }

      // Generate messageId based on array length
      const messageId = (ticketData.messages ? ticketData.messages.length : 0) + 1;

      const newMessage = {
        messageId: String(messageId),
        message: message,
        senderType: "client",
        createdAt: Timestamp.now(),
        attachments,
      };

      // Update Firestore document
      await updateDoc(ticketRef, {
        messages: arrayUnion(newMessage),
        updatedAt: Timestamp.now(), // Track last activity
      });

      const adminMail = new AdminSupportMessageTemplate({
        messageId: ticketDoc.id,
        customerName: ticketData.name,
        email: ticketData.email,
        messageDate: new Date().toLocaleString(),
        messageContent: newMessage.message,
      });
      await sendEmail("mangaststore@gmail.com", adminMail);

      return res.status(201).json({ success: true, message: "Reply added successfully." });
    } catch (error) {
      console.error("Error replying to ticket:", error);
      return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
  }
);

// List tickets that have admin/support replies
router.get("/support/replies", validateSession, checkActivateAccount, async (req, res) => {
  try {
    const uid = req.uid;
    const userDoc = await getDoc(doc(frontDB, "users", uid));
    if (!userDoc.exists()) return res.status(404).send("User not found");

    const ticketsIDs = userDoc.data().tickets ? userDoc.data().tickets : [];
    if (ticketsIDs.length === 0) {
      return res.render("support-replies", { tickets: [] });
    }

    const ticketsQuery = query(collection(frontDB, "tickets"), where("__name__", "in", ticketsIDs));
    const ticketsQuerySnapshot = await getDocs(ticketsQuery);
    const tickets = ticketsQuerySnapshot.docs
      .map((ticketDoc) => ({ ...ticketDoc.data(), id: ticketDoc.id }))
      .filter((t) => Array.isArray(t.messages) && t.messages.some((m) => m.senderType !== "client"));

    return res.render("support-replies", { tickets });
  } catch (error) {
    console.error("Error fetching replies:", error);
    return res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
