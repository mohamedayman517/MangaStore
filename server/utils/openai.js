const OpenAI = require("openai");
const dotenv = require("dotenv");
dotenv.config();

if (!process.env.OPENAI_API_KEY) {
  console.warn("[OpenAI] Missing OPENAI_API_KEY in environment. Features depending on OpenAI will be disabled.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = client;
