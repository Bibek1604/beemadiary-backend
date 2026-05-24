import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { verifyToken } from '../middleware/auth';
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
  authController.register
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
  authController.login
);

/**
 * POST /api/auth/logout
 * Logout user
 */
router.post(
  '/logout',
  verifyToken,
  csrfProtection,
  authController.logout
);

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post(
  '/refresh',
  csrfProtection,
  validateBody(refreshTokenSchema),
  authController.refreshToken
);

/**
 * GET /api/auth/sessions
 * Get active sessions
 */
router.get(
  '/sessions',
  verifyToken,
  authController.getActiveSessions
);

/**
 * DELETE /api/auth/sessions/:sessionId
 * Terminate specific session
 */
router.delete(
  '/sessions/:sessionId',
  verifyToken,
  authController.terminateSession
);

/**
 * POST /api/auth/logout-all
 * Logout from all devices
 */
router.post(
  '/logout-all',
  verifyToken,
  csrfProtection,
  authController.logoutAllDevices
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
  authController.changePassword
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
  authController.forgotPassword
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
  authController.sendVerificationEmail
);

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get(
  '/me',
  verifyToken,
  authController.getCurrentUser
);

export default router;
