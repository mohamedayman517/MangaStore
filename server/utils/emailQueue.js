const { admin, db } = require("./firebase");
const { sendEmail } = require("./mailer");
const { ReviewRequestTemplate } = require("../templates");

const QUEUE_COLLECTION = "email_queue";

async function enqueue(payload, runAt) {
  const doc = {
    type: payload.type,
    to: payload.to,
    data: payload.data || {},
    runAt: runAt || admin.firestore.Timestamp.now(),
    createdAt: admin.firestore.Timestamp.now(),
    attempts: 0,
    status: "queued",
  };
  await db.collection(QUEUE_COLLECTION).add(doc);
}

async function enqueueReviewRequest({ to, orderId, items, name, delayHours = 36 }) {
  const runAt = admin.firestore.Timestamp.fromMillis(
    Date.now() + delayHours * 60 * 60 * 1000
  );
  await enqueue(
    {
      type: "review_request",
      to,
      data: { orderId, items, name },
    },
    runAt
  );
}

async function processDue(limit = 20) {
  const now = admin.firestore.Timestamp.now();
  const snap = await db
    .collection(QUEUE_COLLECTION)
    .where("status", "==", "queued")
    .where("runAt", "<=", now)
    .orderBy("runAt", "asc")
    .limit(limit)
    .get();

  const results = [];
  for (const doc of snap.docs) {
    const job = { id: doc.id, ...doc.data() };
    try {
      // Mark in-progress
      await doc.ref.update({ status: "sending", attempts: admin.firestore.FieldValue.increment(1) });

      if (job.type === "review_request") {
        const tpl = new ReviewRequestTemplate({
          orderId: job.data.orderId,
          items: job.data.items || [],
          name: job.data.name || "Friend",
        });
        await sendEmail(job.to, tpl);
      }

      await doc.ref.update({ status: "sent", sentAt: admin.firestore.Timestamp.now() });
      results.push({ id: job.id, ok: true });
    } catch (e) {
      const attempts = (job.attempts || 0) + 1;
      const maxAttempts = 5;
      const backoffMs = Math.min(6 * 60 * 60 * 1000, Math.pow(2, attempts) * 60 * 1000); // up to 6h
      await doc.ref.update({
        status: attempts >= maxAttempts ? "failed" : "queued",
        error: e?.message || String(e),
        runAt: admin.firestore.Timestamp.fromMillis(Date.now() + backoffMs),
        attempts,
      });
      results.push({ id: job.id, ok: false, error: e?.message || String(e) });
    }
  }
  return results;
}

module.exports = { enqueueReviewRequest, processDue };
