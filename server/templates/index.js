// templates/index.js
const ToPayTemplate = require("./ToPayTemplate");
const DeliveredTemplate = require("./DeliveredTemplate");
const ConfirmedTemplate = require("./ConfirmedTemplate");
const EmailVerifyTemplate = require("./EmailVerifyTemplate");
const rejectedTemplate = require("./rejectedTemplate");
const GiftRecipientTemplate = require("./GiftRecipientTemplate");
const WelcomeTemplate = require("./WelcomeTemplate");
const ReviewRequestTemplate = require("./ReviewRequestTemplate");

module.exports = {
  ToPayTemplate,
  DeliveredTemplate,
  ConfirmedTemplate,
  EmailVerifyTemplate,
  rejectedTemplate,
  GiftRecipientTemplate,
  WelcomeTemplate,
  ReviewRequestTemplate,
};
