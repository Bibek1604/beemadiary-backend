import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';
import authService from '../services/auth.service';
import { asyncHandler } from '../middleware/asyncHandler';

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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success('Login successful', result)
    );
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
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    await authService.logout(req.user.id, session_id, ipAddress, userAgent);

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

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
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    if (!refreshToken) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Refresh token required')
      );
    }

    const tokens = await authService.refreshToken(
      refreshToken,
      ipAddress,
      userAgent
    );

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
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    await authService.terminateSession(req.user.id, sessionId, ipAddress, userAgent);

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

    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    await authService.logoutAllDevices(req.user.id, ipAddress, userAgent);

    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

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
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    await authService.changePassword(
      req.user.id,
      current_password,
      new_password,
      ipAddress,
      userAgent
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
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = await authService.requestPasswordReset(email, ipAddress, userAgent);

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
    const ipAddress = req.ip || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';

    const result = await authService.requestEmailVerification(
      req.user.id,
      email,
      ipAddress,
      userAgent
    );

    return res.status(CONSTANTS.STATUS_CODES.OK).json(
      ResponseHandler.success(result.message)
    );
  });
}

export const authController = new AuthController();
