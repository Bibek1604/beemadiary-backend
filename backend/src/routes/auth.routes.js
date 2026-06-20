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
/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful }
 *       400: { description: Invalid credentials }
 */
router.post(
  "/admin/login",
  validate(authValidator.login),
  authController.adminLogin
);

// Generic auth login alias (used by some frontend builds)
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Login (admin alias)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful }
 *       400: { description: Invalid credentials }
 */
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
/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login (agent legacy alias)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200: { description: Login successful }
 *       400: { description: Invalid credentials }
 */
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
/**
 * @swagger
 * /api/agent/register:
 *   post:
 *     summary: Agent self-registration (disabled by policy)
 *     tags: [Authentication]
 *     responses:
 *       403: { description: Agent self-registration is disabled }
 */
router.post("/agent/register", agentRegisterDisabled);
/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Agent self-registration alias (disabled by policy)
 *     tags: [Authentication]
 *     responses:
 *       403: { description: Agent self-registration is disabled }
 */
router.post("/users/register", agentRegisterDisabled);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token using a refresh token
 *     tags: [Authentication]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: Token refreshed }
 *       401: { description: Invalid refresh token }
 */
router.post(
  "/auth/refresh",
  authController.refreshToken
);

const { authenticateAny } = require("../middlewares/auth.middleware");

// Change password — works with BOTH agent and admin tokens
// Body: { current_password | old_password, new_password, confirm_password? }
/**
 * @swagger
 * /api/change-password:
 *   post:
 *     summary: Change password (admin or agent token)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [new_password]
 *             properties:
 *               current_password: { type: string }
 *               old_password: { type: string }
 *               new_password: { type: string }
 *               confirm_password: { type: string }
 *     responses:
 *       200: { description: Password changed }
 *       400: { description: Validation failed }
 *       401: { description: Unauthorized }
 */
router.post("/change-password", authenticateAny, authController.changePassword);
/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change password (alias)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [new_password]
 *             properties:
 *               current_password: { type: string }
 *               new_password: { type: string }
 *               confirm_password: { type: string }
 *     responses:
 *       200: { description: Password changed }
 *       401: { description: Unauthorized }
 */
router.post("/auth/change-password", authenticateAny, authController.changePassword);

// Logout from all devices
/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Logout from all devices
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Logged out from all devices }
 *       401: { description: Unauthorized }
 */
router.post("/auth/logout-all", authenticateAny, authController.logoutAll);

// Admin bootstrap registration (only allowed while no admin account exists)
/**
 * @swagger
 * /api/register:
 *   post:
 *     summary: Admin bootstrap registration (only when no admin exists)
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               username: { type: string }
 *     responses:
 *       201: { description: Admin registered }
 *       403: { description: Registration disabled (admin exists) }
 */
router.post(
  "/register",
  validate(authValidator.register),
  authController.adminRegister
);

// Password reset by email — not configured: returns a clear 501 message
/**
 * @swagger
 * /api/forgot-password:
 *   post:
 *     summary: Request password reset (not configured; returns 501)
 *     tags: [Authentication]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       501: { description: Password reset is not configured }
 */
router.post("/forgot-password", authController.forgotPassword);
/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset alias (not configured; returns 501)
 *     tags: [Authentication]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       501: { description: Password reset is not configured }
 */
router.post("/auth/forgot-password", authController.forgotPassword);

// Logout (token extracted from Authorization header inside controller)
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout (invalidate current session token)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Logged out }
 *       401: { description: Unauthorized }
 */
router.post(
  "/auth/logout",
  authController.logout
);

module.exports = router;
