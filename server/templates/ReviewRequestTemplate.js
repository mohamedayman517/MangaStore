const BaseTemplate = require("./BaseTemplate");

class ReviewRequestTemplate extends BaseTemplate {
  constructor({ orderId, items, name }) {
    super(`How was your order #${orderId}? Share your feedback`);
    this.orderId = orderId;
    this.items = Array.isArray(items) ? items : [];
    this.name = name || "Friend";
  }

  getTemplate() {
    const base = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const cards = (this.items || [])
      .slice(0, 3)
      .map((it) => {
        const title = it.orderItem || it.title || "Item";
        return `
          <div style="background:#0f172a;border:1px solid #222;border-radius:12px;padding:14px;margin:8px 0;display:flex;align-items:center;gap:12px;">
            <div style="flex:1;color:#e5e7eb;font-weight:600;">${title}</div>
            <a href="${base}/profile/orders/${this.orderId}" style="background:#2563eb;color:#fff;padding:8px 12px;border-radius:8px;text-decoration:none;">Rate</a>
          </div>
        `;
      })
      .join("");

    const header = `
      <div class="header" style="background:linear-gradient(135deg,#1f2937,#111827)">
        <div class="logo-badge">
          <img class="icon" src="cid:mango-logo" alt="Manga Store"/>
        </div>
        <h1>Thanks for your purchase, ${this.name}!</h1>
        <p class="subtext">We'd love to hear your feedback about your recent order <strong>#${this.orderId}</strong>.</p>
        <a class="btn" style="background:#2563eb;border-color:#2563eb" href="${process.env.PUBLIC_BASE_URL || "http://localhost:3000"}/profile/orders/${this.orderId}">Rate your experience</a>
      </div>
    `;

    const details = `
      ${cards}
      ${this.items.length > 3 ? `<p style=\"color:#9ca3af\">And ${this.items.length - 3} more items...</p>` : ""}
      <p style="color:#9ca3af;margin-top:10px">Your feedback helps us improve our service.</p>
    `;

    return this.getBaseHTML(header, details);
  }
}

module.exports = ReviewRequestTemplate;
