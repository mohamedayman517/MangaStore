const express = require("express");
const router = express.Router();
const { db } = require("../utils/firebase");
const multer = require("multer");
const upload = multer({ dest: "uploads/", limits: { fileSize: 3 * 1024 * 1024 } });
const verifyAdmin = require("../middlewares/verifyAdmin");

// Force-randomize endpoint: updates randomSeed so the homepage picks a new product immediately
router.post("/banner-randomize", verifyAdmin, async (req, res) => {
  try {
    const seed = Date.now();
    await db.collection("settings").doc("banner").set({ randomSeed: seed }, { merge: true });
    res.status(200).json({ message: "Randomized successfully", randomSeed: seed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to randomize" });
  }
});
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

router.get("/banner", verifyAdmin, (req, res) => {
  res.render("banner/banner");
});

router.get("/banner-data", verifyAdmin, async (req, res) => {
  try {
    const doc = await db.collection("settings").doc("banner").get();
    if (doc.exists) {
      res.json(doc.data());
    } else {
      res.status(404).json({ error: "Banner not found" });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch banner data" });
  }
});

// Save banner data
router.post("/save-banner", upload.single("image"), verifyAdmin, async (req, res) => {
  try {
    let image = "";
    const {
      isEnabled,
      actionLink,
      actionText,
      body,
      subtitle,
      mainTitle,
      imageUrl,
      mode = "manual", // 'manual' | 'auto'
      manualProductId = null,
      randomSeed = null,
      autoPublish = false,
      scheduleStart = null,
      scheduleEnd = null,
    } = JSON.parse(req.body.bannerData);
    if (!actionLink || !actionText || !body || !subtitle || !mainTitle)
      return res.status(404).json({ message: "Banner data not found" });
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "banners",
      });
      image = result.secure_url;
    } else if (imageUrl) {
      image = imageUrl;
    }
    await db.collection("settings").doc("banner").set({
      isEnabled: !!isEnabled,
      actionLink,
      actionText,
      body,
      subtitle,
      mainTitle,
      image,
      mode: mode === "auto" ? "auto" : "manual",
      manualProductId: manualProductId || null,
      randomSeed: randomSeed || null,
      autoPublish: !!autoPublish,
      scheduleStart: scheduleStart || null,
      scheduleEnd: scheduleEnd || null,
    });

    res.status(200).json({ message: "Banner saved successfully!", status: 200 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to save banner data" });
  }
});

module.exports = router;
