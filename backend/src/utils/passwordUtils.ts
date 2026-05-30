import crypto from 'crypto';
import bcryptjs from 'bcryptjs';

export class PasswordUtils {
  /**
   * Hash password using bcrypt (preferred) or PBKDF2 (legacy)
   */
  static hashPassword(password: string): string {
    // Use bcrypt for new passwords
    return bcryptjs.hashSync(password, 10);
  }

  /**
   * Verify password against hash (supports both bcrypt and PBKDF2)
   */
  static verifyPassword(password: string, hash: string): boolean {
    try {
      // Check if it's a bcrypt hash
      if (hash.startsWith('$2a') || hash.startsWith('$2b') || hash.startsWith('$2y')) {
        return bcryptjs.compareSync(password, hash);
      }
      // Fall back to PBKDF2 for legacy hashes
      const [salt, originalHash] = hash.split(':');
      if (!salt || !originalHash) {
        return false;
      }
      const computedHash = crypto
        .pbkdf2Sync(password, salt, 100000, 64, 'sha512')
        .toString('hex');
      return computedHash === originalHash;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password: string): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate random token
   */
  static generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate OTP code (6 digits)
   */
  static generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Hash token (for storing in DB)
   */
  static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
