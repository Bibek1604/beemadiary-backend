const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const validate = require("../middlewares/validate.middleware");
const authValidator = require("../validators/auth.validator");
const { authLimiter } = require("../middlewares/rateLimit.middleware");

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
 *               $ref: '#/components/schemas/AdminLoginSuccessResponse'
 *       400:
 *         description: Validation failed or incorrect credentials.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many login attempts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/admin/login",
  authLimiter,
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
 *       400:
 *         description: Validation failed or incorrect credentials.
 *       429:
 *         description: Too many login attempts.
 */
router.post(
  "/agent/login",
  authLimiter,
  validate(authValidator.login),
  authController.agentLogin
);

module.exports = router;
