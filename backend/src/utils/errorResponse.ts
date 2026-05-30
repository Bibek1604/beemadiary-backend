import { ApiResponse, ErrorResponse } from '../types';
import { CONSTANTS } from '../config/constants';

const {
  createSuccessResponse,
  createErrorResponse,
} = require('./responseFormatter');

export class ResponseHandler {
  /**
   * Send success response
   */
  static success<T>(
    message: string = 'Success',
    data?: T,
    statusCode: number = CONSTANTS.STATUS_CODES.OK
  ): ApiResponse<T> {
    return createSuccessResponse(message, data ?? {}, statusCode);
  }

  /**
   * Send error response
   */
  static error(
    message: string = 'Error',
    statusCode: number = CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
    errors: any[] = []
  ): ErrorResponse {
    return createErrorResponse(message, errors ?? [], statusCode);
  }

  /**
   * Validation error response
   */
  static validationError(errors: Array<{ field?: string; message: string }>): ErrorResponse {
    return createErrorResponse(CONSTANTS.ERRORS.VALIDATION_ERROR, errors, CONSTANTS.STATUS_CODES.BAD_REQUEST);
  }

  /**
   * Unauthorized error response
   */
  static unauthorized(message: string = CONSTANTS.ERRORS.UNAUTHORIZED): ErrorResponse {
    return createErrorResponse(message, [], CONSTANTS.STATUS_CODES.UNAUTHORIZED);
  }

  /**
   * Forbidden error response
   */
  static forbidden(message: string = CONSTANTS.ERRORS.FORBIDDEN): ErrorResponse {
    return createErrorResponse(message, [], CONSTANTS.STATUS_CODES.FORBIDDEN);
  }

  /**
   * Not found error response
   */
  static notFound(message: string = CONSTANTS.ERRORS.NOT_FOUND): ErrorResponse {
    return createErrorResponse(message, [], CONSTANTS.STATUS_CODES.NOT_FOUND);
  }

  /**
   * Database error response
   */
  static databaseError(message: string = CONSTANTS.ERRORS.DATABASE_ERROR): ErrorResponse {
    return createErrorResponse(message, [], CONSTANTS.STATUS_CODES.INTERNAL_ERROR);
  }
}
