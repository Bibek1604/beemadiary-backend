import prisma from '../config/database';

export interface AuditLogEntry {
  userId?: number;
  action: string;
  resource?: string;
  resourceId?: number;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  status: 'SUCCESS' | 'FAILURE';
}

export class AuditLogger {
  /**
   * Log audit event
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          user_id: entry.userId,
          action: entry.action,
          resource: entry.resource,
          resource_id: entry.resourceId,
          details: entry.details ? JSON.stringify(entry.details) : null,
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent,
          status: entry.status,
        },
      });
    } catch (error) {
      console.error('[AuditLogger Error]', error);
      // Don't throw - logging failure shouldn't break the app
    }
  }

  /**
   * Log login success
   */
  static async logLoginSuccess(
    userId: number,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    await this.log({
      userId,
      action: 'LOGIN',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
      details: { timestamp: new Date().toISOString() },
    });

    // Update last login
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { last_login: new Date() },
      });
    } catch (error) {
      console.error('[Update last_login Error]', error);
    }
  }

  /**
   * Log login failure
   */
  static async logLoginFailure(
    email: string,
    ipAddress: string,
    userAgent: string,
    reason: string
  ): Promise<void> {
    await this.log({
      action: 'LOGIN_FAILED',
      status: 'FAILURE',
      ipAddress,
      userAgent,
      details: { email, reason },
    });
  }

  /**
   * Log logout
   */
  static async logLogout(
    userId: number,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    await this.log({
      userId,
      action: 'LOGOUT',
      status: 'SUCCESS',
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log password change
   */
  static async logPasswordChange(userId: number): Promise<void> {
    await this.log({
      userId,
      action: 'PASSWORD_CHANGED',
      status: 'SUCCESS',
      details: { timestamp: new Date().toISOString() },
    });
  }

  /**
   * Log data access
   */
  static async logDataAccess(
    userId: number,
    resource: string,
    resourceId: number,
    ipAddress: string,
    userAgent: string
  ): Promise<void> {
    await this.log({
      userId,
      action: 'DATA_ACCESS',
      resource,
      resourceId,
      status: 'SUCCESS',
      ipAddress,
      userAgent,
    });
  }

  /**
   * Log data modification
   */
  static async logDataModification(
    userId: number,
    action: string,
    resource: string,
    resourceId: number,
    changes?: Record<string, any>
  ): Promise<void> {
    await this.log({
      userId,
      action: action.toUpperCase(),
      resource,
      resourceId,
      status: 'SUCCESS',
      details: changes,
    });
  }

  /**
   * Get audit logs for user
   */
  static async getUserAuditLogs(userId: number, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return prisma.auditLog.findMany({
      where: {
        user_id: userId,
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  }

  /**
   * Get audit logs by action
   */
  static async getAuditLogsByAction(action: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    return prisma.auditLog.findMany({
      where: {
        action,
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
  }
}
