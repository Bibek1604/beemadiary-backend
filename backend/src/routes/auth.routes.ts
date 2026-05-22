import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { verifyToken } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { authLimiter } from '../middleware/security';
import { validateBody } from '../middleware/validation';
import { z } from 'zod';
import { csrfProtection } from '../middleware/csrf';

const router = Router();

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

const changePasswordSchema = z.object({
  current_password: z.string(),
  new_password: z.string().min(12),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const verificationEmailSchema = z.object({
  email: z.string().email(),
});

/**
 * POST /api/auth/register
 * Register new user
 */
router.post(
  '/register',
  authLimiter,
  csrfProtection,
  validateBody(registerSchema),
  asyncHandler((req, res) => authController.register(req, res))
);

/**
 * POST /api/auth/login
 * Login user
 */
router.post(
  '/login',
  authLimiter,
  csrfProtection,
  validateBody(loginSchema),
  asyncHandler((req, res) => authController.login(req, res))
);

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post(
  '/logout',
  verifyToken,
  csrfProtection,
  asyncHandler((req, res) => authController.logout(req, res))
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  csrfProtection,
  validateBody(refreshTokenSchema),
  asyncHandler((req, res) => authController.refreshToken(req, res))
);

/**
 * GET /api/auth/sessions
 * Get active sessions
 */
router.get(
  '/sessions',
  verifyToken,
  asyncHandler((req, res) => authController.getActiveSessions(req, res))
);

/**
 * DELETE /api/auth/sessions/:sessionId
 * Terminate specific session
 */
router.delete(
  '/sessions/:sessionId',
  verifyToken,
  asyncHandler((req, res) => authController.terminateSession(req, res))
);

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 */
router.post(
  '/logout-all',
  verifyToken,
  csrfProtection,
  asyncHandler((req, res) => authController.logoutAllDevices(req, res))
);

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post(
  '/change-password',
  verifyToken,
  csrfProtection,
  validateBody(changePasswordSchema),
  asyncHandler((req, res) => authController.changePassword(req, res))
);

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post(
  '/forgot-password',
  authLimiter,
  csrfProtection,
  validateBody(forgotPasswordSchema),
  asyncHandler((req, res) => authController.forgotPassword(req, res))
);

/**
 * POST /api/auth/send-verification
 * Request email verification
 */
router.post(
  '/send-verification',
  verifyToken,
  csrfProtection,
  validateBody(verificationEmailSchema),
  asyncHandler((req, res) => authController.sendVerificationEmail(req, res))
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get(
  '/me',
  verifyToken,
  asyncHandler((req, res) => authController.getCurrentUser(req, res))
);

export default router;
