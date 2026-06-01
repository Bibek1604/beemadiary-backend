const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const validate = require("../middlewares/validate.middleware");
const authValidator = require("../validators/auth.validator");

/**
 * Authentication Routes
 * Mounted on /api
 *
 * Public (no token required):
 *   POST /api/admin/login
 *   POST /api/auth/login      (alias)
 *   POST /api/agent/login
 *   POST /api/users/login     (alias)
 *   POST /api/auth/refresh
 *
 * Protected (requires Authorization: Bearer <accessToken>):
 *   POST /api/auth/logout
 */

// Admin login
router.post(
  "/admin/login",
  validate(authValidator.login),
  authController.adminLogin
);

// Generic auth login alias (used by some frontend builds)
router.post(
  "/auth/login",
  validate(authValidator.login),
  authController.adminLogin
);

// Agent login
router.post(
  "/agent/login",
  validate(authValidator.login),
  authController.agentLogin
);

// Legacy agent login alias
router.post(
  "/users/login",
  validate(authValidator.login),
  authController.agentLogin
);

// Refresh access token using refresh token
// Body: { refreshToken: "<token>" }
// Header alternative: x-refresh-token: <token>
router.post(
  "/auth/refresh",
  authController.refreshToken
);

// Logout (token extracted from Authorization header inside controller)
router.post(
  "/auth/logout",
  authController.logout
);

module.exports = router;
