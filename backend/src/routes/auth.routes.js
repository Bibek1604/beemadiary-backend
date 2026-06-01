const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const validate = require("../middlewares/validate.middleware");
const authValidator = require("../validators/auth.validator");
const { csrfProtection } = require("../middleware/csrf");

/**
 * Admin Authentication Routes
 * Mounted on /api
 */

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin Login
 *     description: Authenticate an administrator and return a JWT access token.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminLoginRequest'
 *     responses:
 *       200:
 *         description: Authentication successful. Returns session token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       400:
 *         description: Validation failed or incorrect credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 *       429:
 *         description: Too many login attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 */
router.post(
  "/admin/login",
  // csrfProtection removed from login routes: CSRF attacks target authenticated
// sessions, not public login forms. Cookie-based CSRF also fails in
// cross-origin dev setups (SameSite=strict). Protected routes still use it.
  validate(authValidator.login),
  authController.adminLogin
);

router.post(
  "/auth/login",
  // csrfProtection removed from login routes: CSRF attacks target authenticated
// sessions, not public login forms. Cookie-based CSRF also fails in
// cross-origin dev setups (SameSite=strict). Protected routes still use it.
  validate(authValidator.login),
  authController.adminLogin
);

/**
 * @swagger
 * /api/agent/login:
 *   post:
 *     summary: Agent Login
 *     description: Authenticate an agent and return a JWT access token.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminLoginRequest'
 *     responses:
 *       200:
 *         description: Authentication successful. Returns session token.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       400:
 *         description: Validation failed or incorrect credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 *       429:
 *         description: Too many login attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 */
router.post(
  "/agent/login",
  // csrfProtection removed from login routes: CSRF attacks target authenticated
// sessions, not public login forms. Cookie-based CSRF also fails in
// cross-origin dev setups (SameSite=strict). Protected routes still use it.
  validate(authValidator.login),
  authController.agentLogin
);

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Agent Login (Compat)
 *     description: Authenticate an agent. Alias for /api/agent/login.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AgentLoginRequest'
 *     responses:
 *       200:
 *         description: Authentication successful.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthSuccessResponse'
 *       400:
 *         description: Validation failed or incorrect credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 *       429:
 *         description: Too many login attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthErrorResponse'
 */
router.post(
  "/users/login",
  // csrfProtection removed from login routes: CSRF attacks target authenticated
// sessions, not public login forms. Cookie-based CSRF also fails in
// cross-origin dev setups (SameSite=strict). Protected routes still use it.
  validate(authValidator.login),
  authController.agentLogin
);

module.exports = router;
