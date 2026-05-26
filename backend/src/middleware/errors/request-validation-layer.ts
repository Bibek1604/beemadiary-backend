/**
 * REQUEST VALIDATION & SANITIZATION LAYER
 * Prevents errors BEFORE they happen
 */

import { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import DOMPurify from 'isomorphic-dompurify';
import {
  ValidationError,
  SuspiciousInputError,
} from './custom-error-classes';

/**
 * LAYER 1: Content-Type Validation
 */
export const validateContentType = (
  allowedTypes: string[] = ['application/json']
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.get('Content-Type')?.split(';')[0];

    if (['GET', 'DELETE', 'HEAD'].includes(req.method)) {
      return next();
    }

    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (!contentType || !allowedTypes.includes(contentType)) {
        throw new ValidationError(
          `Content-Type must be one of: ${allowedTypes.join(', ')}`
        );
      }
    }

    next();
  };
};

/**
 * LAYER 2: Input Sanitization
 */
export const sanitizeInputs = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
};

function sanitizeObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObject(item));
  }

  if (obj !== null && typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSuspiciousKey(key)) {
        throw new SuspiciousInputError('Suspicious field name detected');
      }

      sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }

  return obj;
}

function sanitizeString(str: string): string {
  if (!str) return str;

  let sanitized = str.trim();

  sanitized = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });

  if (sanitized.length > 10000) {
    throw new ValidationError(
      'Input exceeds maximum length (10000 characters)'
    );
  }

  return sanitized;
}

function isSuspiciousKey(key: string): boolean {
  const suspiciousPatterns = [
    /^\$/,
    /__proto__/,
    /constructor/i,
    /prototype/i,
    /^\.\./,
    /%2e%2e/i,
    /\x00/,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(key));
}

/**
 * LAYER 3: Request Validation & Error Handling
 */
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const details = errors.array().map((err: any) => {
      let field = '';
      let message = '';

      if ('path' in err) {
        field = err.path as string;
        message = err.msg as string;
      } else {
        field = (err as any).param;
        message = (err as any).msg;
      }

      return {
        field,
        message: makeUserFriendlyMessage(message),
      };
    });

    throw new ValidationError(
      'Please review the validation errors below and try again',
      details
    );
  }

  next();
};

function makeUserFriendlyMessage(technical: string): string {
  const friendlyMessages: Record<string, string> = {
    'invalid email': 'Please enter a valid email address',
    'must be a valid': 'Invalid format',
    'must be at least': 'This field is too short',
    'must be no more': 'This field is too long',
    'must be an integer': 'Please enter a whole number',
    'must be a number': 'Please enter a valid number',
    'required': 'This field is required',
    'is required': 'This field is required',
    'must be': 'Invalid value',
    'invalid': 'Invalid input',
  };

  const lowerTechnical = technical.toLowerCase();
  for (const [key, value] of Object.entries(friendlyMessages)) {
    if (lowerTechnical.includes(key)) {
      return value;
    }
  }

  return 'Please check this field and try again';
}

/**
 * VALIDATORS - Common validation chains
 */

export const validateEmail = () =>
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email is too long');

export const validatePassword = (fieldName = 'password') =>
  body(fieldName)
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 })
    .withMessage('Password is too long')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number');

export const validateName = (fieldName = 'name') =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .isLength({ min: 2 })
    .withMessage(`${fieldName} must be at least 2 characters`)
    .isLength({ max: 100 })
    .withMessage(`${fieldName} is too long`)
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage(
      `${fieldName} can only contain letters, spaces, hyphens, and apostrophes`
    );

export const validatePhone = (fieldName = 'phone') =>
  body(fieldName)
    .optional()
    .trim()
    .matches(/^[\d\s\-\+\(\)]+$/)
    .withMessage('Please enter a valid phone number')
    .isLength({ min: 10, max: 20 })
    .withMessage('Phone number is invalid');

export const validateUrl = (fieldName = 'url') =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .isURL()
    .withMessage('Please enter a valid URL');

export const validateNumber = (
  fieldName: string,
  min?: number,
  max?: number
) => {
  let validator = body(fieldName)
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .isFloat()
    .withMessage(`${fieldName} must be a number`);

  if (typeof min === 'number') {
    validator = validator.isFloat({ min }).withMessage(
      `${fieldName} must be at least ${min}`
    );
  }

  if (typeof max === 'number') {
    validator = validator.isFloat({ max }).withMessage(
      `${fieldName} cannot exceed ${max}`
    );
  }

  return validator;
};

export const validateDate = (fieldName = 'date') =>
  body(fieldName)
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .isISO8601()
    .withMessage('Please enter a valid date')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date > now) {
        throw new Error('Date cannot be in the future');
      }
      return true;
    });

export const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be at least 1')
    .toInt(),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Page size must be between 1 and 100')
    .toInt(),
];

export const validateSort = () =>
  query('sort')
    .optional()
    .trim()
    .matches(/^[a-zA-Z_]+(:asc|:desc)?$/)
    .withMessage('Invalid sort parameter');

export const validateStatus = (
  fieldName = 'status',
  allowedStatuses: string[] = []
) =>
  body(fieldName)
    .notEmpty()
    .withMessage(`${fieldName} is required`)
    .isIn(allowedStatuses)
    .withMessage(`${fieldName} must be one of: ${allowedStatuses.join(', ')}`);

/**
 * Composite validation chains
 */

export const validateAuthInput = [
  validateEmail(),
  validatePassword(),
];

export const validateUserProfileUpdate = [
  body('first_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('First name contains invalid characters'),
  body('last_name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/)
    .withMessage('Last name contains invalid characters'),
  validateEmail(),
  validatePhone('phone'),
];

export const validatePolicyCreation = [
  body('policy_number')
    .trim()
    .notEmpty()
    .withMessage('Policy number is required')
    .matches(/^[A-Z0-9-]+$/)
    .withMessage('Policy number format is invalid'),
  body('plan_name')
    .trim()
    .notEmpty()
    .withMessage('Plan name is required')
    .isLength({ max: 255 })
    .withMessage('Plan name is too long'),
  validateNumber('premium_amount', 0),
  body('premium_due_date')
    .notEmpty()
    .withMessage('Premium due date is required')
    .isISO8601()
    .withMessage('Invalid date format'),
  validateStatus('status', ['ACTIVE', 'LAPSED', 'CANCELLED', 'INACTIVE']),
];

export default {
  validateContentType,
  sanitizeInputs,
  handleValidationErrors,
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validateUrl,
  validateNumber,
  validateDate,
  validatePagination,
  validateSort,
  validateStatus,
  validateAuthInput,
  validateUserProfileUpdate,
  validatePolicyCreation,
};
