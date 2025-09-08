const BaseTemplate = require("./BaseTemplate");

const RepliedTicketTemplate = (ticketId, reply, userName) => {
  const content = `
    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h2 style="color: #28a745; margin-bottom: 15px;">تم الرد على تذكرتك</h2>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        مرحباً ${userName}،
      </p>
      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        تم الرد على تذكرة الدعم الخاصة بك رقم <strong>#${ticketId}</strong>
      </p>
      
      <div style="background-color: #fff; padding: 15px; border-radius: 5px; border-left: 4px solid #28a745; margin: 20px 0;">
        <h3 style="color: #333; margin-bottom: 10px;">الرد:</h3>
        <p style="color: #555; font-size: 14px; line-height: 1.6;">
          ${reply}
        </p>
      </div>
      
      <p style="color: #333; font-size: 16px; line-height: 1.6;">
        يمكنك تسجيل الدخول إلى حسابك لعرض التذكرة كاملة أو إضافة رد جديد.
      </p>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.WEBSITE_URL}/support" 
           style="background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
          عرض التذكرة
        </a>
      </div>
    </div>
  `;

  return BaseTemplate("تم الرد على تذكرتك", content);
};

module.exports = RepliedTicketTemplate;

