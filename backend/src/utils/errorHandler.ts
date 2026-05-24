/**
 * Error Handler Utilities
 * Comprehensive error handling, logging, and recovery
 */

export enum ErrorCode {
  // Client Errors (4xx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',

  // Server Errors (5xx)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

export interface IApiError {
  code: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, any>;
  timestamp?: string;
  path?: string;
  requestId?: string;
}

/**
 * Custom Application Error Class
 */
export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, any>;
  timestamp: string;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 500,
    details?: Record<string, any>
  ) {
    super(message);
    this.code = code;
    this.message = message;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();

    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON(): IApiError {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Database Error Handler
 */
export class DatabaseError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(
      ErrorCode.DATABASE_ERROR,
      message || 'Database operation failed',
      500,
      details
    );
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Connection Error Handler
 */
export class ConnectionError extends AppError {
  retryable: boolean;
  retryCount: number;

  constructor(
    message: string,
    retryable: boolean = true,
    retryCount: number = 0,
    details?: Record<string, any>
  ) {
    super(
      ErrorCode.CONNECTION_ERROR,
      message || 'Connection failed',
      503,
      details
    );
    this.retryable = retryable;
    this.retryCount = retryCount;
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Validation Error Handler
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(
      ErrorCode.VALIDATION_ERROR,
      message || 'Validation failed',
      400,
      details
    );
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not Found Error Handler
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with ID '${id}' not found` : `${resource} not found`;
    super(ErrorCode.NOT_FOUND, message, 404);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized Error Handler
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(ErrorCode.UNAUTHORIZED, message, 401);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Forbidden Error Handler
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(ErrorCode.FORBIDDEN, message, 403);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

/**
 * Conflict Error Handler
 */
export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, any>) {
    super(
      ErrorCode.CONFLICT,
      message || 'Resource conflict',
      409,
      details
    );
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Error Logger
 */
export class ErrorLogger {
  static log(error: Error, context?: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    const errorData = {
      timestamp,
      message: error.message,
      stack: error.stack,
      context,
      type: error.constructor.name,
    };

    if (error instanceof AppError) {
      console.error('[AppError]', JSON.stringify(errorData, null, 2));
    } else {
      console.error('[Error]', JSON.stringify(errorData, null, 2));
    }
  }

  static logDatabase(query: string, error: Error, params?: any[]): void {
    console.error('[DatabaseError]', {
      timestamp: new Date().toISOString(),
      query,
      params,
      error: error.message,
      stack: error.stack,
    });
  }

  static logConnection(error: Error, retryable: boolean): void {
    console.error('[ConnectionError]', {
      timestamp: new Date().toISOString(),
      error: error.message,
      retryable,
      stack: error.stack,
    });
  }
}

/**
 * Error Response Formatter
 */
export class ErrorResponseFormatter {
  static format(error: AppError | Error, requestId?: string): IApiError {
    if (error instanceof AppError) {
      return {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        details: error.details,
        timestamp: error.timestamp,
        requestId,
      };
    }

    // Generic error
    return {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      statusCode: 500,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  static formatValidationErrors(
    errors: Record<string, string>
  ): IApiError {
    return {
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Validation failed',
      statusCode: 400,
      details: { errors },
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Safe Async Handler Wrapper
 * Catches errors in async route handlers
 */
export const asyncHandler = (
  fn: (req: any, res: any, next: any) => Promise<any>
) => {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      ErrorLogger.log(error, { path: req.path, method: req.method });
      next(error);
    });
  };
};

/**
 * Retry Logic for Connection Errors
 */
export class RetryHandler {
  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000,
    exponentialBackoff: boolean = true
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (error instanceof ConnectionError && !error.retryable) {
          throw error;
        }

        // Calculate delay
        const delay = exponentialBackoff
          ? delayMs * Math.pow(2, attempt)
          : delayMs;

        // Don't delay on last attempt
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        console.warn(
          `[RetryHandler] Attempt ${attempt + 1}/${maxRetries} failed:`,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    }

    throw lastError || new Error('Operation failed after all retries');
  }
}
