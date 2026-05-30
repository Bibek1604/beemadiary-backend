import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { CONSTANTS } from '../config/constants';

/**
 * Global Exception Handler
 * Comprehensive error handling with null prevention
 */

export interface ErrorResponse {
  status: boolean;
  message: string;
  code: number;
  error?: {
    type: string;
    details?: any;
  };
  timestamp: string;
  requestId?: string;
  path?: string;
}

/**
 * Sanitize error message to prevent information leakage
 */
const sanitizeErrorMessage = (error: any, isDevelopment: boolean): string => {
  if (isDevelopment) {
    return error?.message || 'An unexpected error occurred';
  }

  // Production: generic messages
  if (error?.code === 11000 || error?.name === 'MongoServerError') {
    return 'A unique constraint was violated';
  }

  if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
    return 'A database connection error occurred';
  }

  if (error instanceof SyntaxError) {
    return 'Invalid request format';
  }

  return 'An unexpected error occurred';
};

/**
 * Map Prisma errors to HTTP status codes
 */
/**
 * Extract error details from different error types
 */
const extractErrorDetails = (
  error: any
): {
  type: string;
  message: string;
  statusCode: number;
  details?: any;
} => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // MongoDB errors
  if (error?.code === 11000 || error?.name === 'MongoServerError') {
    return {
      type: 'MongoError',
      message: sanitizeErrorMessage(error, isDevelopment),
      statusCode: CONSTANTS.STATUS_CODES.CONFLICT,
      details: isDevelopment ? { code: error.code, keyPattern: error.keyPattern, keyValue: error.keyValue } : undefined,
    };
  }

  if (error?.name === 'ValidationError' || error?.name === 'BSONError') {
    return {
      type: 'MongoValidationError',
      message: 'Data validation failed',
      statusCode: CONSTANTS.STATUS_CODES.BAD_REQUEST,
      details: isDevelopment ? error.message : undefined,
    };
  }

  if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
    return {
      type: 'MongoDatabaseError',
      message: 'Database connection failed',
      statusCode: CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
      details: isDevelopment ? error.message : undefined,
    };
  }

  if (error?.name === 'MongoTopologyClosedError') {
    return {
      type: 'MongoCriticalError',
      message: 'Database critical error',
      statusCode: CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
    };
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    const validationErrors = error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code,
    }));

    return {
      type: 'ValidationError',
      message: 'Validation failed',
      statusCode: CONSTANTS.STATUS_CODES.BAD_REQUEST,
      details: validationErrors,
    };
  }

  // JSON parsing errors
  if (error instanceof SyntaxError && 'body' in error) {
    return {
      type: 'JSONParseError',
      message: 'Invalid JSON in request body',
      statusCode: CONSTANTS.STATUS_CODES.BAD_REQUEST,
      details: isDevelopment ? error.message : undefined,
    };
  }

  // Custom application errors
  if (error.isCustom === true) {
    return {
      type: error.type || 'ApplicationError',
      message: error.message || 'An application error occurred',
      statusCode: error.statusCode || CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
      details: isDevelopment ? error.details : undefined,
    };
  }

  // Generic errors
  if (error instanceof Error) {
    return {
      type: 'Error',
      message: sanitizeErrorMessage(error, isDevelopment),
      statusCode: CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
      details: isDevelopment
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };
  }

  // Unknown errors
  return {
    type: 'UnknownError',
    message: 'An unexpected error occurred',
    statusCode: CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
    details: isDevelopment ? { error: String(error) } : undefined,
  };
};

/**
 * Prevent null values in response
 */
const ensureNoNullValues = (data: any): any => {
  if (data === null || data === undefined) {
    return {};
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => ensureNoNullValues(item)).filter(item => item !== null && item !== undefined);
  }

  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      result[key] = ''; // Use empty string instead of null
    } else if (typeof value === 'object') {
      result[key] = ensureNoNullValues(value);
    } else {
      result[key] = value;
    }
  }

  return result;
};

/**
 * Global Exception Handler Middleware
 */
export const globalExceptionHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errorDetails = extractErrorDetails(error);
  const requestId = (req as any).id || 'unknown';
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Log the error
  console.error('[Global Exception Handler]', {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: errorDetails.statusCode,
    errorType: errorDetails.type,
    message: errorDetails.message,
    ...(isDevelopment && { details: errorDetails.details }),
  });

  // Prevent response if already sent
  if (res.headersSent) {
    return;
  }

  // Build error response with null prevention
  const errorResponse: ErrorResponse = {
    status: false,
    message: errorDetails.message || 'An unexpected error occurred',
    code: errorDetails.statusCode,
    timestamp: new Date().toISOString(),
    requestId,
    path: req.path,
  };

  // Add error details only in development
  if (isDevelopment && errorDetails.details) {
    errorResponse.error = {
      type: errorDetails.type,
      details: errorDetails.details,
    };
  } else {
    errorResponse.error = {
      type: errorDetails.type,
    };
  }

  // Ensure no null values in response
  const safeResponse = ensureNoNullValues(errorResponse);

  // Send response
  res.status(errorDetails.statusCode).json(safeResponse);
};

/**
 * Custom application error class
 */
export class ApplicationError extends Error {
  isCustom = true;
  type: string;
  statusCode: number;
  details?: any;

  constructor(
    message: string,
    statusCode: number = CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
    type: string = 'ApplicationError',
    details?: any
  ) {
    super(message);
    this.name = 'ApplicationError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Validation error class
 */
export class ValidationError extends ApplicationError {
  constructor(message: string, details?: any) {
    super(
      message,
      CONSTANTS.STATUS_CODES.BAD_REQUEST,
      'ValidationError',
      details
    );
    this.name = 'ValidationError';
  }
}

/**
 * Not found error class
 */
export class NotFoundError extends ApplicationError {
  constructor(message: string = 'Resource not found') {
    super(message, CONSTANTS.STATUS_CODES.NOT_FOUND, 'NotFoundError');
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized error class
 */
export class UnauthorizedError extends ApplicationError {
  constructor(message: string = 'Unauthorized') {
    super(message, CONSTANTS.STATUS_CODES.UNAUTHORIZED, 'UnauthorizedError');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error class
 */
export class ForbiddenError extends ApplicationError {
  constructor(message: string = 'Forbidden') {
    super(message, CONSTANTS.STATUS_CODES.FORBIDDEN, 'ForbiddenError');
    this.name = 'ForbiddenError';
  }
}

/**
 * Conflict error class
 */
export class ConflictError extends ApplicationError {
  constructor(message: string = 'Conflict') {
    super(message, CONSTANTS.STATUS_CODES.CONFLICT, 'ConflictError');
    this.name = 'ConflictError';
  }
}

/**
 * Database error class
 */
export class DatabaseError extends ApplicationError {
  constructor(message: string = 'Database error', details?: any) {
    super(
      message,
      CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
      'DatabaseError',
      details
    );
    this.name = 'DatabaseError';
  }
}

export default {
  globalExceptionHandler,
  ApplicationError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
  ensureNoNullValues,
  extractErrorDetails,
};
