import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';

export type AsyncRequestHandler = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Wrap async route handlers to catch errors
 */
export const asyncHandler = (fn: AsyncRequestHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req as AuthenticatedRequest, res, next)).catch(next);
  };
};
