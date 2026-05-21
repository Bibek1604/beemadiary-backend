const rateLimit = require("express-rate-limit");
const ApiResponse = require("../utils/apiResponse");

/**
 * Standard API Rate Limiter
 * Restricts client IPs to 100 requests per 15 minutes
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json(
      ApiResponse.error("Too many requests from this IP. Please try again later.", ["Rate limit exceeded"])
    );
  },
});

/**
 * Auth Endpoints Rate Limiter
 * More strict limits for login/register to mitigate brute-force attempts
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window for auth actions
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    return res.status(429).json(
      ApiResponse.error("Too many authentication attempts. Please try again in 15 minutes.", ["Brute-force protection triggered"])
    );
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
