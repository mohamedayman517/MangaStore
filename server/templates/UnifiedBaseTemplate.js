// UnifiedBaseTemplate.js
// Table-based, inline-styled email wrapper matching Mango Store Gaming brand

const appendUtm = (url, utm = {}) => {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (utm.source) u.searchParams.set('utm_source', utm.source);
    if (utm.medium) u.searchParams.set('utm_medium', utm.medium);
    if (utm.campaign) u.searchParams.set('utm_campaign', utm.campaign);
    return u.toString();
  } catch (e) {
    // If url is relative or invalid, return as-is
    return url;
  }
};

class UnifiedBaseTemplate {
  constructor({
    subject,
    previewText = '',
    brand = {
      name: 'Mango Store Gaming',
      primary_color: '#fdf4cb',
      secondary_color: '#fef9e2',
      accent_color: '#fea500',
      logo_url: ''
    },
    links = {},
    utm = { source: 'email', medium: 'transactional', campaign: '' }
  }) {
    this.subject = subject || brand?.name || 'Mango Store Gaming';
    this.previewText = previewText || '';
    this.brand = brand;
    this.links = links;
    this.utm = utm;
  }

  // cardContent should be the inner content of the secondary card area
  render(cardContent, { includeBenefits = false, plaintextFallback = '' } = {}) {
    const primary = this.brand.primary_color || '#fdf4cb';
    const secondary = this.brand.secondary_color || '#fef9e2';
    const accent = this.brand.accent_color || '#fea500';

    const browserView = appendUtm(this.links.browser_view_url, this.utm);
    const facebook = appendUtm(this.links.facebook_url, this.utm);
    const instagram = appendUtm(this.links.instagram_url, this.utm);
    const twitter = appendUtm(this.links.twitter_url, this.utm);
    const discord = appendUtm(this.links.discord_url, this.utm);
    const unsubscribe = this.links.unsubscribe_url || '';

    const preview = this.previewText
      ? `<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${this.previewText}</span>`
      : '';

    const benefits = includeBenefits
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:20px;">
          <tr>
            <td style="padding:8px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="width:1px;"></td>
                  <td style="vertical-align:top;text-align:center;font-size:14px;color:#333;padding:8px;">✅ Fast delivery</td>
                  <td style="vertical-align:top;text-align:center;font-size:14px;color:#333;padding:8px;">🔑 Authentic keys</td>
                  <td style="vertical-align:top;text-align:center;font-size:14px;color:#333;padding:8px;">💬 24/7 support</td>
                  <td style="width:1px;"></td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `
      : '';

    const logo = this.brand.logo_url
      ? `<img src="${this.brand.logo_url}" alt="${this.brand.name} logo" width="140" style="display:block;margin:0 auto 16px;max-width:140px;">`
      : '';

    const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.subject}</title>
  </head>
  <body style="margin:0;padding:0;background:${primary};">
    ${preview}
    <center style="width:100%;background-color:${primary};">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:600px;margin:0 auto;">
        <tr>
          <td style="padding:20px 10px 0;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;">
            <div style="font-size:12px;color:#666;margin-bottom:8px;">
              ${browserView ? `<a href="${browserView}" style="color:${accent};text-decoration:none;">View in browser</a>` : ''}
            </div>
            <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="background-color:${secondary};border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.06);overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 18px;text-align:center;">
                  ${logo}
                  ${cardContent}
                  ${benefits}
                </td>
              </tr>
              <tr>
                <td style="padding:0 28px;">
                  <hr style="border:none;height:1px;background:#f1e6c8;margin:0;">
                </td>
              </tr>
              <tr>
                <td style="padding:18px 28px 28px;text-align:center;font-size:13px;color:#666;">
                  <div style="margin-bottom:12px;">
                    ${facebook ? `<a href="${facebook}" style="text-decoration:none;margin:0 6px;font-weight:600;color:${accent};">Facebook</a>` : ''}
                    ${instagram ? `<a href="${instagram}" style="text-decoration:none;margin:0 6px;font-weight:600;color:${accent};">Instagram</a>` : ''}
                    ${twitter ? `<a href="${twitter}" style="text-decoration:none;margin:0 6px;font-weight:600;color:${accent};">X</a>` : ''}
                  </div>
                  <div style="font-size:12px;color:#888;line-height:1.4;">
                    ${this.brand.name} • ${this.links.store_address_line1 || ''}<br>
                    Support: ${this.links.support_email ? `<a href="mailto:${this.links.support_email}" style="color:${accent};text-decoration:none;">${this.links.support_email}</a>` : ''}
                    ${discord ? ` • <a href="${discord}" style="color:${accent};text-decoration:none;">Discord</a>` : ''}
                  </div>
                  <div style="margin-top:12px;font-size:12px;color:#999;">
                    ${unsubscribe ? `<a href="${unsubscribe}" style="color:#999;text-decoration:underline;">Unsubscribe</a>` : ''}
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 10px 36px;text-align:center;font-family:system-ui,-apple-system,Segoe UI,Roboto,'Helvetica Neue',Arial;font-size:12px;color:#999;">
            <!-- Plaintext fallback: ${plaintextFallback || ''} -->
          </td>
        </tr>
      </table>
    </center>
  </body>
</html>`;

    return html;
  }
}

module.exports = { UnifiedBaseTemplate, appendUtm };
