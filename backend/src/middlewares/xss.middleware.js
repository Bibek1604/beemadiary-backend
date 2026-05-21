/**
 * Helper to escape HTML characters in a string
 * @param {string} str - Raw string input
 * @returns {string} Sanitized string
 */
const sanitizeString = (str) => {
  if (typeof str !== "string") return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

/**
 * Recursively traverse and sanitize objects/arrays
 * @param {any} obj - Input data
 * @returns {any} Sanitized data
 */
const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === "object") {
    const sanitizedObj = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        sanitizedObj[key] = sanitizeObject(obj[key]);
      }
    }
    return sanitizedObj;
  }
  
  if (typeof obj === "string") {
    return sanitizeString(obj);
  }
  
  return obj;
};

/**
 * XSS request sanitization middleware
 */
const xssSanitizer = (req, res, next) => {
  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  req.params = sanitizeObject(req.params);
  next();
};

module.exports = xssSanitizer;
