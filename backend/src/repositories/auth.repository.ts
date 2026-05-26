import prisma from '../config/database';

/**
 * Authentication Repository
 * Handles all database operations related to authentication
 */
export class AuthRepository {
  /**
   * Get user by email
   */
  async getUserByEmail(email: string): Promise<any | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Get user by ID with relations
   */
  async getUserById(id: string | number, includeRelations: boolean = false) {
    if (includeRelations) {
      return prisma.user.findUnique({
        where: { id },
        include: {
          agents: true,
          sessions: {
            where: { is_active: true },
          },
          account_lockout: true,
        },
      });
    }

    return prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new user
   */
  async createUser(data: any): Promise<any> {
    return prisma.user.create({
      data,
    });
  }

  /**
   * Update user
   */
  async updateUser(id: string | number, data: any): Promise<any> {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Create a new session
   */
  async createSession(data: any) {
    return prisma.session.create({
      data,
    });
  }

  /**
   * Get user sessions
   */
  async getUserSessions(userId: string | number, activeOnly: boolean = true) {
    const where: Record<string, any> = {
      user_id: userId,
    };

    if (activeOnly) {
      where.is_active = true;
    }

    return prisma.session.findMany({
      where,
      orderBy: { last_activity: 'desc' },
    });
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<void> {
    await prisma.session.update({
      where: { id: sessionId },
      data: { is_active: false },
    });
  }

  /**
   * Terminate all user sessions
   */
  async terminateAllUserSessions(userId: string | number): Promise<void> {
    await prisma.session.updateMany({
      where: { user_id: userId },
      data: { is_active: false },
    });
  }

  /**
   * Create refresh token
   */
  async createRefreshToken(data: any) {
    return prisma.refreshToken.create({
      data,
    });
  }

  /**
   * Get refresh token by hash
   */
  async getRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({
      where: { token_hash: tokenHash },
    });
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await prisma.refreshToken.update({
      where: { token_hash: tokenHash },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Revoke all user refresh tokens
   */
  async revokeAllUserRefreshTokens(userId: string | number): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { user_id: userId },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Get family tokens (for token rotation attack detection)
   */
  async getFamilyTokens(familyId: string) {
    return prisma.refreshToken.findMany({
      where: { family_id: familyId },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Create audit log
   */
  async createAuditLog(data: any) {
    return prisma.auditLog.create({
      data,
    });
  }

  /**
   * Get user audit logs
   */
  async getUserAuditLogs(userId: string | number, limit: number = 50) {
    return prisma.auditLog.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Get audit logs by action
   */
  async getAuditLogsByAction(action: string, limit: number = 50) {
    return prisma.auditLog.findMany({
      where: { action },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  /**
   * Get account lockout info
   */
  async getAccountLockout(userId: string | number) {
    return prisma.accountLockout.findUnique({
      where: { user_id: userId },
    });
  }

  /**
   * Create or update account lockout
   */
  async upsertAccountLockout(userId: string | number, data: any) {
    return prisma.accountLockout.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        ...data,
      },
      update: data,
    });
  }

  /**
   * Reset account lockout
   */
  async resetAccountLockout(userId: string | number): Promise<void> {
    await prisma.accountLockout.update({
      where: { user_id: userId },
      data: {
        failed_attempts: 0,
        locked_until: null,
      },
    });
  }

  /**
   * Create password reset token
   */
  async createPasswordReset(data: any) {
    return prisma.passwordReset.create({
      data,
    });
  }

  /**
   * Get password reset by hash
   */
  async getPasswordResetByHash(tokenHash: string) {
    return prisma.passwordReset.findUnique({
      where: { token_hash: tokenHash },
    });
  }

  /**
   * Mark password reset as used
   */
  async markPasswordResetAsUsed(tokenHash: string): Promise<void> {
    await prisma.passwordReset.update({
      where: { token_hash: tokenHash },
      data: { used_at: new Date() },
    });
  }

  /**
   * Revoke all user password resets
   */
  async revokeAllUserPasswordResets(userId: number): Promise<void> {
    await prisma.passwordReset.deleteMany({
      where: { user_id: userId },
    });
  }

  /**
   * Create email verification token
   */
  async createEmailVerification(data: any) {
    return prisma.emailVerification.create({
      data,
    });
  }

  /**
   * Get email verification by hash
   */
  async getEmailVerificationByHash(tokenHash: string) {
    return prisma.emailVerification.findUnique({
      where: { token_hash: tokenHash },
    });
  }

  /**
   * Mark email as verified
   */
  async markEmailAsVerified(tokenHash: string): Promise<void> {
    const emailVerification = await this.getEmailVerificationByHash(tokenHash);

    if (!emailVerification) {
      throw new Error('Email verification not found');
    }

    const userId = emailVerification.user_id;

    // Update user and email verification in parallel
    await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: {
          email_verified: true,
          email_verified_at: new Date(),
        },
      }),
      prisma.emailVerification.update({
        where: { token_hash: tokenHash },
        data: { verified_at: new Date() },
      }),
    ]);
  }

  /**
   * Get or create 2FA settings
   */
  async getTwoFactorAuth(userId: number) {
    return prisma.twoFactorAuth.findUnique({
      where: { user_id: userId },
    });
  }

  /**
   * Create 2FA settings
   */
  async createTwoFactorAuth(data: any) {
    return prisma.twoFactorAuth.create({
      data,
    });
  }

  /**
   * Verify 2FA
   */
  async verifyTwoFactorAuth(userId: number): Promise<void> {
    await prisma.twoFactorAuth.update({
      where: { user_id: userId },
      data: { verified_at: new Date() },
    });
  }

  /**
   * Disable 2FA
   */
  async disableTwoFactorAuth(userId: number): Promise<void> {
    await prisma.twoFactorAuth.delete({
      where: { user_id: userId },
    });
  }
}

export default new AuthRepository();
