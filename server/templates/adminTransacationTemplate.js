const BaseTemplate = require("./BaseTemplate");

class AdminTransactionTemplate extends BaseTemplate {
  constructor(transactionData) {
    super("New Transaction Alert 🚨");
    this.transactionData = transactionData;
  }

  getTemplate() {
    // Custom styles for Admin Transaction Notification
    const customStyles = `
            .state-AdminTransaction .header {
                background-color: #f97316;
            }
            
            .state-AdminTransaction .btn {
                background-color: rgba(249, 115, 22, 0.1);
            }
            
            .state-AdminTransaction .btn:hover {
                background-color: rgba(249, 115, 22, 0.2);
            }
        `;

    // Header content specific to Admin Transaction Notification
    const headerContent = `
            <style>${customStyles}</style>
            <div class="header state-AdminTransaction">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
                    <path d="M12 1v22M1 12h22"></path>
                </svg>
                
                <h1>New Transaction Received</h1>
                
                <p class="subtext">
                    A new transaction has been made. Please review the details below.
                </p>
                
                <a href="https://admin.store.mohammed-zuhair.online/admin/view/transaction/${this.transactionData.transactionId}/" class="btn">View Transaction</a>
            </div>
        `;

    // Transaction details
    const transactionDetails = `
            <div class="detail-row">
                <div class="detail-label">Transaction ID</div>
                <div class="detail-value">${this.transactionData.transactionId}</div>
            </div>
            
            <div class="detail-row">
                <div class="detail-label">Customer Name</div>
                <div class="detail-value">${this.transactionData.customerName}</div>
            </div>
            
            <div class="detail-row">
                <div class="detail-label">Transaction Date</div>
                <div class="detail-value">${this.transactionData.transactionDate}</div>
            </div>
            
            <div class="detail-row">
                <div class="detail-label">Total Amount</div>
                <div class="detail-value">${this.transactionData.totalAmount} ${
      this.transactionData.currency === "EG" ? "L.E" : "$" || "L.E"
    }</div>
            </div>
            
            <div class="detail-row">
                <div class="detail-label">Payment Method</div>
                <div class="detail-value">${this.transactionData.paymentMethod}</div>
            </div>
        `;

    return this.getBaseHTML(headerContent, transactionDetails);
  }
}

module.exports = AdminTransactionTemplate;
