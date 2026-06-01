import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';
import authService from '../services/auth.service';
import { asyncHandler } from '../middleware/asyncHandler';
const env = require('../config/env');

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE || 'strict',
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/',
};

/**
 * Authentication Controller
 * Handles all authentication-related HTTP requests
 */
export class AuthController {
  /**
   * Register new user
   * POST /api/auth/register
   */
  register = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, first_name, last_name } = req.body;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const user = await authService.register(
      email,
      password,
      first_name,
      last_name,
      'AGENT',
      ipAddress,
      userAgent
    );

    return res.status(CONSTANTS.STATUS_CODES.CREATED).json(
      ResponseHandler.success(
        'User registered successfully',
        { user },
        CONSTANTS.STATUS_CODES.CREATED
      )
    );
  });

  /**
   * Login user
   * POST /api/auth/login
   */
  login = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, device_name } = req.body;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = await authService.login(
      email,
      password,
      device_name || 'Web Browser',
      ipAddress,
      userAgent
    );

    // Set secure cookies
    res.cookie('accessToken', result.tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', result.tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Login successful', result)
    );
  });

  adminLogin = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, device_name } = req.body;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = await authService.login(
      email,
      password,
      device_name || 'Web Browser',
      ipAddress,
      userAgent
    );

    // Set secure cookies
    res.cookie('accessToken', result.tokens.accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.cookie('refreshToken', result.tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Admin login successful', result)
    );
  });

  agentLogin = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email, password, device_name } = req.body;
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = await authService.login(
      email,
      password,
      device_name || 'Web Browser',
      ipAddress,
      userAgent
    );

    const accessToken = result.tokens.accessToken;
    const refreshToken = result.tokens.refreshToken;

    // Set secure cookies
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Return token at top level so the frontend can read it from response.data.token
    return res.status(CONSTANTS.STATUS_CODES.OK).json({
      success: true,
      status: true,
      message: 'Login successful',
      token: accessToken,
      data: (result as any).user || {},
    });
  });

  /**
   * Logout user
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized()
      );
    }

    const { session_id } = req.body;

    await authService.logout(req.user.id, session_id);

    // Clear cookies
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Logout successful')
    );
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { refreshToken } = req.body;
    const refreshTokenFromCookie = (req as any).cookies?.refreshToken;
    const refreshTokenFromHeader = req.get('x-refresh-token') || req.get('authorization')?.replace(/^Bearer\s+/i, '');
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const tokenToUse = refreshTokenFromHeader || refreshToken || refreshTokenFromCookie;

    if (!tokenToUse) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Refresh token required')
      );
    }

    const tokens = await authService.refreshToken(
      tokenToUse,
      ipAddress,
      userAgent
    );

    res.cookie('accessToken', tokens.accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Token refreshed', { tokens })
    );
  });

  /**
   * Get active sessions
   * GET /api/auth/sessions
   */
  getActiveSessions = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized()
      );
    }

    const sessions = await authService.getUserSessions(req.user.id);

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Active sessions retrieved', { sessions })
    );
  });

  /**
   * Terminate specific session
   * DELETE /api/auth/sessions/:sessionId
   */
  terminateSession = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized()
      );
    }

    const { sessionId } = req.params;

    await authService.terminateSession(req.user.id, sessionId);

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Session terminated successfully')
    );
  });

  /**
   * Logout from all devices
   * POST /api/auth/logout-all
   */
  logoutAllDevices = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized()
      );
    }

    await authService.logoutAllDevices(req.user.id);

    // Clear cookies
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Logged out from all devices')
    );
  });

  /**
   * Change password
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized()
      );
    }

    const { current_password, new_password } = req.body;

    await authService.changePassword(
      req.user.id,
      current_password,
      new_password
    );

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Password changed successfully')
    );
  });

  /**
   * Request password reset
   * POST /api/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const { email } = req.body;

    const result = await authService.requestPasswordReset(email);

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success(result.message, { email })
    );
  });

  /**
   * Request email verification
   * POST /api/auth/send-verification
   */
  sendVerificationEmail = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized()
      );
    }

    const { email } = req.body;

    const result = await authService.requestEmailVerification(
      req.user.id,
      email
    );

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success(result.message)
    );
  });

  /**
   * Get current user profile
   * GET /api/auth/me
   */
  getCurrentUser = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Authentication required')
      );
    }

    // Return user info from JWT token
    const user = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      type: req.user.type || 'AGENT',
    };

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Current user retrieved', { user })
    );
  });
}

export const authController = new AuthController();
export const adminLogin = authController.adminLogin;
export const agentLogin = authController.agentLogin;
