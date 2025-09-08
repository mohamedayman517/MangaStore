const crypto = require("crypto");
const dotenv = require("dotenv");

dotenv.config();

// Expect hex strings: SECRET_KEY (64 hex = 32 bytes), IV (32 hex = 16 bytes)
const SECRET_KEY = process.env.SECRET_KEY?.trim();
const IV = process.env.IV?.trim();

function assertHexLike(name, value, expectedLen) {
  if (!value) {
    throw new Error(
      `${name} is missing. Please set ${name} in .env as a ${expectedLen}-char hex string. Example: ${name}=${expectedLen === 64 ? crypto.randomBytes(32).toString("hex") : crypto.randomBytes(16).toString("hex")}`
    );
  }
  const re = /^[0-9a-fA-F]+$/;
  if (!re.test(value)) {
    throw new Error(`${name} must be hex-only (0-9a-f). Current value has invalid characters.`);
  }
  if (value.length !== expectedLen) {
    throw new Error(`${name} must be ${expectedLen} hex chars. Current length=${value.length}.`);
  }
}

assertHexLike("SECRET_KEY", SECRET_KEY, 64);
assertHexLike("IV", IV, 32);

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
