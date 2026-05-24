const rateLimit = require("express-rate-limit");
const ApiResponse = require("../utils/apiResponse");

/**
 * Standard API Rate Limiter
 * Disabled in development for continuous testing
 * In production: 100 requests per 15 minutes
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 100, // 10k for dev, 100 for prod
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development mode
    return process.env.NODE_ENV === 'development';
  },
  handler: (req, res) => {
    return res.status(429).json(
      ApiResponse.error("Too many requests from this IP. Please try again later.", ["Rate limit exceeded"])
    );
  },
});

/**
 * Auth Endpoints Rate Limiter
 * Disabled in development for testing
 * In production: stricter limits for login/register to mitigate brute-force attempts
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 20, // 10k for dev, 20 for prod
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting in development mode
    return process.env.NODE_ENV === 'development';
  },
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
