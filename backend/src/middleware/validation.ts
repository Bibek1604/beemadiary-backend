import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';

/**
 * Validate request body
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
          ResponseHandler.validationError(formattedErrors)
        );
      }
      next(error);
    }
  };
};

/**
 * Validate request query
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
          ResponseHandler.validationError(formattedErrors)
        );
      }
      next(error);
    }
  };
};

/**
 * Validate request params
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req.params);
      req.params = validated as any;
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
          ResponseHandler.validationError(formattedErrors)
        );
      }
      next(error);
    }
  };
};

/**
 * Request sanitizer - removes empty/null/undefined values
 */
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  const sanitizeValue = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return undefined;
    }
    if (typeof obj === 'string') {
      return obj.trim() === '' ? undefined : obj.trim();
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeValue).filter((v) => v !== undefined);
    }
    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        const sanitizedValue = sanitizeValue(obj[key]);
        if (sanitizedValue !== undefined) {
          sanitized[key] = sanitizedValue;
        }
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  next();
};

// Common validation schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});
