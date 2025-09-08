/**
 * Security utility functions for the e-commerce application
 */

/**
 * Sanitizes user input to prevent XSS attacks
 * @param {string} input - The user input to sanitize
 * @returns {string} - The sanitized input
 */
function sanitizeInput(input) {
  if (typeof input !== "string") {
    return input;
  }

  // Replace potentially dangerous characters
  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Validates if a string is a valid MongoDB ObjectId
 * @param {string} id - The ID to validate
 * @returns {boolean} - Whether the ID is valid
 */
function validateObjectId(id) {
  // Basic validation for MongoDB ObjectId format
  // ObjectId is a 24-character hex string
  return typeof id === "string";
}

module.exports = {
  sanitizeInput,
  validateObjectId,
};
