class BaseTemplate {
  constructor(subject) {
    this.subject = subject;
  }

  // Common styles shared across all templates
  getBaseStyles() {
    return `
      /* Base styles */
      body {
        font-family: 'Arial', sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f5f5f5;
        color: #333;
      }
      
      .email-container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #1a1a22;
      }
      
      .header {
        padding: 40px 20px;
        text-align: center;
        color: white;
      }
      
      .icon {
        width: 64px;
        height: 64px;
        border-radius: 12px;
        margin-bottom: 12px;
      }

      .logo-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 88px;
        height: 88px;
        border-radius: 9999px;
        margin-bottom: 16px;
        background: radial-gradient( circle at 30% 30%, rgba(245,158,11,0.25), rgba(245,158,11,0.05) 60%, transparent 100% ),
                    linear-gradient(135deg, rgba(245,158,11,0.35), rgba(255,255,255,0.06));
        box-shadow: 0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
      }
      
      h1 {
        font-size: 28px;
        margin: 0 0 15px 0;
        font-weight: 600;
      }
      
      .subtext {
        font-size: 16px;
        line-height: 1.5;
        margin: 0 0 25px 0;
        padding: 0 20px;
      }
      
      .btn {
        display: inline-block;
        padding: 12px 40px;
        border-radius: 50px;
        text-decoration: none;
        font-weight: 600;
        margin-top: 10px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        color: white;
        font-size: 18px;
      }
      
      .order-details {
        padding: 20px;
        color: #a0a0a0;
        background-color: #1a1a22;
      }
      
      .detail-row {
        display: flex;
        margin-bottom: 20px;
        border-bottom: 1px solid #333;
        padding-bottom: 20px;
      }
      
      .detail-row:last-child {
        border-bottom: none;
      }
      
      .detail-label {
        width: 120px;
        font-weight: 600;
        color: #888;
      }
      
      .detail-value {
        flex: 1;
        text-align: right;
      }
      
      .footer {
        padding: 20px;
        text-align: center;
        font-size: 12px;
        color: #666;
        background-color: #111118;
      }
      
      /* Responsive adjustments */
      @media only screen and (max-width: 480px) {
        .detail-row {
          flex-direction: column;
        }
        
        .detail-label, .detail-value {
          width: 100%;
          text-align: left;
        }
        
        .detail-value {
          margin-top: 5px;
        }
      }
    `;
  }

  // Base HTML structure
  getBaseHTML(headerContent, orderDetails) {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.subject}</title>
        <style>
          ${this.getBaseStyles()}
        </style>
      </head>
      <body>
        <div class="email-container">
          ${headerContent}
          
          <div class="order-details">
            ${orderDetails}
          </div>
          
          <div class="footer">
            <p>If you have any questions about your order, please contact our support team.</p>
            <p>&copy; ${new Date().getFullYear()} Manga Store. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

module.exports = BaseTemplate;
