import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'xss-clean';
import { CONSTANTS } from '../config/constants';
const logger = require('../utils/logger');

/**
 * Apply helmet security headers
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
      fontSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
});

/**
 * Apply CORS configuration
 */
export const corsConfig = cors({
  origin: function (origin, callback) {
    const allowedOrigins = (process.env.CORS_ORIGIN || process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow localhost origins in development (but still validate)
    if (process.env.NODE_ENV === 'development' && origin?.startsWith('http://localhost')) {
      return callback(null, true);
    }

    // Even in development, enforce CORS - don't allow unvalidated origins
    logger.warn('[CORS] BLOCKED non-allowlisted origin', { origin, allowedOrigins });
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
});

/**
 * Rate limiting middleware
 * Disabled in development for continuous testing
 */
export const rateLimiter = rateLimit({
  windowMs: CONSTANTS.RATE_LIMIT_WINDOW,
  max: CONSTANTS.RATE_LIMIT_MAX_REQUESTS,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => {
    // Skip rate limiting for health check and development mode
    if (process.env.NODE_ENV === 'development') return true;
    return req.path === '/health';
  },
});

/**
 * Stricter rate limiting for auth endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * XSS protection via data sanitization
 */
export const xssProtection = mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }: any) => {
    logger.warn('[XSS WARNING] Potential XSS attack detected', { key, path: req?.path, method: req?.method });
  },
});

/**
 * Prevent parameter pollution
 */
export const preventParamPollution = (req: Request, res: Response, next: NextFunction) => {
  // Only keep the last value for each parameter
  for (const key in req.query) {
    if (Array.isArray(req.query[key])) {
      req.query[key] = (req.query[key] as string[])[
        (req.query[key] as string[]).length - 1
      ];
    }
  }
  next();
};

/**
 * Security headers for API
 */
export const apiSecurityHeaders = (req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
};

/**
 * Request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('[HTTP]', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
};
