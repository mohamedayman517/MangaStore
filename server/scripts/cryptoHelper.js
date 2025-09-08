const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config();

const SECRET_KEY = process.env.SECRET_KEY || crypto.randomBytes(32).toString("hex"); // 32 bytes key
const IV = process.env.IV || crypto.randomBytes(16).toString("hex"); // 16 bytes IV

// Encrypt Function
function encryptData(data) {
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(SECRET_KEY, "hex"), Buffer.from(IV, "hex"));
  let encrypted = cipher.update(data, "utf-8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
}

// Decrypt Function
function decryptData(encryptedData) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(SECRET_KEY, "hex"), Buffer.from(IV, "hex"));
  let decrypted = decipher.update(encryptedData, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

module.exports = { encryptData, decryptData };
