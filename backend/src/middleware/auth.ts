import jwt from 'jsonwebtoken';
import { JWTPayload } from '../types';
import { CONSTANTS } from '../config/constants';

// Session-aware verification lives in the canonical JS middleware
// (src/middlewares/auth.middleware.js). Delegating to it here ensures logout,
// logout-all and account deactivation are enforced consistently on EVERY route —
// including those that import verifyToken / verifyAdminToken / verifyAnyToken,
// which previously only ran jwt.verify and ignored the session table.
const authMiddleware = require('../middlewares/auth.middleware');

export const verifyToken = authMiddleware.authenticate;
export const verifyAdminToken = authMiddleware.authenticateAdmin;
export const verifyAnyToken = authMiddleware.authenticateAny;

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
