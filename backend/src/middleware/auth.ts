import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticatedRequest, JWTPayload } from '../types';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';

function extractAndVerify(
  req: AuthenticatedRequest,
  res: Response,
  secret: string,
  allowedTypes?: string[]
): JWTPayload | null {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('No token provided')
    );
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, secret) as JWTPayload;

    if (allowedTypes && allowedTypes.length > 0) {
      const tokenType = (decoded as any).type || (decoded as any).role;
      if (!allowedTypes.includes(tokenType)) {
        res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
          ResponseHandler.forbidden('This token is not authorised for this endpoint')
        );
        return null;
      }
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Token has expired')
      );
    } else {
      res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Invalid token')
      );
    }
    return null;
  }
}

export const verifyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const decoded = extractAndVerify(req, res, CONSTANTS.JWT_SECRET, ['AGENT']);
  if (!decoded) return;
  req.user = decoded;
  next();
};

export const verifyAdminToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const decoded = extractAndVerify(req, res, CONSTANTS.JWT_ADMIN_SECRET, ['ADMIN', 'SUPER_ADMIN']);
  if (!decoded) return;
  req.user = decoded;
  next();
};

export const verifyAnyToken = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
      ResponseHandler.unauthorized('No token provided')
    );
    return;
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, CONSTANTS.JWT_ADMIN_SECRET) as JWTPayload;
    req.user = decoded;
    return next();
  } catch { /* not an admin token */ }

  try {
    const decoded = jwt.verify(token, CONSTANTS.JWT_SECRET) as JWTPayload;
    req.user = decoded;
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Token has expired')
      );
    } else {
      res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
        ResponseHandler.unauthorized('Invalid token')
      );
    }
  }
};

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, CONSTANTS.JWT_SECRET, {
    expiresIn: CONSTANTS.ACCESS_TOKEN_EXPIRY as jwt.SignOptions['expiresIn'],
  });
};

export const generateAdminToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, CONSTANTS.JWT_ADMIN_SECRET, {
    expiresIn: CONSTANTS.JWT_ADMIN_EXPIRY as jwt.SignOptions['expiresIn'],
  });
};
