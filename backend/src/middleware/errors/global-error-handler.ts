/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * Catches ALL errors and returns human-friendly responses
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import {
  AppError,
  ValidationError,
  DatabaseError,
  NotFoundError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  FileUploadError,
  ExternalServiceError,
  TimeoutError,
  isAppError,
  ERROR_MESSAGES,
  SuspiciousInputError,
  UnprocessableEntityError,
  ServiceUnavailableError,
} from './custom-error-classes';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
  };
  requestId: string;
  suggestion?: string;
}

export const globalErrorHandler = (
  error: any,
  req: any,
  res: Response,
  next: NextFunction
) => {
  const requestId = req.id || res.locals?.requestId || 'unknown';
  const timestamp = new Date().toISOString();

  if (res.headersSent) {
    logger.error('[ERROR ALREADY SENT]', {
      requestId,
      message: error.message,
      path: req.path,
    });
    return next(error);
  }

  let appError: AppError;

  try {
    appError = classifyError(error, requestId);
  } catch (classifyErr: any) {
    logger.error('[ERROR CLASSIFICATION FAILED]', {
      requestId,
      originalError: error.message,
      classifyError: classifyErr.message,
    });

    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again later.',
        timestamp,
      },
      requestId,
    });
  }

  logError(appError, req, requestId, timestamp);
  const response = buildErrorResponse(appError, requestId, timestamp);

  if (appError.code === 'RATE_LIMIT_EXCEEDED') {
    res.set('Retry-After', '60');
  }

  res.status(appError.statusCode).json(response);
};

function classifyError(error: any, requestId: string): AppError {
  if (isAppError(error)) {
    error.requestId = requestId;
    return error;
  }

  // MongoDB errors
  if (error?.code === 11000 || error?.name === 'MongoServerError') {
    return new ConflictError(
      `A record with this ${Object.keys(error.keyPattern || {})[0] || 'field'} already exists. Please use a different value.`
    );
  }

  if (error?.name === 'ValidationError' || error?.name === 'BSONError') {
    return new ValidationError('Invalid data provided. Please check your input.', [
      { field: 'unknown', message: error.message },
    ]);
  }

  if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
    return new DatabaseError('Database connection lost. Please try again.', error, 503);
  }
  if (
    error?.name === 'TimeoutError' ||
    error?.code === 'ETIMEDOUT' ||
    error?.code === 'ESOCKETTIMEDOUT'
  ) {
    return new TimeoutError('Request');
  }

  // File upload errors
  if (
    error.message?.includes('file') ||
    error.message?.includes('upload')
  ) {
    return new FileUploadError(
      'File upload failed. Please try again or use a different file.'
    );
  }

  // Generic HTTP error codes
  if (typeof error.statusCode === 'number') {
    return new AppError(
      error.code || 'HTTP_ERROR',
      error.message || ERROR_MESSAGES[error.code] || 'An error occurred',
      error.statusCode,
      true
    );
  }

  logger.error('[UNCLASSIFIED ERROR]', {
    requestId,
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  return new AppError(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.',
    500,
    true
  );
}


function buildErrorResponse(
  error: AppError,
  requestId: string,
  timestamp: string
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: error.code,
      message: error.userMessage,
      timestamp,
    },
    requestId,
  };

  if (error instanceof ValidationError && error.details?.length > 0) {
    response.error.details = error.details;
  }

  response.suggestion = getSuggestion(error.code);

  return response;
}

function getSuggestion(errorCode: string): string | undefined {
  const suggestions: Record<string, string> = {
    VALIDATION_ERROR:
      'Review the error details above and correct any invalid fields.',
    AUTHENTICATION_REQUIRED: 'Log in to your account to continue.',
    ACCESS_DENIED: 'Contact support if you believe you should have access.',
    NOT_FOUND:
      'Check the URL and try again. The resource may have been deleted.',
    RATE_LIMIT_EXCEEDED: 'Wait a moment before trying again.',
    QUOTA_EXCEEDED: 'Upgrade your plan for more capacity.',
    DATABASE_ERROR:
      'Try again in a few moments. If the problem persists, contact support.',
    EXTERNAL_SERVICE_ERROR: 'Try again in a few moments.',
    REQUEST_TIMEOUT:
      'The request was too slow. Try again or contact support if it persists.',
    SERVICE_UNAVAILABLE:
      'Try again in a few moments. We are working to restore service.',
    CONFLICT: 'Use a different value or delete the existing record first.',
  };

  return suggestions[errorCode];
}

function logError(
  error: AppError,
  req: any,
  requestId: string,
  timestamp: string
) {
  const errorData = {
    requestId,
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    method: req.method,
    path: req.path,
    ip: req.ip,
    timestamp,
  };

  if (error.statusCode >= 500) {
    logger.error(`[${error.code}] ${error.message}`, {
      ...errorData,
      stack: error.stack,
      userAgent: req.get('user-agent'),
    });
  } else if (error.statusCode >= 400) {
    logger.warn(`[${error.code}] ${error.message}`, errorData);
  } else {
    logger.info(`[${error.code}] ${error.message}`, errorData);
  }
}

export const asyncHandler = (
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: any, res: Response, next: NextFunction) => {
    fn(req, res, next).catch((error: any) => {
      next(error);
    });
  };
};

export const syncHandler = (
  fn: (req: any, res: Response, next: NextFunction) => any
) => {
  return (req: any, res: Response, next: NextFunction) => {
    try {
      fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};
