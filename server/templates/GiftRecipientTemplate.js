const BaseTemplate = require("./BaseTemplate");

class GiftRecipientTemplate extends BaseTemplate {
  constructor({ purchaserName, recipientName, note, products, actionUrl }) {
    super("You've received a gift!");
    this.purchaserName = purchaserName || "A friend";
    this.recipientName = recipientName || "Friend";
    this.note = note || "";
    this.products = products || [];
    this.actionUrl = actionUrl || "http://localhost:3000/login";
  }

  getTemplate() {
    const header = `
      <div class="header" style="background: linear-gradient(135deg, #8a2be2, #ff6f61)">
        <img class="icon" src="https://img.icons8.com/?size=100&id=79784&format=png&color=FFFFFF" alt="gift" />
        <h1>You've received a gift! 🎁</h1>
        <p class="subtext">${this.purchaserName} sent you a gift on Manga Store.</p>
        <a class="btn" style="background: #ff6f61" href="${this.actionUrl}">View your gift</a>
      </div>
    `;

    const itemsHtml = this.products
      .map(
        (p) => `
        <div class="detail-row">
          <div class="detail-label">Item</div>
          <div class="detail-value">${p.title || p.name}</div>
        </div>
      `
      )
      .join("");

    const noteHtml = this.note
      ? `
        <div class="detail-row">
          <div class="detail-label">Message</div>
          <div class="detail-value">${this.note}</div>
        </div>`
      : "";

    const details = `
      ${noteHtml}
      ${itemsHtml}
    `;

    return this.getBaseHTML(header, details);
  }
}

module.exports = GiftRecipientTemplate;
