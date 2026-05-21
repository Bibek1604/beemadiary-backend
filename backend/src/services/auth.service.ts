import { User } from '@prisma/client';
import authRepository from '../repositories/auth.repository';
import { PasswordUtils } from '../utils/passwordUtils';
import { TokenManager } from '../middleware/tokenManager';
import { AccountLockoutManager } from '../utils/accountLockout';
import { AuditLogger } from '../utils/auditLogger';
import { CONSTANTS } from '../config/constants';

/**
 * Authentication Service
 * Handles all business logic for authentication
 */
export class AuthService {
  private passwordUtils = PasswordUtils;
  private tokenManager = TokenManager;
  private accountLockout = AccountLockoutManager;
  private auditLogger = AuditLogger;

  /**
   * Register a new user
   */
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: string = 'AGENT',
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Check if user already exists
    const existingUser = await authRepository.getUserByEmail(email);
    if (existingUser) {
      await this.auditLogger.log(
        0,
        'REGISTER_FAILED',
        'USER',
        '',
        '',
        'User already exists',
        ipAddress,
        userAgent,
        'FAILURE'
      );
      throw new Error('User already exists');
    }

    // Validate password strength
    const passwordValidation = this.passwordUtils.validatePasswordStrength(
      password
    );
    if (!passwordValidation.isStrong) {
      throw new Error(`Password is too weak: ${passwordValidation.message}`);
    }

    // Hash password
    const passwordHash = this.passwordUtils.hashPassword(password);

    // Create user
    const user = await authRepository.createUser({
      email,
      password: password, // Keep for backward compatibility
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      role: role as any,
    });

