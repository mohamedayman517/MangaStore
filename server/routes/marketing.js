const express = require("express");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");
const { admin } = require("../utils/firebase");
const verifyAdmin = require("../middlewares/verifyAdmin");

const router = express.Router();
const unsubscribedFile = path.join(__dirname, "../data/unsubscribed.json");

// Ensure unsubscribed.json file exists
if (!fs.existsSync(path.dirname(unsubscribedFile))) {
  fs.mkdirSync(path.dirname(unsubscribedFile), { recursive: true });
}

if (!fs.existsSync(unsubscribedFile)) {
  fs.writeFileSync(unsubscribedFile, JSON.stringify([]));
}

// Load unsubscribed emails
const getUnsubscribedEmails = () => {
  try {
    return JSON.parse(fs.readFileSync(unsubscribedFile));
  } catch (error) {
    console.error("Error reading unsubscribed file:", error);
    return [];
  }
};

// Save unsubscribed emails
const saveUnsubscribedEmails = (emails) => {
  try {
    fs.writeFileSync(unsubscribedFile, JSON.stringify(emails, null, 2));
  } catch (error) {
    console.error("Error saving unsubscribed file:", error);
  }
};

// Dashboard route
router.get("/marketing-emails", verifyAdmin, async (req, res) => {
  try {
    // Get sent campaigns count
    const campaignsSnapshot = await admin.firestore().collection("emailCampaigns").where("status", "==", "sent").get();
    const totalSent = campaignsSnapshot.size;

    // Get unsubscribed users count
    const unsubscribedUsers = getUnsubscribedEmails();
    const usersResult = await admin.auth().listUsers();
    const totalUsers = usersResult.users.length;
    const unsubscribeRate = totalUsers > 0 ? (unsubscribedUsers.length / totalUsers) * 100 : 0;

    // Calculate open and click rates
    let totalOpens = 0;
    let totalClicks = 0;
    let totalRecipients = 0;

    campaignsSnapshot.forEach((doc) => {
      const data = doc.data();
      totalOpens += data.opens || 0;
      totalClicks += data.clicks || 0;
      totalRecipients += data.recipientCount || 0;
    });

    const openRate = totalRecipients > 0 ? (totalOpens / totalRecipients) * 100 : 0;
    const clickRate = totalRecipients > 0 ? (totalClicks / totalRecipients) * 100 : 0;

    // Get recent campaigns
    const recentCampaignsSnapshot = await admin
      .firestore()
      .collection("emailCampaigns")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    const recentCampaigns = [];
    recentCampaignsSnapshot.forEach((doc) => {
      const data = doc.data();
      recentCampaigns.push({
        id: doc.id,
        subject: data.subject,
        sentAt: data.sentAt ? data.sentAt.toDate() : data.createdAt.toDate(),
        recipientCount: data.recipientCount || 0,
        openRate: data.recipientCount ? (((data.opens || 0) / data.recipientCount) * 100).toFixed(0) : 0,
      });
    });

    // Send data to EJS template
    res.render("marketing-emails", {
      title: "Email Campaigns",
      totalSent,
      openRate: openRate.toFixed(2),
      clickRate: clickRate.toFixed(2),
      unsubscribeRate: unsubscribeRate.toFixed(2),
      recentCampaigns,
    });
  } catch (error) {
    console.error("Error fetching marketing stats:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Unsubscribe endpoint
router.post("/api/unsubscribe", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    // Find user by email
    const userRecord = await admin.auth().getUserByEmail(email);

    // Update user custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      ...userRecord.customClaims,
      subscribed: false,
    });

    // Add to unsubscribed list if not already there
    const unsubscribedEmails = getUnsubscribedEmails();
    if (!unsubscribedEmails.includes(email)) {
      unsubscribedEmails.push(email);
      saveUnsubscribedEmails(unsubscribedEmails);
    }

    // Log unsubscribe event
    await admin.firestore().collection("emailEvents").add({
      type: "unsubscribe",
      email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ success: true, message: "Unsubscribed successfully" });
  } catch (error) {
    console.error("Unsubscribe error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Send marketing emails
router.patch("/api/marketing/emails", verifyAdmin, async (req, res) => {
  try {
    const { subject, content, audienceSegment, sendOption, scheduleDate } = req.body;

    if (!subject || !content) {
      return res.status(400).json({ error: "Subject and content are required" });
    }

    // Create campaign in Firestore
    const campaignRef = admin.firestore().collection("emailCampaigns").doc();
    const campaignData = {
      subject,
      content,
      audienceSegment,
      status: sendOption === "scheduled" ? "scheduled" : "pending",
      scheduleDate: sendOption === "scheduled" ? new Date(scheduleDate) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await campaignRef.set(campaignData);

    // If sending immediately, process the campaign
    if (sendOption === "now") {
      // Get users based on audience segment
      const usersResult = await admin.auth().listUsers();
      const unsubscribedEmails = getUnsubscribedEmails();

      let eligibleUsers = usersResult.users.filter(
        (user) => user.email && user.customClaims?.subscribed !== false && !unsubscribedEmails.includes(user.email)
      );

      // Apply audience segmentation
      if (audienceSegment !== "all") {
        const now = new Date();

        if (audienceSegment === "new") {
          // New customers (last 30 days)
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          eligibleUsers = eligibleUsers.filter(
            (user) => user.metadata.creationTime && new Date(user.metadata.creationTime) >= thirtyDaysAgo
          );
        } else if (audienceSegment === "inactive") {
          // Inactive customers (90+ days)
          const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

          // This is a simplified approach - in a real app, you'd check last login or purchase
          eligibleUsers = eligibleUsers.filter(
            (user) => user.metadata.lastSignInTime && new Date(user.metadata.lastSignInTime) <= ninetyDaysAgo
          );
        } else if (audienceSegment === "frequent" || audienceSegment === "abandoned") {
          // These would require additional data from Firestore
          // For this example, we'll just use all eligible users
          console.warn(`Advanced segmentation '${audienceSegment}' would require additional Firestore queries`);
        }
      }

      const recipients = eligibleUsers.map((user) => user.email);

      if (recipients.length === 0) {
        await campaignRef.update({
          status: "failed",
          error: "No eligible recipients found",
        });
        return res.status(400).json({ error: "No eligible recipients found" });
      }

      // Set up Nodemailer
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      var email;

      // Add tracking pixel and unsubscribe link
      const trackingPixel = `<img src="https://admin.store.mohammed-zuhair.online/api/track-open?cid=${campaignRef.id}" width="1" height="1" />`;
      const unsubscribeLink = `https://store.mohammed-zuhair.online/unsubscribe?email=${email}`;

      const enhancedContent = `${content}
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
          <p>If you no longer wish to receive these emails, you can <a href="${unsubscribeLink}">unsubscribe here</a>.</p>
        </div>
        ${trackingPixel}`;

      // Send emails in batches to avoid rate limits
      const batchSize = 50;
      const batches = [];

      for (let i = 0; i < recipients.length; i += batchSize) {
        batches.push(recipients.slice(i, i + batchSize));
      }

      let sentCount = 0;

      for (const batch of batches) {
        const mailPromises = batch.map((email) => {
          // Personalize content for each recipient
          const personalizedContent = enhancedContent.replace("${email}", email);

          const mailOptions = {
            from: `"${process.env.EMAIL_FROM_NAME || "Marketing Team"}" <${process.env.SMTP_USER}>`,
            to: email,
            subject,
            html: personalizedContent,
          };

          return transporter.sendMail(mailOptions);
        });

        try {
          await Promise.all(mailPromises);
          sentCount += batch.length;
        } catch (error) {
          console.error("Error sending batch:", error);
        }
      }

      // Update campaign with results
      await campaignRef.update({
        status: "sent",
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        recipientCount: sentCount,
        opens: 0,
        clicks: 0,
      });

      res.json({
        success: true,
        message: `Campaign sent successfully to ${sentCount} recipients`,
        campaignId: campaignRef.id,
      });
    } else {
      // For scheduled campaigns
      res.json({
        success: true,
        message: "Campaign scheduled successfully",
        campaignId: campaignRef.id,
      });
    }
  } catch (error) {
    console.error("Error sending campaign:", error);
    res.status(500).json({ error: error.message });
  }
});

// Save draft endpoint
router.post("/api/marketing/emails/drafts", verifyAdmin, async (req, res) => {
  try {
    const { subject, content, audienceSegment } = req.body;

    const draftRef = admin.firestore().collection("emailDrafts").doc();
    await draftRef.set({
      subject: subject || "",
      content: content || "",
      audienceSegment: audienceSegment || "all",
      status: "draft",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      message: "Draft saved successfully",
      draftId: draftRef.id,
    });
  } catch (error) {
    console.error("Error saving draft:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get drafts endpoint
router.get("/api/marketing/emails/drafts", verifyAdmin, async (req, res) => {
  try {
    const draftsSnapshot = await admin
      .firestore()
      .collection("emailDrafts")
      .where("status", "==", "draft")
      .orderBy("createdAt", "desc")
      .get();

    const drafts = [];
    draftsSnapshot.forEach((doc) => {
      drafts.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt.toDate(),
      });
    });

    res.json({ drafts });
  } catch (error) {
    console.error("Error fetching drafts:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get draft by ID
router.get("/api/marketing/emails/drafts/:id", verifyAdmin, async (req, res) => {
  try {
    const draftDoc = await admin.firestore().collection("emailDrafts").doc(req.params.id).get();

    if (!draftDoc.exists) {
      return res.status(404).json({ error: "Draft not found" });
    }

    res.json({
      id: draftDoc.id,
      ...draftDoc.data(),
      createdAt: draftDoc.data().createdAt.toDate(),
    });
  } catch (error) {
    console.error("Error fetching draft:", error);
    res.status(500).json({ error: error.message });
  }
});

// Track email opens
router.get("/api/track-open", async (req, res) => {
  const { cid } = req.query;

  if (!cid) {
    // Return a 1x1 transparent pixel
    res.set("Content-Type", "image/gif");
    res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
    return;
  }

  try {
    // Update campaign opens count
    await admin
      .firestore()
      .collection("emailCampaigns")
      .doc(cid)
      .update({
        opens: admin.firestore.FieldValue.increment(1),
      });

    // Log open event
    await admin.firestore().collection("emailEvents").add({
      type: "open",
      campaignId: cid,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.ip,
    });
  } catch (error) {
    console.error("Error tracking open:", error);
  }

  // Return a 1x1 transparent pixel
  res.set("Content-Type", "image/gif");
  res.send(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
});

// Track email link clicks
router.get("/api/track-click", async (req, res) => {
  const { cid, url } = req.query;

  if (!cid || !url) {
    return res.status(400).send("Invalid parameters");
  }

  try {
    // Update campaign clicks count
    await admin
      .firestore()
      .collection("emailCampaigns")
      .doc(cid)
      .update({
        clicks: admin.firestore.FieldValue.increment(1),
      });

    // Log click event
    await admin
      .firestore()
      .collection("emailEvents")
      .add({
        type: "click",
        campaignId: cid,
        url: decodeURIComponent(url),
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        ip: req.ip,
      });
  } catch (error) {
    console.error("Error tracking click:", error);
  }

  // Redirect to the original URL
  res.redirect(decodeURIComponent(url));
});

// Sync unsubscribed users
router.post("/api/syncUnsubscribed", verifyAdmin, async (req, res) => {
  try {
    const usersResult = await admin.auth().listUsers();
    const unsubscribedEmails = [];

    for (const user of usersResult.users) {
      if (user.customClaims?.subscribed === false && user.email) {
        unsubscribedEmails.push(user.email);
      }
    }

    saveUnsubscribedEmails(unsubscribedEmails);

    res.json({
      success: true,
      message: "Unsubscribed list synced successfully",
      count: unsubscribedEmails.length,
    });
  } catch (error) {
    console.error("Error syncing unsubscribed users:", error);
    res.status(500).json({ error: error.message });
  }
});

// Unsubscribe page
router.get("/unsubscribe", async (req, res) => {
  const { email, token } = req.query;

  res.render("unsubscribe", {
    email: email || "",
    token: token || "",
    title: "Unsubscribe from Emails",
  });
});

module.exports = router;
