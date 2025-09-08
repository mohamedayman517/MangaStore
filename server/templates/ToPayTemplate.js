const { UnifiedBaseTemplate } = require("./UnifiedBaseTemplate");

class ToPayTemplate {
  constructor(orderData) {
    this.subject = "Payment confirmed";
    this.orderData = orderData || {};
  }

  getTemplate() {
    const baseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:3000";
    const brand = {
      name: "Mango Store Gaming",
      primary_color: "#fdf4cb",
      secondary_color: "#fef9e2",
      accent_color: "#fea500",
      logo_url: `${process.env.PUBLIC_LOGO_URL || baseUrl + "/icons/mango_512x512.png"}`,
    };
    const links = {
      browser_view_url: `${baseUrl}/email/view`,
      shop_url: `${baseUrl}/`,
      unsubscribe_url: `${baseUrl}/unsubscribe`,
      support_email: process.env.SUPPORT_EMAIL || process.env.SMTP_REPLY_TO || "support@mangostore.games",
      store_address_line1: process.env.STORE_ADDRESS_LINE1 || "",
    };
    const utm = { source: "email", medium: "transactional", campaign: "payment_confirmation" };

    const total = Array.isArray(this.orderData.items)
      ? this.orderData.items.reduce((acc, o) => acc + (o.totalPrice || 0), 0)
      : 0;
    const currency = this.orderData.currency === "EG" ? "L.E" : "$";
    const orderItemsHtml = Array.isArray(this.orderData.items)
      ? this.orderData.items.map((o) => `<div style="padding:6px 0;border-bottom:1px solid #f1e6c8;">${o.orderItem || "Item"}</div>`).join("")
      : "";

    const cardContent = `
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.2;color:#333;font-weight:700;">Payment confirmed</h1>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333;">Thank you! Your payment for order <strong>#${this.orderData.orderId || ""}</strong> was received.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff;border-radius:10px;padding:14px 16px;">
        <tr>
          <td>
            ${orderItemsHtml}
            <div style="display:flex;justify-content:space-between;margin-top:10px;font-weight:700;color:#333;">
              <span>Total</span>
              <span>${total} ${currency}</span>
            </div>
            <div style="margin-top:6px;color:#666;font-size:13px;">Payment method: ${this.orderData.paymentMethod || "-"}</div>
            <div style="margin-top:4px;color:#666;font-size:13px;">Placed on: ${this.orderData.placedDate || "-"}</div>
          </td>
        </tr>
      </table>
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:14px auto 0;">
        <tr>
          <td style="border-radius:8px;overflow:hidden;">
            <a href="${baseUrl}/view-order/${this.orderData.orderId || ""}/" style="display:inline-block;text-decoration:none;padding:12px 20px;background:#fea500;color:#ffffff;font-weight:700;border-radius:8px;font-size:16px;min-height:44px;line-height:20px;">View order</a>
          </td>
        </tr>
      </table>
    `;

    const unified = new UnifiedBaseTemplate({
      subject: this.subject,
      previewText: `Payment received for order #${this.orderData.orderId || ""}`,
      brand,
      links,
      utm,
    });

    return unified.render(cardContent, {
      includeBenefits: false,
      plaintextFallback: `Payment received for order #${this.orderData.orderId || ""}. Total ${total} ${currency}.`,
    });
  }
}

module.exports = ToPayTemplate;
