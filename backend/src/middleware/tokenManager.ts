import jwt from 'jsonwebtoken';
import { CONSTANTS } from '../config/constants';
import { JWTPayload } from '../types';
import prisma from '../config/database';

export class TokenManager {
  /**
   * Generate access token (short-lived, 15 minutes)
   */
  static generateAccessToken(payload: JWTPayload): string {
    return jwt.sign(payload, CONSTANTS.JWT_SECRET, {
      expiresIn: (CONSTANTS.ACCESS_TOKEN_EXPIRY || '15m') as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Generate refresh token (long-lived, 7 days)
   */
  static generateRefreshToken(payload: JWTPayload): string {
    return jwt.sign(payload, CONSTANTS.JWT_REFRESH_SECRET, {
      expiresIn: (CONSTANTS.REFRESH_TOKEN_EXPIRY || '7d') as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, CONSTANTS.JWT_SECRET) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, CONSTANTS.JWT_REFRESH_SECRET) as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Create session with access and refresh tokens
   */
  static async createSession(
    userId: number,
    ipAddress: string,
    userAgent: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: number;
  }> {
    const payload: JWTPayload = {
      id: userId,
      email: '', // Will be populated by controller
      role: 'USER', // Will be populated by controller
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Store session in database
    const session = await prisma.session.create({
      data: {
        user_id: userId,
        token: accessToken,
        refresh_token: refreshToken,
        token_expires: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        refresh_expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    return {
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  /**
   * Rotate refresh token (token family for attack detection)
   */
  static async rotateRefreshToken(
    userId: number,
    oldRefreshToken: string,
    ipAddress: string,
    userAgent: string
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    sessionId: number;
  } | null> {
    try {
      // Find the old refresh token
      const oldToken = await prisma.refreshToken.findUnique({
        where: { token: oldRefreshToken },
      });

      if (!oldToken || oldToken.revoked) {
        // Potential token reuse attack - revoke all tokens in family
        if (oldToken?.family_id) {
          await prisma.refreshToken.updateMany({
            where: { family_id: oldToken.family_id },
            data: { revoked: true, revoked_at: new Date() },
          });
        }
        return null;
      }

      // Check if token is expired
      if (new Date() > oldToken.expires_at) {
        return null;
      }

      // Generate new tokens
      const payload: JWTPayload = {
        id: userId,
        email: '',
        role: 'USER',
      };

      const newAccessToken = this.generateAccessToken(payload);
      const newRefreshToken = this.generateRefreshToken(payload);
      const familyId = oldToken.family_id || `family-${Date.now()}`;

      // Revoke old token
      await prisma.refreshToken.update({
        where: { id: oldToken.id },
        data: { revoked: true, revoked_at: new Date() },
      });

      // Create new refresh token
      const newTokenRecord = await prisma.refreshToken.create({
        data: {
          user_id: userId,
          token: newRefreshToken,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          ip_address: ipAddress,
          user_agent: userAgent,
          family_id: familyId,
        },
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        sessionId: newTokenRecord.id,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Revoke refresh token
   */
  static async revokeRefreshToken(token: string): Promise<boolean> {
    try {
      await prisma.refreshToken.update({
        where: { token },
        data: { revoked: true, revoked_at: new Date() },
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Revoke all sessions for user (logout all devices)
   */
  static async revokeAllSessions(userId: number): Promise<boolean> {
    try {
      await prisma.session.updateMany({
        where: { user_id: userId },
        data: { is_active: false },
      });

      await prisma.refreshToken.updateMany({
        where: { user_id: userId },
        data: { revoked: true, revoked_at: new Date() },
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get active sessions for user
   */
  static async getActiveSessions(userId: number) {
    return prisma.session.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
      select: {
        id: true,
        ip_address: true,
        user_agent: true,
        device_info: true,
        created_at: true,
        last_activity: true,
      },
    });
  }

  /**
   * Terminate specific session
   */
  static async terminateSession(sessionId: number, userId: number): Promise<boolean> {
    try {
      await prisma.session.update({
        where: { id: sessionId },
        data: { is_active: false },
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}
