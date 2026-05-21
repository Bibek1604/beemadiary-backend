export class DateUtils {
  /**
   * Calculate days between two dates
   */
  static daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1.getTime() - date2.getTime()) / oneDay));
  }

  /**
   * Calculate days overdue
   */
  static daysOverdue(dueDate: Date): number {
    const today = new Date();
    if (dueDate < today) {
      return this.daysBetween(today, dueDate);
    }
    return 0;
  }

  /**
   * Check if date is overdue
   */
  static isOverdue(dueDate: Date): boolean {
    return dueDate < new Date();
  }

  /**
   * Check if today is birthday
   */
  static isTodayBirthday(dob: Date): boolean {
    const today = new Date();
    return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate();
  }

  /**
   * Check if birthday is this month
   */
  static isBirthdayThisMonth(dob: Date): boolean {
    const today = new Date();
    return dob.getMonth() === today.getMonth();
  }

  /**
   * Get age from DOB
   */
  static getAge(dob: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * Format date to YYYY-MM-DD
   */
  static formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Get start of current month
   */
  static getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /**
   * Get end of current month
   */
  static getMonthEnd(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  /**
   * Get start of today
   */
  static getTodayStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  }

  /**
   * Get end of today
   */
  static getTodayEnd(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  }
}
