const express = require("express");
const router = express.Router();
const verifyAdmin = require("../middlewares/verifyAdmin");
const openai = require("../utils/openai");
const { admin } = require("../utils/firebase");

// Helper to check OpenAI availability
function assertOpenAI(res) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ success: false, error: "OpenAI is not configured on the server." });
  }
  return true;
}

// Admin-only: Generate marketing description for products
// POST /admin/ai/generate-description
// body: { title: string, genre?: string, language?: 'ar'|'en' }
router.post("/admin/ai/generate-description", verifyAdmin, async (req, res) => {
  if (assertOpenAI(res) !== true) return;
  const { title, genre = "", language = "ar" } = req.body || {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ success: false, error: "title is required" });
  }

  const langPrompt = language === "en" ? "English" : "Arabic";
  const prompt = `Write a short, engaging ${langPrompt} marketing description (60-100 words) for a manga titled "${title}"${genre ? ` in the ${genre} genre` : ""}. Use compelling but honest language. Include 3-5 relevant tags at the end.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that crafts concise product descriptions for a manga e-commerce store." },
        { role: "user", content: prompt },
      ],
      temperature: 0.8,
    });
    const text = completion.choices?.[0]?.message?.content || "";
    return res.json({ success: true, data: { description: text } });
  } catch (err) {
    console.error("[AI] generate-description error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to generate description" });
  }
});

// Admin-only: Generate SEO meta (title, description, keywords)
// POST /admin/ai/generate-seo
// body: { title: string, description?: string, genre?: string, language?: 'ar'|'en' }
router.post("/admin/ai/generate-seo", verifyAdmin, async (req, res) => {
  if (assertOpenAI(res) !== true) return;
  const { title, description = "", genre = "", language = "ar" } = req.body || {};
  if (!title || typeof title !== "string") {
    return res.status(400).json({ success: false, error: "title is required" });
  }

  const langPrompt = language === "en" ? "English" : "Arabic";
  const prompt = `Given a product with title "${title}"${genre ? ` in the ${genre} category` : ""}${description ? ` and description: ${description}` : ""}, craft SEO metadata in ${langPrompt}.
Return strict JSON with keys: seoTitle (<= 60 chars), seoDescription (<= 160 chars), seoKeywords (array of 6-12 concise keywords).`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You generate high-quality SEO meta for an e-commerce manga store. Always return valid JSON only." },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
    });
    const text = completion.choices?.[0]?.message?.content?.trim() || "";
    let parsed;
    try { parsed = JSON.parse(text); } catch {
      // Fallback: simple heuristic if not JSON
      parsed = { seoTitle: title, seoDescription: description?.slice(0, 160) || title, seoKeywords: [title, genre, "manga", "buy", "online"].filter(Boolean) };
    }
    const out = {
      seoTitle: (parsed.seoTitle || title).toString().slice(0, 70),
      seoDescription: (parsed.seoDescription || description || title).toString().slice(0, 180),
      seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords.map(String) : String(parsed.seoKeywords || "").split(",").map(s => s.trim()).filter(Boolean),
    };
    return res.json({ success: true, data: out });
  } catch (err) {
    console.error("[AI] generate-seo error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to generate SEO" });
  }
});

// Public: simple moderation/toxicity check for user content (e.g., reviews, Q&A)
// POST /api/moderate
// body: { text: string }
router.post("/api/moderate", async (req, res) => {
  if (assertOpenAI(res) !== true) return;
  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    return res.status(400).json({ success: false, error: "text is required" });
  }

  const prompt = `Classify the following user text as one of: safe, profanity, harassment, hate, sexual, spam. Reply ONLY with the label. Text: \n\n"""${text}"""`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a strict content classifier for user-generated content." },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    });
    const label = (completion.choices?.[0]?.message?.content || "safe").toLowerCase().trim();
    const isToxic = ["profanity", "harassment", "hate", "sexual", "spam"].includes(label);
    return res.json({ success: true, data: { label, isToxic } });
  } catch (err) {
    console.error("[AI] moderate error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to classify content" });
  }
});

module.exports = router;

// Public: Chatbot endpoint grounded on existing Q&A
// POST /api/chat
// body: { message: string, history?: Array<{role: 'user'|'assistant', content: string}>, language?: 'ar'|'en' }
router.post("/api/chat", async (req, res) => {
  if (assertOpenAI(res) !== true) return;
  try {
    const { message, history = [], language = "ar" } = req.body || {};
    if (!message || typeof message !== "string") {
      return res.status(400).json({ success: false, error: "message is required" });
    }

    // Load public Q&A from Firestore to use as grounding context
    let qaPairs = [];
    try {
      const docRef = admin.firestore().collection("Q&A").doc("data");
      const doc = await docRef.get();
      if (doc.exists) {
        const data = doc.data();
        qaPairs = Array.isArray(data?.QA) ? data.QA : [];
      }
    } catch (e) {
      // Non-fatal: continue without grounding if fetch fails
      console.warn("[AI] Failed to load Q&A for grounding:", e?.message || e);
    }

    const langName = language === "en" ? "English" : "Arabic";
    const faqContext = qaPairs
      .slice(0, 50)
      .map((it, idx) => `Q${idx + 1}: ${it.Q}\nA${idx + 1}: ${it.A}`)
      .join("\n\n");

    const system = [
      `You are a helpful support assistant for an e-commerce manga store.`,
      `Answer briefly in ${langName}.`,
      `Use the following FAQ context to answer. If the answer is not in the context, answer from general common sense for store usage (orders, products) but do NOT invent store-specific policies. If unsure, say you are not sure and suggest contacting support or creating a ticket.`,
    ].join(" ");

    const contextMsg = faqContext
      ? { role: "user", content: `FAQ Context (read-only):\n\n${faqContext}` }
      : null;

    const messages = [
      { role: "system", content: system },
      ...(contextMsg ? [contextMsg] : []),
      ...history
        .filter((m) => m && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
        .slice(-8),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.3,
      max_tokens: 300,
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "";
    return res.json({ success: true, data: { answer } });
  } catch (err) {
    console.error("[AI] chat error:", err?.message || err);
    return res.status(500).json({ success: false, error: "Failed to answer chat" });
  }
});
