const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const multer = require("multer");
const upload = multer({ dest: "uploads/", limits: { fileSize: 3 * 1024 * 1024 } });
const cloudinary = require("cloudinary").v2;
const { Timestamp } = admin.firestore;
const verifyAdmin = require("../middlewares/verifyAdmin");

const fs = require("fs");

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

router.get("/slider", verifyAdmin, async (req, res) => {
  try {
    const collDocs = (await db.collection("slider").get()).docs;
    const slides = [];
    collDocs.forEach((doc) => {
      slides.push({
        id: doc.id,
        link: doc.data().link,
        url: doc.data().url,
      });
    });
    res.render("slider/slider", { slides: slides });
  } catch (error) {
    console.error("Error fetching slides:", error);
    res.status(500).json({ error: "Failed to fetch slides" });
  }
});

router.post("/add/slide", upload.single("image"), verifyAdmin, async (req, res) => {
  try {
    const { link } = req.body;
    const image = req.file;
    if (!image) return res.status(400).send({ message: "No image found" });
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "slides",
    });
    await db
      .collection("slider")
      .doc()
      .set({
        link: link || "#",
        url: result.secure_url,
        timestamp: Timestamp.fromDate(new Date()),
      });
    fs.unlink(req.file.path, (err) => {
      if (err) console.error("Error deleting temporary file:", err);
    });
    res.json({ message: "slide added successfuly", status: "success" });
  } catch (error) {
    console.error("Error adding slide:", error);
    res.status(500).json({ error: "Failed to add slide" });
  }
});

router.delete("/delete/sliders/:slideId", verifyAdmin, async (req, res) => {
  const slideId = req.params.slideId;
  try {
    const docRef = db.collection("slider").doc(slideId);
    if (!(await docRef.get()).exists) {
      return res.status(404).json({ message: "Slide not found", status: "failed" });
    }
    await docRef.delete();
    res.json({ message: "Slide deleted successfully", status: "success" });
  } catch (error) {
    console.error("Error deleting Slide:", error);
    res.status(500).json({ error: "Failed to delete Slide" });
  }
});

module.exports = router;
