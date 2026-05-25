import { randomUUID } from 'crypto';
import authRepository from '../repositories/auth.repository';
import { PasswordUtils } from '../utils/passwordUtils';
import { TokenManager } from '../middleware/tokenManager';
import type { UserRole } from '../types';

type UserRecord = {
  id: string;
  email: string;
  password_hash?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  role?: UserRole;
  is_active?: boolean;
};

type SessionRecord = {
  id: string;
  created_at?: Date;
  last_activity?: Date;
  is_active?: boolean;
  device_name?: string;
  ip_address?: string;
};

export class AuthService {
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    role: UserRole = 'AGENT'
  ) {
    const existingUser = await authRepository.getUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(password);
    if (!passwordValidation.valid) {
      throw new Error(`Password is too weak: ${passwordValidation.errors.join(', ')}`);
    }

    const user = await authRepository.createUser({
      id: randomUUID(),
      email,
      password_hash: PasswordUtils.hashPassword(password),
      first_name: firstName,
      last_name: lastName,
      role,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
    };
  }

  async login(
    email: string,
    password: string,
    deviceName: string = 'Web Browser',
    ipAddress: string = '',
    userAgent: string = ''
  ) {
    const user = (await authRepository.getUserByEmail(email)) as UserRecord | null;
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const passwordValid = PasswordUtils.verifyPassword(password, user.password_hash || user.password || '');
    if (!passwordValid) {
      throw new Error('Invalid credentials');
    }

    if (user.is_active === false) {
      throw new Error('User account is inactive');
    }

    const sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const session = await authRepository.createSession({
      id: randomUUID(),
      user_id: user.id,
      user_type: user.role || 'AGENT',
      token: randomUUID(),
      expires_at: sessionExpiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
      device_name: deviceName,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role || 'AGENT',
      type: user.role || 'AGENT',
    } as const;

    const accessToken = TokenManager.generateAccessToken(payload as any);
    const refreshToken = TokenManager.generateRefreshToken(payload as any);

    await authRepository.createRefreshToken({
      id: randomUUID(),
      user_id: user.id,
      token_hash: PasswordUtils.hashToken(refreshToken),
      token: refreshToken,
      family_id: randomUUID(),
      revoked_at: null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role || 'AGENT',
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

  async logout(_userId: string, sessionId: string) {
    await authRepository.terminateSession(sessionId);
    return { message: 'Successfully logged out' };
  }

  async refreshToken(refreshTokenValue: string, ipAddress = '', userAgent = '') {
    const tokenHash = PasswordUtils.hashToken(refreshTokenValue);
    const existing = await authRepository.getRefreshTokenByHash(tokenHash);

    if (!existing || existing.revoked_at) {
      throw new Error('Invalid refresh token');
    }

    const user = (await authRepository.getUserByEmail(existing.email || existing.user_email || '')) as UserRecord | null;
    const userId = String(existing.user_id || user?.id || '');
    const role = (user?.role || 'AGENT') as UserRole;
    const payload = { id: userId, email: user?.email || '', role, type: role } as any;

    const accessToken = TokenManager.generateAccessToken(payload);
    const newRefreshToken = TokenManager.generateRefreshToken(payload);

    await authRepository.revokeRefreshToken(tokenHash);
    await authRepository.createRefreshToken({
      id: randomUUID(),
      user_id: userId,
      token_hash: PasswordUtils.hashToken(newRefreshToken),
      token: newRefreshToken,
      family_id: existing.family_id || randomUUID(),
      revoked_at: null,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      ip_address: ipAddress,
      user_agent: userAgent,
      created_at: new Date(),
      updated_at: new Date(),
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async getUserSessions(userId: string) {
    const sessions = (await authRepository.getUserSessions(userId, true)) as SessionRecord[];
    return sessions.map((session) => ({
      id: session.id,
      deviceName: session.device_name || 'Unknown Device',
      ipAddress: session.ip_address,
      createdAt: session.created_at,
      lastActivity: session.last_activity,
      isActive: session.is_active,
    }));
  }

  async terminateSession(_userId: string, sessionId: string) {
    await authRepository.terminateSession(sessionId);
    return { message: 'Session terminated successfully' };
  }

  async logoutAllDevices(userId: string) {
    await authRepository.terminateAllUserSessions(userId);
    await authRepository.revokeAllUserRefreshTokens(userId);
    return { message: 'Successfully logged out from all devices' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = (await authRepository.getUserByEmail(userId)) as UserRecord | null;
    if (!user) {
      throw new Error('User not found');
    }

    const passwordValid = PasswordUtils.verifyPassword(currentPassword, user.password_hash || user.password || '');
    if (!passwordValid) {
      throw new Error('Current password is incorrect');
    }

    const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(`New password is too weak: ${passwordValidation.errors.join(', ')}`);
    }

    await authRepository.updateUser(userId, {
      password_hash: PasswordUtils.hashPassword(newPassword),
      updated_at: new Date(),
    });

    return { message: 'Password changed successfully' };
  }

  async requestPasswordReset(email: string) {
    const user = (await authRepository.getUserByEmail(email)) as UserRecord | null;
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const token = PasswordUtils.generateToken(32);
    await authRepository.createPasswordReset({
      id: randomUUID(),
      user_id: user.id,
      token_hash: PasswordUtils.hashToken(token),
      token,
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      message: 'Password reset request processed',
    };
  }

  async requestEmailVerification(userId: string, email: string) {
    const token = PasswordUtils.generateToken(32);
    await authRepository.createEmailVerification({
      id: randomUUID(),
      user_id: userId,
      email,
      token_hash: PasswordUtils.hashToken(token),
      token,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      created_at: new Date(),
      updated_at: new Date(),
    });

    return {
      message: 'Verification email requested',
    };
  }
}

export default new AuthService();
