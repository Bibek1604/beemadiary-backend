const {
  createSuccessResponse,
  createErrorResponse,
} = require('./responseFormatter');

class ApiResponse {
  /**
   * Build a success response body.
   * @param {string} message
   * @param {*} data
   * @param {number} [code] - HTTP status code, defaults to 200.
   */
  static success(message = 'Success', data = {}, code = 200) {
    return createSuccessResponse(message, data, code);
  }

  /**
   * Build an error response body.
   * - `errors` may be an Error instance, a string, a single object, or an array.
   * - Empty / null / undefined entries are filtered out so the frontend never
   *   sees `errors: [null]` (which used to leak from generic catch blocks).
   * @param {string} message
   * @param {*}      errors
   * @param {number} [code] - HTTP status code, defaults to 500.
   */
  static error(message = 'An error occurred', errors = [], code = 500) {
    return createErrorResponse(message, errors, code);
  }
}

module.exports = ApiResponse;
