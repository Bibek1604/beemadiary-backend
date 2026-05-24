/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * Catches ALL errors and returns human-friendly responses
 */

import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
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

  // Prisma errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return handlePrismaError(error, requestId);
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new ValidationError('Invalid data provided. Please check your input.', [
      { field: 'unknown', message: error.message },
    ]);
  }

  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return new DatabaseError('Database connection lost. Please try again.', error, 503);
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    return new ValidationError(
      'Please check your input and try again',
      error.details || [{ field: 'unknown', message: error.message }]
    );
  }

  // JSON parsing errors
  if (error instanceof SyntaxError && 'body' in error) {
    return new ValidationError('Invalid JSON format. Please check your request body.', [
      { field: 'body', message: 'Invalid JSON' },
    ]);
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return new ConflictError(
      `A ${field} with this value already exists. Please use a different value.`
    );
  }

  // Network errors
  if (error.code === 'ECONNREFUSED') {
    return new ExternalServiceError(
      'Database',
      'Connection failed. Please try again later.',
      503
    );
  }

  if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
    return new ExternalServiceError(
      'External Service',
      'Unable to connect to external service. Please try again.',
      503
    );
  }

  if (error.name === 'AbortError') {
    return new TimeoutError('Request', 'The request took too long. Please try again.');
  }

  // File system errors
  if (error.code === 'ENOENT') {
    return new NotFoundError('File');
  }

  if (error.code === 'EACCES') {
    return new ServiceUnavailableError('Cannot access file. Please try again later.');
  }

  // Cast errors
  if (error.name === 'CastError') {
    return new ValidationError('Invalid value provided. Please check your input.');
  }

  // JWT/Auth errors
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Your session is invalid. Please log in again.');
  }

  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Your session has expired. Please log in again.');
  }

  // Rate limiting
  if (
    error.name === 'TooManyRequestsError' ||
    error.message?.includes('rate')
  ) {
    return new Error('RATE_LIMIT_EXCEEDED');
  }

  // Timeout
  if (
    error.message?.includes('timeout') ||
    error.message?.includes('TIMEOUT')
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

function handlePrismaError(
  error: Prisma.PrismaClientKnownRequestError,
  requestId: string
): AppError {
  const code = error.code;
  const target = (error.meta?.target as string[]) || [];
  const field = target[0] || 'field';

  switch (code) {
    case 'P2025':
      return new NotFoundError(
        'Record',
        'The record you are looking for does not exist or has been deleted.'
      );

    case 'P2002':
      return new ConflictError(
        `A record with this ${field} already exists. Please use a different value.`
      );

    case 'P2003':
      return new UnprocessableEntityError(
        'Cannot complete this operation because it references data that does not exist.',
        { [field]: 'Invalid reference' }
      );

    case 'P2014':
      return new UnprocessableEntityError(
        'Cannot delete this record because other records depend on it.'
      );

    case 'P2011':
      return new ValidationError(`${field} is required. Please provide this information.`, [
        { field, message: 'This field is required' },
      ]);

    case 'P2012':
      return new DatabaseError(
        'Database schema error. Please contact support.',
        error,
        500
      );

    case 'P2009':
      return new DatabaseError(
        'Database authentication failed. Please try again later.',
        error,
        503
      );

    case 'P1000':
    case 'P1001':
    case 'P1002':
      return new DatabaseError(
        'Cannot connect to database. Please try again later.',
        error,
        503
      );

    case 'P2034':
      return new DatabaseError(
        'Transaction failed. Please try your request again.',
        error,
        503
      );

    default:
      logger.error('[UNHANDLED PRISMA ERROR]', {
        requestId,
        code,
        message: error.message,
        meta: error.meta,
      });

      return new DatabaseError(
        'Unable to process your request. Please try again later.',
        error,
        503
      );
  }
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
