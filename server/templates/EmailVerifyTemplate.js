const BaseTemplate = require("./BaseTemplate");

class EmailVerifyTemplate extends BaseTemplate {
  constructor(userName, verifyLink) {
    super("Verify Your Email ✉️");
    this.userName = userName;
    this.verifyLink = verifyLink;
  }

  getTemplate() {
    // Custom styles for email verification
    const customStyles = `
      .state-Verification .header {
        background-color: #3b82f6;
      }
      
      .state-Verification .btn {
        background-color: rgba(59, 130, 246, 0.1);
      }
      
      .state-Verification .btn:hover {
        background-color: rgba(59, 130, 246, 0.2);
      }
    `;

    // Header content specific to verification state
    const headerContent = `
      <style>${customStyles}</style>
      <div class="header state-Verification">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
          <rect x="2" y="4" width="20" height="16" rx="2"></rect>
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
        </svg>
        
        <h1>Verify your email address</h1>
        
        <p class="subtext">
          Thank you for signing up! Please verify your email address to complete your registration.
        </p>
        
        <a href="${this.verifyLink}" class="btn">Verify Email</a>
      </div>
    `;

    // Verification details
    const verificationDetails = `
      <div class="detail-row">
        <div class="detail-label">User</div>
        <div class="detail-value">${this.userName}</div>
      </div>
      
      <div class="detail-row">
        <div class="detail-label">Action required</div>
        <div class="detail-value">Please click the verification button above</div>
      </div>
      
      <div class="detail-row">
        <div class="detail-label">Note</div>
        <div class="detail-value">This link will expire in 24 hours</div>
      </div>
    `;

    return this.getBaseHTML(headerContent, verificationDetails);
  }
}

module.exports = EmailVerifyTemplate;
