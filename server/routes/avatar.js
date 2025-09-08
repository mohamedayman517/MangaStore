const express = require("express");
const router = express.Router();

// Simple avatar proxy to avoid browser OpaqueResponseBlocking/CORS issues
// Usage: /avatar?url=<encoded external image url>
router.get("/avatar", async (req, res) => {
  try {
    const rawUrl = req.query.url || "";
    if (!rawUrl || rawUrl.length > 2000) {
      return res.status(400).send("Invalid URL");
    }

    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      return res.status(400).send("Bad URL");
    }

    // Whitelist hosts to reduce abuse; extend as needed
    const allowedHosts = new Set([
      "lh3.googleusercontent.com",
      "lh4.googleusercontent.com",
      "lh5.googleusercontent.com",
      "lh6.googleusercontent.com",
      "pbs.twimg.com",
      "avatars.githubusercontent.com",
      "i.imgur.com",
      "res.cloudinary.com",
    ]);

    if (!allowedHosts.has(url.hostname)) {
      return res.status(400).send("Host not allowed");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const upstream = await fetch(url.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(502).send("Upstream error");
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400"); // 1 day

    const reader = upstream.body.getReader();
    res.on("close", () => {
      try { reader.cancel(); } catch {}
    });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).send("Timeout");
    }
    console.error("Avatar proxy error:", err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
