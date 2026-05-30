/**
 * Response Handler Utilities
 * Standardized response formatting with empty state handling
 */

const {
  createSuccessResponse,
  createErrorResponse,
} = require('./responseFormatter');

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ApiSuccessResponse<T> {
  success: true;
  status: true;
  code: string | number;
  message: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  status: false;
  code: string | number;
  message: string;
  errors?: Array<{ field?: string; message: string }>;
}

export interface PaginatedResponse<T> {
  success: true;
  status: true;
  code: string | number;
  message: string;
  data: {
    results: T[];
    pagination: PaginationMeta;
  };
}

export interface EmptyStateResponse {
  success: true;
  status: true;
  code: string | number;
  message: string;
  data: {
    results: any[];
    pagination?: {
      total: number;
      page: number;
      limit: number;
      pages: number;
    };
  };
}

/**
 * Response Handler Class
 */
export class ResponseHandler {
  /**
   * Success response with data
   */
  static success<T>(
    res: any,
    data: T,
    message: string = 'Success',
    code: string = 'SUCCESS',
    statusCode: number = 200
  ): ApiSuccessResponse<T> {
    const response = createSuccessResponse(message, data, statusCode, { code });

    res.status(statusCode).json(response);
    return response;
  }

  /**
   * Paginated response
   */
  static paginated<T>(
    res: any,
    results: T[],
    pagination: PaginationMeta,
    message: string = 'Success',
    code: string = 'SUCCESS',
    statusCode: number = 200
  ): PaginatedResponse<T> {
    const response = createSuccessResponse(message, { results, pagination }, statusCode, { code });

    res.status(statusCode).json(response);
    return response;
  }

  /**
   * Empty state response (no results found)
   */
  static empty(
    res: any,
    message: string = 'No results found',
    code: string = 'NO_RESULTS',
    pagination?: PaginationMeta,
    statusCode: number = 200
  ): EmptyStateResponse {
    const response = createSuccessResponse(
      message,
      {
        results: [],
        ...(pagination && { pagination }),
      },
      statusCode,
      { code }
    );

    res.status(statusCode).json(response);
    return response;
  }

  /**
   * Created response
   */
  static created<T>(
    res: any,
    data: T,
    message: string = 'Created successfully',
    code: string = 'CREATED'
  ): ApiSuccessResponse<T> {
    return ResponseHandler.success(res, data, message, code, 201);
  }

  /**
   * Updated response
   */
  static updated<T>(
    res: any,
    data: T,
    message: string = 'Updated successfully',
    code: string = 'UPDATED'
  ): ApiSuccessResponse<T> {
    return ResponseHandler.success(res, data, message, code, 200);
  }

  /**
   * Deleted response
   */
  static deleted(
    res: any,
    message: string = 'Deleted successfully',
    code: string = 'DELETED'
  ): ApiSuccessResponse<null> {
    return ResponseHandler.success(res, null, message, code, 200);
  }

  /**
   * Error response
   */
  static error(
    res: any,
    message: string,
    code: string = 'ERROR',
    statusCode: number = 400,
    details?: Record<string, any>
  ): ApiErrorResponse {
    const response = createErrorResponse(message, details ? [details] : [], statusCode, { code });

    res.status(statusCode).json(response);
    return response;
  }

  /**
   * Not found response
   */
  static notFound(
    res: any,
    resource: string,
    id?: string
  ): ApiErrorResponse {
    const message = id
      ? `${resource} with ID '${id}' not found`
      : `${resource} not found`;

    return ResponseHandler.error(res, message, 'NOT_FOUND', 404);
  }

  /**
   * Unauthorized response
   */
  static unauthorized(
    res: any,
    message: string = 'Authentication required'
  ): ApiErrorResponse {
    return ResponseHandler.error(res, message, 'UNAUTHORIZED', 401);
  }

  /**
   * Forbidden response
   */
  static forbidden(
    res: any,
    message: string = 'Access denied'
  ): ApiErrorResponse {
    return ResponseHandler.error(res, message, 'FORBIDDEN', 403);
  }

  /**
   * Validation error response
   */
  static validationError(
    errors: Array<{ field?: string; message: string }>
  ): ApiErrorResponse {
    return createErrorResponse(CONSTANTS.ERRORS.VALIDATION_ERROR, errors, CONSTANTS.STATUS_CODES.BAD_REQUEST);
  }

  /**
   * Server error response
   */
  static serverError(
    res: any,
    message: string = 'Internal server error'
  ): ApiErrorResponse {
    return ResponseHandler.error(res, message, 'INTERNAL_SERVER_ERROR', 500);
  }

  /**
   * Service unavailable response
   */
  static unavailable(
    res: any,
    message: string = 'Service temporarily unavailable'
  ): ApiErrorResponse {
    return ResponseHandler.error(res, message, 'SERVICE_UNAVAILABLE', 503);
  }
}

/**
 * Helper to calculate pagination meta
 */
export const calculatePagination = (
  total: number,
  page: number,
  limit: number
): PaginationMeta => {
  const pages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    pages: pages || 1,
  };
};

/**
 * Helper to check if response is empty
 */
export const isEmpty = (data: any): boolean => {
  if (Array.isArray(data)) {
    return data.length === 0;
  }
  if (data === null || data === undefined) {
    return true;
  }
  if (typeof data === 'object') {
    return Object.keys(data).length === 0;
  }
  return !data;
};

/**
 * Middleware to attach response handlers
 */
export const responseMiddleware = (req: any, res: any, next: any) => {
  res.apiSuccess = (data: any, message?: string, code?: string, status?: number) =>
    ResponseHandler.success(res, data, message, code, status);

  res.apiPaginated = (results: any[], pagination: PaginationMeta, message?: string, code?: string, status?: number) =>
    ResponseHandler.paginated(res, results, pagination, message, code, status);

  res.apiEmpty = (message?: string, code?: string, pagination?: PaginationMeta, status?: number) =>
    ResponseHandler.empty(res, message, code, pagination, status);

  res.apiCreated = (data: any, message?: string, code?: string) =>
    ResponseHandler.created(res, data, message, code);

  res.apiUpdated = (data: any, message?: string, code?: string) =>
    ResponseHandler.updated(res, data, message, code);

  res.apiDeleted = (message?: string, code?: string) =>
    ResponseHandler.deleted(res, message, code);

  res.apiError = (message: string, code?: string, status?: number, details?: any) =>
    ResponseHandler.error(res, message, code, status, details);

  res.apiNotFound = (resource: string, id?: string) =>
    ResponseHandler.notFound(res, resource, id);

  res.apiUnauthorized = (message?: string) =>
    ResponseHandler.unauthorized(res, message);

  res.apiForbidden = (message?: string) =>
    ResponseHandler.forbidden(res, message);

  res.apiValidationError = (errors: Record<string, string>) =>
    ResponseHandler.validationError(res, errors);

  res.apiServerError = (message?: string) =>
    ResponseHandler.serverError(res, message);

  res.apiUnavailable = (message?: string) =>
    ResponseHandler.unavailable(res, message);

  next();
};
