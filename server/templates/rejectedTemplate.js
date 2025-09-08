const BaseTemplate = require("./BaseTemplate");

class CanceledTemplate extends BaseTemplate {
  constructor(orderData, cancellationReason, status) {
    super(`Order ${status} ❌`);
    this.orderData = orderData;
    this.cancellationReason = cancellationReason || "Contact support for more information.";
    this.orderStatus = status;
  }

  getTemplate() {
    // Custom styles for Canceled state
    const customStyles = `
      .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #ddd;
      }
      .detail-label {
      font-weight: bold;
      color: #333;
      }
      .detail-value {
      color: #555;
      }
      .btn {
      display: inline-block;
      padding: 10px 20px;
      margin-top: 10px;
      color: #fff;
      background-color: #ef4444;
      text-decoration: none;
      border-radius: 5px;
      transition: background-color 0.3s ease;
      }
      .btn:hover {
      background-color: #dc2626;
      }
    `;

    // Header content specific to Canceled state
    const headerContent = `
      <style>${customStyles}</style>
      <div class="header state-Canceled">
        <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
        
        <h1>Your order have been ${this.orderStatus}.</h1>
        
        <p class="subtext">
          We're sorry, but your order have been ${this.orderStatus}. If you have any questions, please contact our customer support.
        </p>
        
        <a href="https://store.mohammed-zuhair.online/view-order/${this.orderData.orderId}/" class="btn">View status</a>
      </div>
    `;

    // Order details
    const orderDetails = `
    <div class="detail-row">
      <div class="detail-label">Order items</div>
      <div class="detail-value">
      ${this.orderData.items.map((order) => order.orderItem).join("<br><hr><br>")}
      </div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Order item no.</div>
      <div class="detail-value">${this.orderData.orderId}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Placed on</div>
      <div class="detail-value">${this.orderData.placedDate}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Total price</div>
      <div class="detail-value">${this.orderData.items.reduce((acc, order) => acc + order.totalPrice, 0)} ${
      this.orderData.currency === "EG" ? "L.E" : "$" || "L.E"
    }</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Payment</div>
      <div class="detail-value">${this.orderData.paymentMethod}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Reason</div>
      <div class="detail-value">${this.cancellationReason}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">Contact support</div>
      <div class="detail-value"><a href="https://store.mohammed-zuhair.online/support/ticket/open-ticket" class="btn" style="font-size: 12px;">Open ticket</a></div>
    </div>
    `;

    return this.getBaseHTML(headerContent, orderDetails);
  }
}

module.exports = CanceledTemplate;
