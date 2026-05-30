import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_TOKEN_COOKIE = 'csrf-token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate CSRF token
 */
export const generateCSRFToken = (): string => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
};

/**
 * CSRF protection middleware
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for health check
  if (req.path === '/health') {
    return next();
  }

  // Get CSRF token from header
  const tokenFromHeader = req.get(CSRF_TOKEN_HEADER);

  // Get CSRF token from cookie
  const tokenFromCookie = req.cookies?.[CSRF_TOKEN_COOKIE];

  // Verify token exists in both places
  if (!tokenFromHeader || !tokenFromCookie) {
    return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
      ResponseHandler.error(
        'Missing CSRF token',
        CONSTANTS.STATUS_CODES.BAD_REQUEST,
        [{ message: 'CSRF token required in header and cookie' }]
      )
    );
  }

  // Verify tokens match
  if (tokenFromHeader !== tokenFromCookie) {
    return res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
      ResponseHandler.forbidden('Invalid CSRF token')
    );
  }

  next();
};

/**
 * CSRF token setter middleware
 * Sets CSRF token in response for client to use
 */
export const setCSRFToken = (req: Request, res: Response, next: NextFunction) => {
  // Generate new token
  const token = generateCSRFToken();

  // Set in cookie with HttpOnly protection (prevent XSS)
  res.cookie(CSRF_TOKEN_COOKIE, token, {
    httpOnly: true, // PROTECTED: Client cannot read via JavaScript
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Attach to response locals for template use
  res.locals.csrfToken = token;

  // Also attach to request for controller access
  (req as any).csrfToken = token;

  // Return token in response body for client to use in header
  return res.status(200).json({
    message: 'CSRF token generated',
    csrfToken: token,
  });
};

/**
 * CSRF error handler
 */
export const csrfErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
      ResponseHandler.forbidden('Invalid CSRF token')
    );
  }
  next(err);
};
