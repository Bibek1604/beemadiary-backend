/**
 * Error Handling Middleware
 * Centralized error handling for all routes
 */

import { Request, Response, NextFunction } from 'express';
import {
  AppError,
  DatabaseError,
  ConnectionError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ErrorLogger,
  ErrorResponseFormatter,
  ErrorCode,
} from '../utils/errorHandler';
import { ResponseHandler } from '../utils/responseHandler';

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Main Error Handler Middleware
 * Should be registered LAST in middleware chain
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const requestId = generateRequestId();
  const path = req.path;
  const method = req.method;

  // Log error with context
  ErrorLogger.log(err, {
    requestId,
    path,
    method,
    body: req.body,
    query: req.query,
    user: req.user?.id || 'anonymous',
  });

  // Handle different error types
  if (err instanceof ValidationError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      timestamp: err.timestamp,
      requestId,
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      timestamp: err.timestamp,
      requestId,
    });
  }

  if (err instanceof UnauthorizedError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      timestamp: err.timestamp,
      requestId,
    });
  }

  if (err instanceof ForbiddenError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      timestamp: err.timestamp,
      requestId,
    });
  }

  if (err instanceof DatabaseError) {
    ErrorLogger.logDatabase(
      req.path,
      err,
      err.details?.query ? [err.details.query] : undefined
    );
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: 'Database operation failed',
      timestamp: err.timestamp,
      requestId,
    });
  }

  if (err instanceof ConnectionError) {
    ErrorLogger.logConnection(err, err.retryable);
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: {
        retryable: err.retryable,
        retryCount: err.retryCount,
      },
      timestamp: err.timestamp,
      requestId,
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
      timestamp: err.timestamp,
      requestId,
    });
  }

  // Handle Prisma-specific errors
  if (err.constructor.name === 'PrismaClientKnownRequestError') {
    const prismaError: any = err;

    if (prismaError.code === 'P2025') {
      // Record not found
      return res.status(404).json({
        success: false,
        code: 'NOT_FOUND',
        message: 'Resource not found',
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    if (prismaError.code === 'P2002') {
      // Unique constraint violation
      return res.status(409).json({
        success: false,
        code: 'CONFLICT',
        message: 'Resource with this value already exists',
        details: {
          field: prismaError.meta?.target,
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    if (prismaError.code === 'P2003') {
      // Foreign key constraint
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: 'Invalid reference to related resource',
        details: {
          relation: prismaError.meta?.relation_name,
        },
        timestamp: new Date().toISOString(),
        requestId,
      });
    }

    // Generic Prisma error
    return res.status(500).json({
      success: false,
      code: 'DATABASE_ERROR',
      message: 'Database operation failed',
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  if (err.constructor.name === 'PrismaClientValidationError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  if (err.constructor.name === 'PrismaClientInitializationError') {
    return res.status(503).json({
      success: false,
      code: 'SERVICE_UNAVAILABLE',
      message: 'Database service is unavailable',
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  // Handle JSON parsing errors
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'BAD_REQUEST',
      message: 'Invalid JSON in request body',
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  // Generic error handler
  console.error('[UnhandledError]', {
    timestamp: new Date().toISOString(),
    requestId,
    path,
    method,
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
    requestId,
  });
};

/**
 * 404 Not Found Handler
 * Should be registered BEFORE error handler
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const error = new NotFoundError('Endpoint', req.path);
  res.status(404).json({
    success: false,
    code: error.code,
    message: `Endpoint ${req.method} ${req.path} not found`,
    timestamp: error.timestamp,
  });
};

/**
 * Uncaught Exception Handler
 * Handles synchronous errors
 */
process.on('uncaughtException', (error: Error) => {
  console.error('[UncaughtException]', {
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

/**
 * Unhandled Promise Rejection Handler
 */
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[UnhandledRejection]', {
    timestamp: new Date().toISOString(),
    reason:
      reason instanceof Error ? reason.message : JSON.stringify(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