    // Log registration
    await this.auditLogger.logLoginSuccess(
      user.id,
      ipAddress,
      userAgent,
      'REGISTER'
    );

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    };
  }

  /**
   * Login user
   */
  async login(
    email: string,
    password: string,
    deviceName: string = 'Web Browser',
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Check account lockout
    const lockoutStatus = await this.accountLockout.isLocked(email);
    if (lockoutStatus.isLocked) {
      await this.auditLogger.log(
        0,
        'LOGIN_FAILED',
        'USER',
        email,
        '',
        'Account is locked',
        ipAddress,
        userAgent,
        'ATTEMPT'
      );
      throw new Error(
        `Account is locked. Try again after ${lockoutStatus.remainingMinutes} minutes.`
      );
    }

    // Get user
    const user = await authRepository.getUserByEmail(email);
    if (!user) {
      await this.auditLogger.log(
        0,
        'LOGIN_FAILED',
        'USER',
        email,
        '',
        'User not found',
        ipAddress,
        userAgent,
        'FAILURE'
      );
      throw new Error('Invalid credentials');
    }

    // Verify password
    const passwordValid = this.passwordUtils.verifyPassword(
      password,
      user.password_hash || user.password
    );

    if (!passwordValid) {
      // Record failed attempt
      await this.accountLockout.recordFailedAttempt(email);

      const lockoutInfo = await this.accountLockout.isLocked(email);
      if (lockoutInfo.isLocked) {
        await this.auditLogger.logLoginFailure(
          user.id,
          ipAddress,
          userAgent,
          'Account locked due to multiple failed attempts'
        );
        throw new Error(
          `Too many failed attempts. Account locked for ${lockoutInfo.remainingMinutes} minutes.`
        );
      }

      await this.auditLogger.logLoginFailure(
        user.id,
        ipAddress,
        userAgent,
        'Invalid password'
      );
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.is_active) {
      await this.auditLogger.logLoginFailure(
        user.id,
        ipAddress,
        userAgent,
        'User account is inactive'
      );
      throw new Error('User account is inactive');
    }

    // Reset lockout on successful login
    await this.accountLockout.resetAttempts(email);

    // Create session
    const sessionExpiresAt = new Date(
      Date.now() + CONSTANTS.SESSION_DURATION * 60 * 1000
    );
    const session = await authRepository.createSession({
      user_id: user.id,
      device_name: deviceName,
      user_agent: userAgent,
      ip_address: ipAddress,
      expires_at: sessionExpiresAt,
    });

    // Generate tokens
    const { accessToken, refreshToken } =
      await this.tokenManager.generateTokens(user.id, session.id);

    // Update user last login
    await authRepository.updateUser(user.id, {
      last_login: new Date(),
      last_login_ip: ipAddress,
      login_attempt_count: 0,
    });

    // Log successful login
    await this.auditLogger.logLoginSuccess(user.id, ipAddress, userAgent);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
      session: {
        id: session.id,
        expiresAt: sessionExpiresAt,
      },
    };
  }

  /**
   * Logout user
   */
  async logout(
    userId: number,
    sessionId: string,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Terminate session
    await authRepository.terminateSession(sessionId);

    // Log logout
    await this.auditLogger.log(
      userId,
      'LOGOUT',
      'USER',
      String(userId),
      '',
      'User logged out',
      ipAddress,
      userAgent
    );

    return { message: 'Successfully logged out' };
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    refreshTokenValue: string,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    const tokenData = await this.tokenManager.rotateRefreshToken(
      refreshTokenValue
    );

    if (!tokenData) {
      throw new Error('Invalid refresh token');
    }

    // Log token refresh
    await this.auditLogger.log(
      tokenData.userId,
      'TOKEN_REFRESH',
      'AUTH',
      '',
      '',
      'Access token refreshed',
      ipAddress,
      userAgent
    );

    return {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.newRefreshToken,
    };
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: number) {
    const sessions = await authRepository.getUserSessions(userId, true);

    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.device_name || 'Unknown Device',
      ipAddress: session.ip_address,
      createdAt: session.created_at,
      lastActivity: session.last_activity,
      isActive: session.is_active,
    }));
  }

  /**
   * Terminate a session
   */
  async terminateSession(
    userId: number,
    sessionId: string,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Verify session belongs to user
    const sessions = await authRepository.getUserSessions(userId, true);
    const sessionExists = sessions.some((s) => s.id === sessionId);

    if (!sessionExists) {
      throw new Error('Session not found');
    }

    await authRepository.terminateSession(sessionId);

    // Log session termination
    await this.auditLogger.log(
      userId,
      'SESSION_TERMINATED',
      'SESSION',
      sessionId,
      '',
      'User terminated a session',
      ipAddress,
      userAgent
    );

    return { message: 'Session terminated successfully' };
  }

  /**
   * Logout from all devices
   */
  async logoutAllDevices(
    userId: number,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Terminate all sessions
    await authRepository.terminateAllUserSessions(userId);

    // Revoke all refresh tokens
    await authRepository.revokeAllUserRefreshTokens(userId);

    // Log logout all devices
    await this.auditLogger.log(
      userId,
      'LOGOUT_ALL_DEVICES',
      'USER',
      String(userId),
      '',
      'User logged out from all devices',
      ipAddress,
      userAgent
    );

    return { message: 'Successfully logged out from all devices' };
  }

  /**
   * Change password
   */
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Get user
    const user = await authRepository.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Verify current password
    const passwordValid = this.passwordUtils.verifyPassword(
      currentPassword,
      user.password_hash || user.password
    );

    if (!passwordValid) {
      await this.auditLogger.logLoginFailure(
        userId,
        ipAddress,
        userAgent,
        'Invalid current password during password change'
      );
      throw new Error('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = this.passwordUtils.validatePasswordStrength(
      newPassword
    );
    if (!passwordValidation.isStrong) {
      throw new Error(`New password is too weak: ${passwordValidation.message}`);
    }

    // Hash new password
    const newPasswordHash = this.passwordUtils.hashPassword(newPassword);

    // Update password
    await authRepository.updateUser(userId, {
      password_hash: newPasswordHash,
    });

    // Revoke all refresh tokens to force re-login on other devices
    await authRepository.revokeAllUserRefreshTokens(userId);

    // Log password change
    await this.auditLogger.log(
      userId,
      'PASSWORD_CHANGED',
      'USER',
      String(userId),
      'password',
      'User changed password',
      ipAddress,
      userAgent
    );

    return { message: 'Password changed successfully' };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(
    email: string,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    const user = await authRepository.getUserByEmail(email);

    // Always return success for security (don't leak if email exists)
    if (!user) {
      return { message: 'Password reset email sent if account exists' };
    }

    // Generate reset token
    const resetToken = this.passwordUtils.generateToken();
    const tokenHash = this.passwordUtils.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + CONSTANTS.PASSWORD_RESET_EXPIRY);

    // Create password reset record
    await authRepository.createPasswordReset({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    // Log password reset request
    await this.auditLogger.log(
      user.id,
      'PASSWORD_RESET_REQUESTED',
      'USER',
      String(user.id),
      '',
      'User requested password reset',
      ipAddress,
      userAgent
    );

    // TODO: Send email with reset link containing resetToken
    // Email should contain: /reset-password?token={resetToken}

    return {
      message: 'Password reset email sent if account exists',
      // In development, you can return the token for testing
      // token: resetToken,
    };
  }

  /**
   * Verify email
   */
  async requestEmailVerification(
    userId: number,
    email: string,
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    // Generate verification token
    const verificationToken = this.passwordUtils.generateToken();
    const tokenHash = this.passwordUtils.hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + CONSTANTS.EMAIL_VERIFICATION_EXPIRY);

    // Create email verification record
    await authRepository.createEmailVerification({
      user_id: userId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    // Log email verification request
    await this.auditLogger.log(
      userId,
      'EMAIL_VERIFICATION_REQUESTED',
      'USER',
      String(userId),
      '',
      `Email verification requested for ${email}`,
      ipAddress,
      userAgent
    );

    // TODO: Send email with verification link containing verificationToken
    // Email should contain: /verify-email?token={verificationToken}

    return {
      message: 'Verification email sent',
      // In development, you can return the token for testing
      // token: verificationToken,
    };
  }
}

export default new AuthService();
