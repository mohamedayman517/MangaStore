const openai = require("./openai");

async function classifyText(text) {
  if (!process.env.OPENAI_API_KEY) {
    return { label: "safe", isToxic: false, disabled: true };
  }
  const prompt = `Classify the following user text as one of: safe, profanity, harassment, hate, sexual, spam. Reply ONLY with the label. Text:\n\n"""${text}"""`;
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
  return { label, isToxic };
}

module.exports = { classifyText };
