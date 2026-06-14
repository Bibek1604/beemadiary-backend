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
// Agent self-registration is DISABLED by policy: agent accounts are created
// by an administrator from the admin panel (with name + associated company).
// The agent then logs in with the credentials the admin issued.
const agentRegisterDisabled = (_req, res) =>
  res.status(403).json(
    require("../utils/apiResponse").error(
      "Agent self-registration is disabled",
      ["Agent accounts are created by your administrator. Please contact your admin to receive your login credentials."],
      403
    )
  );
router.post("/agent/register", agentRegisterDisabled);
router.post("/users/register", agentRegisterDisabled);

router.post(
  "/auth/refresh",
  authController.refreshToken
);

const { authenticateAny } = require("../middlewares/auth.middleware");

// Change password — works with BOTH agent and admin tokens
// Body: { current_password | old_password, new_password, confirm_password? }
router.post("/change-password", authenticateAny, authController.changePassword);
router.post("/auth/change-password", authenticateAny, authController.changePassword);

// Logout from all devices
router.post("/auth/logout-all", authenticateAny, authController.logoutAll);

// Admin bootstrap registration (only allowed while no admin account exists)
router.post(
  "/register",
  validate(authValidator.register),
  authController.adminRegister
);

// Password reset by email — not configured: returns a clear 501 message
router.post("/forgot-password", authController.forgotPassword);
router.post("/auth/forgot-password", authController.forgotPassword);

// Logout (token extracted from Authorization header inside controller)
router.post(
  "/auth/logout",
  authController.logout
);

module.exports = router;
