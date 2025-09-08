const { UnifiedBaseTemplate } = require("./UnifiedBaseTemplate");

class WelcomeTemplate {
  constructor({ name, coupon } = {}) {
    this.subject = "Welcome to Mango Store!";
    this.name = name || "Friend";
    this.coupon = coupon || null;
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
      browser_view_url: `${baseUrl}/email/view` ,
      shop_url: `${baseUrl}/` ,
      discord_url: process.env.PUBLIC_DISCORD_URL || "",
      new_releases_url: `${baseUrl}/new` ,
      facebook_url: process.env.PUBLIC_FACEBOOK_URL || "",
      instagram_url: process.env.PUBLIC_INSTAGRAM_URL || "",
      twitter_url: process.env.PUBLIC_TWITTER_URL || "",
      unsubscribe_url: `${baseUrl}/unsubscribe`,
      support_email: process.env.SUPPORT_EMAIL || process.env.SMTP_REPLY_TO || "support@mangostore.games",
      store_address_line1: process.env.STORE_ADDRESS_LINE1 || "",
    };
    const utm = { source: "email", medium: "transactional", campaign: "welcome" };

    const couponBlock = this.coupon && this.coupon.code
      ? `
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:18px auto 20px;background:#fff;border-radius:10px;padding:14px 16px;min-width:260px;">
        <tr>
          <td style="text-align:center;">
            <div style="font-size:14px;color:#555;margin-bottom:6px;">Here’s a welcome gift for your first order</div>
            <div style="display:inline-block;padding:10px 14px;border-radius:6px;background:#fea500;color:#ffffff;font-weight:700;font-size:18px;letter-spacing:1px;">${this.coupon.code}</div>
            <div style="font-size:13px;color:#666;margin-top:8px;">Use code for <strong>${this.coupon.discount_text || "10% off"}</strong>${this.coupon.expiry ? ` — expires ${this.coupon.expiry}` : ""}</div>
          </td>
        </tr>
      </table>`
      : "";

    const cardContent = `
      <h1 style="margin:0 0 12px;font-size:26px;line-height:1.1;color:#333;font-weight:700;">Welcome, ${this.name}!</h1>
      <p style="margin:0 0 18px;font-size:16px;line-height:1.5;color:#333;">
        Thanks for joining <strong>Mango Store Gaming</strong> — your new home for great game deals, instant keys and a community that loves gaming as much as you do.
      </p>
      ${couponBlock}
      <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:10px auto;">
        <tr>
          <td style="border-radius:8px;overflow:hidden;">
            <a href="${links.shop_url}" style="display:inline-block;text-decoration:none;padding:12px 20px;background:#fea500;color:#ffffff;font-weight:700;border-radius:8px;font-size:16px;min-height:44px;line-height:20px;">
              Start Shopping
            </a>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;font-size:14px;color:#444;">
        ${links.discord_url ? `<a href="${links.discord_url}" style="color:#fea500;text-decoration:none;margin-right:12px;">Join our Discord</a>` : ""}
        ${links.discord_url ? "·" : ""}
        <a href="${links.new_releases_url}" style="color:#fea500;text-decoration:none;margin-left:12px;">Browse New Releases</a>
      </p>
    `;

    const unified = new UnifiedBaseTemplate({
      subject: this.subject,
      previewText: "Welcome to Mango Store — here’s your start!",
      brand,
      links,
      utm,
    });

    return unified.render(cardContent, {
      includeBenefits: true,
      plaintextFallback: `Welcome ${this.name}! Visit ${links.shop_url}`,
    });
  }
}

module.exports = WelcomeTemplate;
