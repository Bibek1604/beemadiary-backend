import { Decimal } from '@prisma/client/runtime/library';

export class Calculations {
  /**
   * Calculate percentage
   */
  static calculatePercentage(current: number | Decimal, total: number | Decimal): number {
    const currentNum = typeof current === 'number' ? current : Number(current);
    const totalNum = typeof total === 'number' ? total : Number(total);
    
    if (totalNum === 0) return 0;
    return Number(((currentNum / totalNum) * 100).toFixed(2));
  }

  /**
   * Round to 2 decimal places
   */
  static round2Decimals(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Format currency
   */
  static formatCurrency(amount: number | Decimal): number {
    const num = typeof amount === 'number' ? amount : Number(amount);
    return this.round2Decimals(num);
  }

  /**
   * Check if value is valid (not null, undefined, empty string, or just spaces)
   */
  static isValidValue(value: any): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'string') {
      return value.trim().length > 0;
    }
    return true;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number (basic)
   */
  static isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^\d{7,15}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
  }
}
