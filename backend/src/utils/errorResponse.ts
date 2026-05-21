import { ApiResponse, ErrorResponse } from '../types';
import { CONSTANTS } from '../config/constants';

export class ResponseHandler {
  /**
   * Send success response
   */
  static success<T>(
    message: string = 'Success',
    data?: T,
    statusCode: number = CONSTANTS.STATUS_CODES.OK
  ): ApiResponse<T> {
    return {
      status: true,
      message,
      data,
      code: statusCode,
    };
  }

  /**
   * Send error response
   */
  static error(
    message: string = 'Error',
    statusCode: number = CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
    errors: any[] = []
  ): ErrorResponse {
    return {
      status: false,
      message,
      errors: errors.length > 0 ? errors : undefined,
      code: statusCode,
    };
  }

  /**
   * Validation error response
   */
  static validationError(errors: Array<{ field?: string; message: string }>): ErrorResponse {
    return {
      status: false,
      message: CONSTANTS.ERRORS.VALIDATION_ERROR,
      errors,
      code: CONSTANTS.STATUS_CODES.BAD_REQUEST,
    };
  }

  /**
   * Unauthorized error response
   */
  static unauthorized(message: string = CONSTANTS.ERRORS.UNAUTHORIZED): ErrorResponse {
    return {
      status: false,
      message,
      code: CONSTANTS.STATUS_CODES.UNAUTHORIZED,
    };
  }

  /**
   * Forbidden error response
   */
  static forbidden(message: string = CONSTANTS.ERRORS.FORBIDDEN): ErrorResponse {
    return {
      status: false,
      message,
      code: CONSTANTS.STATUS_CODES.FORBIDDEN,
    };
  }

  /**
   * Not found error response
   */
  static notFound(message: string = CONSTANTS.ERRORS.NOT_FOUND): ErrorResponse {
    return {
      status: false,
      message,
      code: CONSTANTS.STATUS_CODES.NOT_FOUND,
    };
  }

  /**
   * Database error response
   */
  static databaseError(message: string = CONSTANTS.ERRORS.DATABASE_ERROR): ErrorResponse {
    return {
      status: false,
      message,
      code: CONSTANTS.STATUS_CODES.INTERNAL_ERROR,
    };
  }
}
