const BaseTemplate = require("./BaseTemplate");

class AdminSupportMessageTemplate extends BaseTemplate {
  constructor(supportMessageData) {
    super("New Support Message Alert 📩");
    this.supportMessageData = supportMessageData;
  }

  getTemplate() {
    // Custom styles for Admin Support Message Notification
    const customStyles = `
                        .state-AdminSupportMessage .header {
                                background-color: #2563eb;
                        }
                        
                        .state-AdminSupportMessage .btn {
                                background-color: rgba(37, 99, 235, 0.1);
                        }
                        
                        .state-AdminSupportMessage .btn:hover {
                                background-color: rgba(37, 99, 235, 0.2);
                        }
                `;

    // Header content specific to Admin Support Message Notification
    const headerContent = `
                        <style>${customStyles}</style>
                        <div class="header state-AdminSupportMessage">
                                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
                                        <path d="M21 15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        <polyline points="3 7 12 13 21 7"></polyline>
                                </svg>
                                
                                <h1>New Support Message Received</h1>
                                
                                <p class="subtext">
                                        A new support message has been submitted. Please review the details below.
                                </p>
                                
                                <a href="https://admin.store.mohammed-zuhair.online/admin/tickets/${this.supportMessageData.messageId}/" class="btn">View Message</a>
                        </div>
                `;

    // Support message details
    const messageDetails = `
                        <div class="detail-row">
                                <div class="detail-label">Message ID</div>
                                <div class="detail-value">${this.supportMessageData.messageId}</div>
                        </div>
                        
                        <div class="detail-row">
                                <div class="detail-label">Customer Name</div>
                                <div class="detail-value">${this.supportMessageData.customerName}</div>
                        </div>
                        
                        <div class="detail-row">
                                <div class="detail-label">Email</div>
                                <div class="detail-value">${this.supportMessageData.email}</div>
                        </div>
                        
                        <div class="detail-row">
                                <div class="detail-label">Message Date</div>
                                <div class="detail-value">${this.supportMessageData.messageDate}</div>
                        </div>
                        
                        <div class="detail-row">
                                <div class="detail-label">Message Content</div>
                                <div class="detail-value">${this.supportMessageData.messageContent}</div>
                        </div>
                `;

    return this.getBaseHTML(headerContent, messageDetails);
  }
}

module.exports = AdminSupportMessageTemplate;
