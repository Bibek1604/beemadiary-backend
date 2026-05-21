import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';
import { UserRole } from '@prisma/client';

/**
 * Check if user has required role
 */
export const requireRole = (...allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('User not authenticated')
      );
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      return res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
        ResponseHandler.forbidden('Insufficient permissions')
      );
    }

    next();
  };
};

/**
 * Check if user is admin
 */
export const requireAdmin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('User not authenticated')
    );
  }

  if (req.user.role !== 'ADMIN') {
    return res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
      ResponseHandler.forbidden('Admin access required')
    );
  }

  next();
};

/**
 * Check if user is agent or admin
 */
export const requireAgentOrAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('User not authenticated')
    );
  }

  if (!['AGENT', 'ADMIN'].includes(req.user.role)) {
    return res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
      ResponseHandler.forbidden('Agent or admin access required')
    );
  }

  next();
};
