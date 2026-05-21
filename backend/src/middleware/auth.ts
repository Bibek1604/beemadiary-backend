import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, JWTPayload } from '../types';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';

/**
 * Verify JWT token
 */
export const verifyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('No token provided')
      );
    }

    const token = authHeader.substring(7);

    const decoded = jwt.verify(token, CONSTANTS.JWT_SECRET) as JWTPayload;

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Token has expired')
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Invalid token')
      );
    }

    return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('Authentication failed')
    );
  }
};

/**
 * Generate JWT token
 */
export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, CONSTANTS.JWT_SECRET, {
    expiresIn: CONSTANTS.JWT_EXPIRY,
  });
};
