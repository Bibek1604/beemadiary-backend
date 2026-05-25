/**
 * PRODUCTION-HARDENED ERROR HANDLER
 * Addresses all 20 critical production issues
 *
 * Features:
 * - Handles unhandled promise rejections
 * - Resilient to error handler failures
 * - Comprehensive error classification
 * - Safe response serialization
 * - Sensitive data filtering
 * - Performance monitoring
 * - Graceful degradation
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../../utils/logger';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { MongoServerError, ValidationError as MongooseValidationError } from 'mongoose';
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
  RateLimitError,
} from './custom-error-classes';

// ============================================================
// CONFIGURATION
// ============================================================
  

const CONFIG = {
  MAX_ERROR_HANDLER_TIME: 500, // 500ms
  MAX_STACK_TRACE_SIZE: 1000, // 1KB
  MAX_MESSAGE_SIZE: 500, // 500 chars
  MAX_ERROR_DETAILS: 10, // 10 field errors max
  MAX_FIELD_NAME_SIZE: 100,
  MAX_FIELD_MESSAGE_SIZE: 200,
  REQUEST_ID_FALLBACK_LENGTH: 16, // UUID-like fallback
  FALLBACK_LOG_PATH: process.env.FALLBACK_LOG_PATH || '/var/log/errors-fallback.log',
};

// ============================================================
// ERROR RESPONSE INTERFACE
// ============================================================

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
    timestamp: string;
  };
  requestId: string;
  suggestion?: string;
}

// ============================================================
// SENSITIVE DATA FILTERING
// ============================================================

const SENSITIVE_PATTERNS = [
  /password['\"]?\s*[:=]\s*['\"]?([^'\"]+)['\"]?/gi,
  /api[_-]?key['\"]?\s*[:=]\s*['\"]?([^'\"]+)['\"]?/gi,
  /token['\"]?\s*[:=]\s*['\"]?([^\s]+)/gi,
  /authorization['\"]?\s*[:=]\s*Bearer\s+([^\s]+)/gi,
  /credit[_-]?card['\"]?\s*[:=]\s*['\"]?(\d{4}[^'\"]*)['\"]?/gi,
  /ssn['\"]?\s*[:=]\s*['\"]?(\d{3}-\d{2}-\d{4})['\"]?/gi,
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card
];

function filterSensitiveData(text: string): string {
  if (!text || typeof text !== 'string') return text;

  let filtered = text;

  for (const pattern of SENSITIVE_PATTERNS) {
    filtered = filtered.replace(pattern, (match, value) => {
      if (!value || value.length <= 2) return '***';
      return (
        value[0] +
        '*'.repeat(Math.max(3, value.length - 2)) +
        value[value.length - 1]
      );
    });
  }

  return filtered;
}

// ============================================================
// ROBUST LOGGER FALLBACK
// ============================================================

class RobustLogger {
  private fallbackStream: fs.WriteStream | null = null;

  constructor(private logger: any) {
    try {
      // Create fallback log directory if needed
      const dir = path.dirname(CONFIG.FALLBACK_LOG_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.fallbackStream = fs.createWriteStream(CONFIG.FALLBACK_LOG_PATH, {
        flags: 'a',
      });
    } catch (err) {
      console.error('[WARNING] Could not create fallback log:', err);
    }
  }

  error(message: string, data: any) {
    try {
      this.logger.error(message, data);
    } catch (err) {
      this.fallbackError(message, data);
    }
  }

  warn(message: string, data: any) {
    try {
      this.logger.warn(message, data);
    } catch (err) {
      this.fallbackError(message, data);
    }
  }

  info(message: string, data: any) {
    try {
      this.logger.info(message, data);
    } catch (err) {
      // Silently fail on info
    }
  }

  private fallbackError(message: string, data: any) {
    if (!this.fallbackStream) return;

    try {
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${message} ${JSON.stringify(data)}\n`;
      this.fallbackStream.write(logEntry);
    } catch (err) {
      console.error('[CRITICAL] Fallback logging failed:', err);
    }
  }
}

const robustLogger = new RobustLogger(logger);

// ============================================================
// MAIN ERROR HANDLER
// ============================================================

export const globalErrorHandlerResilient = (
  error: any,
  req: any,
  res: Response,
  next: NextFunction
) => {
  const requestId = generateRequestId(req, res);
  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  // Check if response already sent
  if (res.headersSent || !res.writable) {
    robustLogger.error('[RESPONSE ALREADY SENT]', {
      requestId,
      headersSent: res.headersSent,
      writable: res.writable,
      message: error?.message || 'Unknown',
    });
    return;
  }

  // Wrap in timeout
  const timeoutHandle = setTimeout(() => {
    robustLogger.error('[ERROR HANDLER TIMEOUT]', {
      requestId,
      duration: Date.now() - startTime,
    });

    if (!res.headersSent && res.writable) {
      res.status(503).json(
        buildSafeErrorResponse(
          'TIMEOUT',
          'Request processing timeout',
          requestId,
          timestamp
        )
      );
    }
  }, CONFIG.MAX_ERROR_HANDLER_TIME);

  try {
    handleErrorSafely(error, req, res, requestId, timestamp, startTime);
  } finally {
    clearTimeout(timeoutHandle);
  }
};

function handleErrorSafely(
  error: any,
      function handleMongoError(error: any, requestId: string): AppError {
        if (error?.code === 11000 || error?.name === 'MongoServerError') {
          return new ConflictError(
            `A record with this ${Object.keys(error.keyPattern || {})[0] || 'field'} already exists. Please use a different value.`
          );
        }

        if (error?.name === 'ValidationError' || error?.name === 'BSONError') {
          return new ValidationError(
            'Invalid data provided. Please check your input.',
            [{ field: 'unknown', message: 'Validation failed' }]
          );
        }

        if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
          return new DatabaseError(
            'Database connection lost. Please try again.',
            error,
            503
          );
        }
  
        return new DatabaseError('A database error occurred. Please try again later.', error, 500);
      }
  req: any,
  res: Response,
  requestId: string,
  timestamp: string,
  startTime: number
) {
  let appError: AppError;

  try {
    appError = classifyErrorComprehensive(error, requestId);
  } catch (classifyErr: any) {
    robustLogger.error('[ERROR CLASSIFICATION FAILED]', {
      requestId,
      originalError: error?.message || 'Unknown',
      classifyError: classifyErr?.message || 'Unknown',
    });

    return sendSafeErrorResponse(
      res,
      'INTERNAL_SERVER_ERROR',
      'An unexpected error occurred. Please try again later.',
      500,
      requestId,
      timestamp
    );
  }

  // Log error
  try {
    logErrorSafely(appError, req, requestId, timestamp);
  } catch (logErr) {
    robustLogger.warn('[ERROR LOGGING FAILED]', {
      requestId,
      error: logErr,
    });
  }

  // Send response
  try {
    if (!res.headersSent && res.writable) {
      const response = buildSafeErrorResponse(
        appError.code,
        appError.userMessage,
        requestId,
        timestamp,
        appError instanceof ValidationError ? appError.details : undefined
      );

      res.status(appError.statusCode).json(response);
    }
  } catch (sendErr: any) {
    robustLogger.error('[ERROR SENDING RESPONSE]', {
      requestId,
      error: sendErr?.message,
    });

    if (!res.headersSent && res.writable) {
      try {
        res.status(500).end();
      } catch (err) {
        // Nothing we can do
      }
    }
  }
}

// ============================================================
// COMPREHENSIVE ERROR CLASSIFICATION
// ============================================================

function classifyErrorComprehensive(
  error: any,
  requestId: string
): AppError {
  if (!error) {
    return new AppError(
      'UNKNOWN_ERROR',
      'An unknown error occurred',
      500,
      true
    );
  }

  // Already classified
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
    return new ValidationError(
      'Invalid data provided. Please check your input.',
      [{ field: 'unknown', message: 'Validation failed' }]
    );
  }

  if (error?.name === 'MongoNetworkError' || error?.name === 'MongoServerSelectionError') {
    return new DatabaseError(
      'Database connection lost. Please try again.',
      error,
      503
    );
  }
function handlePrismaError(_error: any, _requestId: string): AppError {
  return new DatabaseError('Unable to process your request. Please try again later.', _error, 503);
}
  if (
    error.message?.toLowerCase().includes('timeout') ||
    error.message?.toLowerCase().includes('timed out')
  ) {
    return new TimeoutError('Request', error.message);
  }

  // File upload errors
  if (
    error.message?.toLowerCase().includes('file') ||
    error.message?.toLowerCase().includes('upload')
  ) {
    return new FileUploadError(
      'File upload failed. Please try again with a different file.'
    );
  }

  // HTTP errors with status codes
  if (typeof error.statusCode === 'number') {
    return new AppError(
      error.code || 'HTTP_ERROR',
      filterSensitiveData(error.message) ||
        ERROR_MESSAGES[error.code] ||
        'An error occurred',
      error.statusCode,
      true
    );
  }

  // Fallback
  robustLogger.error('[UNCLASSIFIED ERROR]', {
    requestId,
    name: error.name,
    message: error.message?.substring(0, 200),
    code: error.code,
  });

  return new AppError(
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred. Please try again later.',
    500,
    true
  );
}

// ============================================================
// SPECIFIC ERROR HANDLERS
// ============================================================

function handlePrismaError(_error: any, _requestId: string): AppError {
  return new DatabaseError('Unable to process your request. Please try again later.', _error, 503);
}

function handleMulterError(error: any): AppError {
  const code = (error as any).code;

  switch (code) {
    case 'FILE_TOO_LARGE':
      return new FileUploadError('File size exceeds the 10MB limit');
    case 'LIMIT_FILE_COUNT':
      return new FileUploadError('Too many files. Maximum 5 files allowed');
    case 'LIMIT_PART_COUNT':
      return new FileUploadError('Too many form fields');
    case 'LIMIT_FIELD_SIZE':
      return new FileUploadError('Form field value too large');
    default:
      return new FileUploadError(`Upload error: ${error.message}`);
  }
}

// ============================================================
// SAFE ERROR RESPONSE BUILDING
// ============================================================

function buildSafeErrorResponse(
  code: string,
  message: string,
  requestId: string,
  timestamp: string,
  details?: Array<{ field: string; message: string }>
): ErrorResponse {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: String(code).substring(0, 50),
      message: filterSensitiveData(String(message)).substring(0, CONFIG.MAX_MESSAGE_SIZE),
      timestamp,
    },
    requestId: String(requestId).substring(0, 100),
  };

  // Add details if provided
  if (Array.isArray(details) && details.length > 0) {
    response.error.details = details
      .slice(0, CONFIG.MAX_ERROR_DETAILS)
      .map(d => ({
        field: String(d.field).substring(0, CONFIG.MAX_FIELD_NAME_SIZE),
        message: String(d.message).substring(0, CONFIG.MAX_FIELD_MESSAGE_SIZE),
      }));
  }

  // Verify it's serializable
  try {
    JSON.stringify(response);
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred',
        timestamp,
      },
      requestId: String(requestId).substring(0, 100),
    };
  }

  return response;
}

function sendSafeErrorResponse(
  res: Response,
  code: string,
  message: string,
  statusCode: number,
  requestId: string,
  timestamp: string
) {
  try {
    const response = buildSafeErrorResponse(code, message, requestId, timestamp);
    res.status(statusCode).json(response);
  } catch (err) {
    try {
      res.status(statusCode).json({
        success: false,
        error: { code: 'ERROR', message: 'Error occurred', timestamp },
        requestId,
      });
    } catch {
      res.status(statusCode).end();
    }
  }
}

// ============================================================
// SAFE LOGGING
// ============================================================

function logErrorSafely(
  error: AppError,
  req: any,
  requestId: string,
  timestamp: string
) {
  // Limit stack trace
  let stack = error.stack || '';
  if (stack.length > CONFIG.MAX_STACK_TRACE_SIZE) {
    stack = stack.substring(0, CONFIG.MAX_STACK_TRACE_SIZE) + '... [truncated]';
  }

  const errorData = {
    requestId,
    code: error.code,
    message: filterSensitiveData(error.message.substring(0, 500)),
    statusCode: error.statusCode,
    method: req.method,
    path: (req.path || '').substring(0, 200),
    ip: req.ip,
    timestamp,
  };

  if (error.statusCode >= 500) {
    robustLogger.error(`[${error.code}] ${error.message}`, {
      ...errorData,
      stack,
    });
  } else if (error.statusCode >= 400) {
    robustLogger.warn(`[${error.code}] ${error.message}`, errorData);
  } else {
    robustLogger.info(`[${error.code}] ${error.message}`, errorData);
  }
}

// ============================================================
// REQUEST ID GENERATION
// ============================================================

function generateRequestId(req: any, res: Response): string {
  // Try to get from request
  const existing =
    req.id ||
    req.headers['x-request-id'] ||
    res.locals?.requestId;

  if (typeof existing === 'string' && existing.length > 0) {
    return existing;
  }

  // Generate new UUID
  const newId = crypto.randomUUID();

  // Store for later access
  req.id = newId;
  if (res.locals) {
    res.locals.requestId = newId;
  }

  try {
    res.setHeader('X-Request-ID', newId);
  } catch (err) {
    // Headers already sent, ignore
  }

  return newId;
}

// ============================================================
// ASYNC HANDLER WRAPPER
// ============================================================

export const asyncHandlerResilient = (
  fn: (req: any, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: any, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch((error: any) => {
      next(error);
    });
  };
};

// ============================================================
// PROCESS-LEVEL ERROR HANDLERS
// ============================================================

export const setupProcessErrorHandlers = () => {
  // Unhandled promise rejections
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    const requestId = 'process-' + crypto.randomUUID().substring(0, 8);

    robustLogger.error('[UNHANDLED REJECTION]', {
      requestId,
      reason: reason?.message || String(reason),
      stack: reason?.stack,
      promiseState: promise ? 'pending' : 'unknown',
    });
  });

  // Uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    robustLogger.error('[UNCAUGHT EXCEPTION]', {
      message: error.message,
      stack: error.stack,
    });

    // Exit gracefully
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
};

export default globalErrorHandlerResilient;
