/**
 * CUSTOM ERROR CLASSES
 * Enterprise-grade error handling with human-friendly messages
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly userMessage: string;
  public readonly isOperational: boolean;
  public readonly timestamp: Date;
  public readonly requestId?: string;
  public readonly details?: any;

  constructor(
    code: string,
    userMessage: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    details?: any
  ) {
    super(userMessage);
    this.code = code;
    this.statusCode = statusCode;
    this.userMessage = userMessage;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    this.details = details;

    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.userMessage,
        timestamp: this.timestamp.toISOString(),
        ...(this.details && { details: this.details }),
      },
      requestId: this.requestId,
    };
  }
}

export class ValidationError extends AppError {
  public readonly details: Array<{ field: string; message: string }>;

  constructor(
    message: string = 'Please check your input and try again',
    details: Array<{ field: string; message: string }> = []
  ) {
    super('VALIDATION_ERROR', message, 400, true);
    this.details = details;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.userMessage,
        details: this.details,
        timestamp: this.timestamp.toISOString(),
      },
      requestId: this.requestId,
    };
  }
}

export class FileUploadError extends AppError {
  constructor(
    message: string = 'File upload failed. Please try again.',
    code: string = 'FILE_UPLOAD_ERROR'
  ) {
    super(code, message, 400, true);
    Object.setPrototypeOf(this, FileUploadError.prototype);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Please log in to continue') {
    super('AUTHENTICATION_REQUIRED', message, 401, true);
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(
    message: string = 'You do not have permission to access this resource'
  ) {
    super('ACCESS_DENIED', message, 403, true);
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource', message?: string) {
    const defaultMessage = `${resource} not found or has been deleted`;
    super('NOT_FOUND', message || defaultMessage, 404, true);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string = 'This resource already exists. Please use a different value.'
  ) {
    super('CONFLICT', message, 409, true);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(
    message: string = 'Too many requests. Please wait a moment and try again.',
    retryAfter: number = 60
  ) {
    super('RATE_LIMIT_EXCEEDED', message, 429, true);
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.userMessage,
        retryAfter: this.retryAfter,
        timestamp: this.timestamp.toISOString(),
      },
      requestId: this.requestId,
    };
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, code: string = 'OPERATION_NOT_ALLOWED') {
    super(code, message, 422, true);
    Object.setPrototypeOf(this, BusinessLogicError.prototype);
  }
}

export class DatabaseError extends AppError {
  public readonly originalError?: Error;

  constructor(
    message: string = 'Unable to process your request. Please try again later.',
    originalError?: Error,
    statusCode: number = 503
  ) {
    super('DATABASE_ERROR', message, statusCode, true);
    this.originalError = originalError;
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ExternalServiceError extends AppError {
  public readonly serviceName: string;

  constructor(
    serviceName: string = 'External Service',
    message: string = 'An external service is temporarily unavailable. Please try again later.',
    statusCode: number = 503
  ) {
    super('EXTERNAL_SERVICE_ERROR', message, statusCode, true);
    this.serviceName = serviceName;
    Object.setPrototypeOf(this, ExternalServiceError.prototype);
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string = 'Operation', message?: string) {
    const defaultMessage = `${operation} is taking too long. Please try again in a moment.`;
    super('REQUEST_TIMEOUT', message || defaultMessage, 503, true);
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class SuspiciousInputError extends AppError {
  constructor(message: string = 'Invalid input detected. Please review your request.') {
    super('INVALID_INPUT', message, 400, true);
    Object.setPrototypeOf(this, SuspiciousInputError.prototype);
  }
}

export class UnprocessableEntityError extends AppError {
  public readonly errorDetails?: Record<string, string>;

  constructor(message: string, details?: Record<string, string>) {
    super('UNPROCESSABLE_ENTITY', message, 422, true);
    this.errorDetails = details;
    Object.setPrototypeOf(this, UnprocessableEntityError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.userMessage,
        ...(this.errorDetails && { details: this.errorDetails }),
        timestamp: this.timestamp.toISOString(),
      },
      requestId: this.requestId,
    };
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable. Please try again later.'
  ) {
    super('SERVICE_UNAVAILABLE', message, 503, true);
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

export class FeatureDisabledError extends AppError {
  constructor(featureName: string, message?: string) {
    const defaultMessage = `${featureName} is temporarily unavailable. We'll be back online shortly.`;
    super('FEATURE_DISABLED', message || defaultMessage, 503, true);
    Object.setPrototypeOf(this, FeatureDisabledError.prototype);
  }
}

export class QuotaExceededError extends AppError {
  public readonly limit: number;
  public readonly resetAt?: Date;

  constructor(
    quotaName: string,
    limit: number,
    message?: string,
    resetAt?: Date
  ) {
    const defaultMessage = `You've reached your ${quotaName} limit. Please try again later.`;
    super('QUOTA_EXCEEDED', message || defaultMessage, 429, true);
    this.limit = limit;
    this.resetAt = resetAt;
    Object.setPrototypeOf(this, QuotaExceededError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.userMessage,
        limit: this.limit,
        resetAt: this.resetAt?.toISOString(),
        timestamp: this.timestamp.toISOString(),
      },
      requestId: this.requestId,
    };
  }
}

export function isAppError(error: any): error is AppError {
  return error instanceof AppError && error.isOperational === true;
}

export const ERROR_STATUS_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  INVALID_INPUT: 400,
  FILE_UPLOAD_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT_EXCEEDED: 429,
  QUOTA_EXCEEDED: 429,
  UNPROCESSABLE_ENTITY: 422,
  OPERATION_NOT_ALLOWED: 422,
  DATABASE_ERROR: 503,
  EXTERNAL_SERVICE_ERROR: 503,
  REQUEST_TIMEOUT: 503,
  SERVICE_UNAVAILABLE: 503,
  FEATURE_DISABLED: 503,
};

export const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Please check your input and try again',
  INVALID_INPUT: 'The information you provided is invalid',
  FILE_UPLOAD_ERROR: 'File upload failed. Please try again.',
  AUTHENTICATION_REQUIRED: 'Please log in to continue',
  ACCESS_DENIED: 'You do not have permission to access this',
  NOT_FOUND: 'The requested resource was not found',
  CONFLICT: 'This resource already exists',
  RATE_LIMIT_EXCEEDED: 'Too many requests. Please wait and try again.',
  QUOTA_EXCEEDED: 'You have exceeded your usage limit',
  UNPROCESSABLE_ENTITY: 'Unable to process your request',
  OPERATION_NOT_ALLOWED: 'This operation is not allowed',
  DATABASE_ERROR: 'Unable to process your request. Please try again later.',
  EXTERNAL_SERVICE_ERROR: 'An external service is temporarily unavailable',
  REQUEST_TIMEOUT: 'The request took too long. Please try again.',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable. Please try again later.',
  FEATURE_DISABLED: 'This feature is temporarily unavailable',
};
