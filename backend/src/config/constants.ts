export const CONSTANTS = {
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '7d',

  // Business Logic
  OVERDUE_THRESHOLD_DAYS: 0,
  LAPSED_POLICY_THRESHOLD_DAYS: 30,
  PAGINATION_LIMIT: 10,
  
  // Rates
  // Disabled for development - allows continuous testing without rate limit blocks
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: process.env.NODE_ENV === 'development' ? 10000 : 100, // 10k for dev, 100 for prod

  // Errors
  ERRORS: {
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Forbidden',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Validation failed',
    INTERNAL_ERROR: 'Internal server error',
    INVALID_TOKEN: 'Invalid or expired token',
    DATABASE_ERROR: 'Database operation failed',
  },

  // Success Messages
  SUCCESS: {
    DASHBOARD_FETCHED: 'Dashboard overview fetched successfully',
  },

  // HTTP Status Codes
  STATUS_CODES: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_ERROR: 500,
  },
};
