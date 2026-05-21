import prisma from '../config/database';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export class AccountLockoutManager {
  /**
   * Check if account is locked
   */
  static async isLocked(userId: number): Promise<boolean> {
    try {
      const lockout = await prisma.accountLockout.findUnique({
        where: { user_id: userId },
      });

      if (!lockout) return false;

      // Check if lockout has expired
      if (lockout.locked_until && lockout.locked_until < new Date()) {
        // Unlock account
        await this.unlock(userId);
        return false;
      }

      return !!lockout.locked_until;
    } catch (error) {
      console.error('[AccountLockoutManager Error]', error);
      return false;
    }
  }

  /**
   * Record failed login attempt
   */
  static async recordFailedAttempt(userId: number): Promise<number> {
    try {
      let lockout = await prisma.accountLockout.findUnique({
        where: { user_id: userId },
      });

      if (!lockout) {
        lockout = await prisma.accountLockout.create({
          data: {
            user_id: userId,
            failed_attempts: 1,
            last_attempt: new Date(),
          },
        });
      } else {
        lockout = await prisma.accountLockout.update({
          where: { user_id: userId },
          data: {
            failed_attempts: lockout.failed_attempts + 1,
            last_attempt: new Date(),
          },
        });
      }

      // Lock account if max attempts exceeded
      if (lockout.failed_attempts >= MAX_FAILED_ATTEMPTS) {
        await this.lock(userId, 'Too many failed login attempts');
      }

      return lockout.failed_attempts;
    } catch (error) {
      console.error('[recordFailedAttempt Error]', error);
      return 0;
    }
  }

  /**
   * Lock account
   */
  static async lock(userId: number, reason: string = 'Too many failed attempts'): Promise<void> {
    try {
      await prisma.accountLockout.update({
        where: { user_id: userId },
        data: {
          locked_until: new Date(Date.now() + LOCKOUT_DURATION_MS),
          reason,
        },
      });
    } catch (error) {
      console.error('[lock Error]', error);
    }
  }

  /**
   * Unlock account (manual unlock)
   */
  static async unlock(userId: number): Promise<void> {
    try {
      await prisma.accountLockout.update({
        where: { user_id: userId },
        data: {
          failed_attempts: 0,
          locked_until: null,
          last_attempt: null,
        },
      });
    } catch (error) {
      console.error('[unlock Error]', error);
    }
  }

  /**
   * Reset failed attempts on successful login
   */
  static async resetAttempts(userId: number): Promise<void> {
    try {
      await prisma.accountLockout.update({
        where: { user_id: userId },
        data: {
          failed_attempts: 0,
          locked_until: null,
          last_attempt: null,
        },
      });
    } catch (error) {
      console.error('[resetAttempts Error]', error);
    }
  }

  /**
   * Get lockout info
   */
  static async getLockoutInfo(userId: number) {
    return prisma.accountLockout.findUnique({
      where: { user_id: userId },
    });
  }

  /**
   * Get remaining lockout time (in minutes)
   */
  static async getRemainingLockoutTime(userId: number): Promise<number> {
    try {
      const lockout = await this.getLockoutInfo(userId);

      if (!lockout || !lockout.locked_until) {
        return 0;
      }

      const now = new Date();
      if (lockout.locked_until <= now) {
        return 0;
      }

      const remainingMs = lockout.locked_until.getTime() - now.getTime();
      return Math.ceil(remainingMs / 60000); // Convert to minutes
    } catch (error) {
      return 0;
    }
  }
}
