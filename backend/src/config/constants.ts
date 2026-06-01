export const CONSTANTS = {
  // JWT — user / agent tokens
  JWT_SECRET: process.env.JWT_SECRET || '',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || '',
  ACCESS_TOKEN_EXPIRY: process.env.JWT_EXPIRES_IN || '15m',
  REFRESH_TOKEN_EXPIRY: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  // JWT — admin tokens (separate secrets: admin tokens cannot be used on user routes)
  JWT_ADMIN_SECRET: process.env.JWT_ADMIN_SECRET || '',
  JWT_ADMIN_REFRESH_SECRET: process.env.JWT_ADMIN_REFRESH_SECRET || '',
  JWT_ADMIN_EXPIRY: process.env.JWT_ADMIN_EXPIRES_IN || '15m',
  JWT_EXPIRY: process.env.JWT_EXPIRY || '15m',

  // Business Logic
  OVERDUE_THRESHOLD_DAYS: 0,
  LAPSED_POLICY_THRESHOLD_DAYS: 30,
  PAGINATION_LIMIT: 10,

  // Rates
  RATE_LIMIT_WINDOW: 15 * 60 * 1000,
  RATE_LIMIT_MAX_REQUESTS: process.env.NODE_ENV === 'development' ? 10000 : 100,

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
