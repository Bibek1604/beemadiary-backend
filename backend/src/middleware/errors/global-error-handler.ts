/**
 * GLOBAL ERROR HANDLER MIDDLEWARE
 * Catches ALL errors and returns human-friendly responses
 */

import { Request, Response, NextFunction } from 'express';
const _loggerModule = require('../../utils/logger');
const logger = _loggerModule.default || _loggerModule;
import {
  AppError,
  ValidationError,
  DatabaseError,
  ConflictError,
  AuthenticationError,
  AuthorizationError,
  FileUploadError,
  NotFoundError,
  TimeoutError,
  isAppError,
  ERROR_MESSAGES,
} from './custom-error-classes';
const {
  createErrorResponse,
  toSafeMessage,
} = require('../../utils/responseFormatter');

interface ErrorResponse {
  success: false;
  status: false;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
  code: number | string;
  requestId: string;
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

    return res.status(500).json(
      createErrorResponse('Something went wrong. Please try again later.', [], 500, {
        requestId,
      })
    );
  }

  logError(appError, req, requestId, timestamp);
  const response = buildErrorResponse(appError, requestId);

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

  const message = String(error?.message || '');

  if (/invalid credentials|token has expired|invalid token|invalid refresh token/i.test(message)) {
    return new AuthenticationError('Invalid credentials. Please try again.');
  }

  if (/user account is inactive|account is inactive|deactivated/i.test(message)) {
    return new AuthorizationError('User account is inactive.');
  }

  if (/user already exists/i.test(message)) {
    return new ConflictError('User already exists.');
  }

  if (/user not found/i.test(message)) {
    return new NotFoundError('User');
  }

  if (/agent information not found/i.test(message)) {
    return new NotFoundError('Agent information');
  }

  if (/current password is incorrect/i.test(message)) {
    return new ValidationError('Current password is incorrect.');
  }

  if (/password is too weak|new password is too weak/i.test(message)) {
    return new ValidationError(message || 'The password does not meet the required strength.');
  }

  // MongoDB errors
  if (error?.code === 11000 || error?.name === 'MongoServerError') {
    return new ConflictError(
      'Resource already exists.'
    );
  }

  if (error?.name === 'ValidationError' || error?.name === 'BSONError' || error?.name === 'CastError') {
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

  if (/cannot read property|cannot read properties|cannot destructure|undefined/i.test(error?.message || '')) {
    return new AppError(
      'INTERNAL_SERVER_ERROR',
      'Requested information could not be processed.',
      500,
      true
    );
  }

  if (/invalid.*id|objectid/i.test(error?.message || '')) {
    return new ValidationError('Invalid record identifier provided.', [
      { field: 'id', message: 'Invalid record identifier provided.' },
    ]);
  }

  // Generic HTTP error codes
  if (typeof error.statusCode === 'number') {
    return new AppError(
      error.code || 'HTTP_ERROR',
      toSafeMessage(error.message || ERROR_MESSAGES[error.code] || 'An error occurred', error.statusCode),
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
  requestId: string
): ErrorResponse {
  const response = createErrorResponse(
    error.userMessage,
    error instanceof ValidationError && error.details?.length > 0 ? error.details : [],
    error.statusCode,
    { requestId }
  );

  return response as ErrorResponse;
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
