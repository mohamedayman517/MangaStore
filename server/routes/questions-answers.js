const express = require("express");
const router = express.Router();
const { admin } = require("../utils/firebase");
const verifyAdmin = require("../middlewares/verifyAdmin");

router.get("/q&a", verifyAdmin, async (req, res) => {
  try {
    // Get the single document containing all Q&A pairs
    const docRef = admin.firestore().collection("Q&A").doc("data");
    const doc = await docRef.get();

    let qaItems = [];

    if (doc.exists) {
      const data = doc.data();
      qaItems = data.QA || [];
    } else {
      // Create the document if it doesn't exist
      await docRef.set({ QA: [] });
    }

    res.render("questions-answers", { questions: qaItems });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).render("error", { message: "Failed to fetch questions" });
  }
});

// Public API to fetch Q&A for the storefront (no admin required)
router.get("/api/qna", async (_req, res) => {
  try {
    const docRef = admin.firestore().collection("Q&A").doc("data");
    const doc = await docRef.get();
    let qaItems = [];
    if (doc.exists) {
      const data = doc.data();
      qaItems = data.QA || [];
    }
    return res.json({ items: qaItems });
  } catch (error) {
    console.error("Error fetching public Q&A:", error);
    return res.status(500).json({ error: "Failed to fetch Q&A" });
  }
});

// API Routes for CRUD operations
router.post("/questions", verifyAdmin, async (req, res) => {
  try {
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "Question and answer are required" });
    }

    const docRef = admin.firestore().collection("Q&A").doc("data");

    // Get the current array
    const doc = await docRef.get();
    let qaArray = [];

    if (doc.exists) {
      const data = doc.data();
      qaArray = data.QA || [];
    }

    // Create a new Q&A object
    const newQA = {
      Q: question,
      A: answer,
      id: Date.now().toString(), // Use timestamp as a unique ID
    };

    // Add to the array
    qaArray.push(newQA);

    // Update the document
    await docRef.set({ QA: qaArray });

    res.status(201).json(newQA);
  } catch (error) {
    console.error("Error adding question:", error);
    res.status(500).json({ error: "Failed to add question" });
  }
});

router.put("/questions/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ error: "Question and answer are required" });
    }

    const docRef = admin.firestore().collection("Q&A").doc("data");

    // Get the current array
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Questions data not found" });
    }

    const data = doc.data();
    const qaArray = data.QA || [];

    // Find the index of the item to update
    const index = qaArray.findIndex((item) => item.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Update the item
    qaArray[index] = {
      ...qaArray[index],
      Q: question,
      A: answer,
    };

    // Update the document
    await docRef.update({ QA: qaArray });

    res.status(200).json(qaArray[index]);
  } catch (error) {
    console.error("Error updating question:", error);
    res.status(500).json({ error: "Failed to update question" });
  }
});

router.delete("/questions/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const docRef = admin.firestore().collection("Q&A").doc("data");

    // Get the current array
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Questions data not found" });
    }

    const data = doc.data();
    const qaArray = data.QA || [];

    // Filter out the item to delete
    const newQaArray = qaArray.filter((item) => item.id !== id);

    if (qaArray.length === newQaArray.length) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Update the document
    await docRef.update({ QA: newQaArray });

    res.status(200).json({ id });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
});

module.exports = router;
