import { Request, Response, NextFunction } from 'express';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';
import { ErrorResponse } from '../types';

export interface CustomError extends Error {
  statusCode?: number;
  errors?: any[];
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response<ErrorResponse>,
  next: NextFunction
) => {
  console.error('[ERROR]', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    statusCode: err.statusCode,
  });

  // Prisma validation error
  if (err.name === 'PrismaClientValidationError') {
    return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
      ResponseHandler.error(
        'Invalid data provided',
        CONSTANTS.STATUS_CODES.BAD_REQUEST,
        [{ message: err.message }]
      )
    );
  }

  // Prisma unique constraint error
  if (err.name === 'PrismaClientKnownRequestError' && (err as any).code === 'P2002') {
    const field = (err as any).meta?.target?.[0] || 'field';
    return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
      ResponseHandler.error(
        `${field} already exists`,
        CONSTANTS.STATUS_CODES.BAD_REQUEST,
        [{ field, message: `Duplicate ${field}` }]
      )
    );
  }

  // Prisma record not found error
  if (err.name === 'PrismaClientKnownRequestError' && (err as any).code === 'P2025') {
    return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(
      ResponseHandler.notFound('Resource not found')
    );
  }

  // Prisma foreign key constraint error
  if (err.name === 'PrismaClientKnownRequestError' && (err as any).code === 'P2003') {
    return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
      ResponseHandler.error(
        'Invalid reference: Related record not found',
        CONSTANTS.STATUS_CODES.BAD_REQUEST,
        [{ message: 'Foreign key constraint violation' }]
      )
    );
  }

  // JSON Web Token errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('Invalid token')
    );
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('Token expired')
    );
  }

  // Zod validation error
  if (err.name === 'ZodError') {
    const errors = (err as any).errors.map((e: any) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(CONSTANTS.STATUS_CODES.BAD_REQUEST).json(
      ResponseHandler.validationError(errors)
    );
  }

  // Custom status code errors
  if (err.statusCode) {
    return res.status(err.statusCode).json(
      ResponseHandler.error(
        err.message || 'An error occurred',
        err.statusCode,
        err.errors
      )
    );
  }

  // Default error
  res.status(CONSTANTS.STATUS_CODES.INTERNAL_ERROR).json(
    ResponseHandler.error(
      'Internal server error',
      CONSTANTS.STATUS_CODES.INTERNAL_ERROR
    )
  );
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(
    ResponseHandler.notFound(`Route ${req.originalUrl} not found`)
  );
};
