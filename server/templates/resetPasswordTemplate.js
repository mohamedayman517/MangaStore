const BaseTemplate = require("./BaseTemplate");

class PasswordResetTemplate extends BaseTemplate {
  constructor(userName, resetLink) {
    super("Reset Your Password 🔒");
    this.userName = userName;
    this.resetLink = resetLink;
  }

  getTemplate() {
    // Custom styles for password reset state
    const customStyles = `
      .state-Reset .header {
        background-color: #ef4444;
      }
      
      .state-Reset .btn {
        background-color: rgba(239, 68, 68, 0.1);
      }
      
      .state-Reset .btn:hover {
        background-color: rgba(239, 68, 68, 0.2);
      }
    `;

    // Header content specific to password reset
    const headerContent = `
      <style>${customStyles}</style>
      <div class="header state-Reset">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
          <path d="M12 17v.01"></path>
          <path d="M10 11a2 2 0 1 1 4 0c0 1-.5 2-1 3s-1 2-1 3"></path>
          <circle cx="12" cy="12" r="10"></circle>
        </svg>

        <h1>Reset your password</h1>

        <p class="subtext">
          Hello ${
            this.userName || "User"
          }, we received a request to reset your password. Click the button below to set a new password.
        </p>

        <a href="${this.resetLink}" class="btn">Reset Password</a>
      </div>
    `;

    // Additional information
    const additionalInfo = `
      <div class="detail-row">
        <div class="detail-label">Request Time</div>
        <div class="detail-value">${new Date().toLocaleString("en")}</div>
      </div>

      <div class="detail-row">
        <div class="detail-label">Didn't request this?</div>
        <div class="detail-value">
          If you didn't request a password reset, please ignore this email. Your password will remain unchanged.
        </div>
      </div>
    `;

    return this.getBaseHTML(headerContent, additionalInfo);
  }
}

module.exports = PasswordResetTemplate;
