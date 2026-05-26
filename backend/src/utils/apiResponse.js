/**
 * Standardized API Response Utilities.
 *
 * All routes use these so the wire format is predictable:
 *   success: { status: true,  message, data, code }
 *   error:   { status: false, message, errors[], code }
 */

const isMeaningful = (value) =>
  value !== null && value !== undefined && value !== '' && !(typeof value === 'string' && value.trim() === '');

class ApiResponse {
  /**
   * Build a success response body.
   * @param {string} message
   * @param {*} data
   * @param {number} [code] - HTTP status code, defaults to 200.
   */
  static success(message = 'Success', data = {}, code = 200) {
    return {
      status: true,
      message,
      data,
      code,
    };
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
    let list;
    if (errors === null || errors === undefined) {
      list = [];
    } else if (Array.isArray(errors)) {
      list = errors;
    } else if (errors instanceof Error) {
      list = [errors.message];
    } else {
      list = [errors];
    }

    const cleaned = list
      .map((item) => (item instanceof Error ? item.message : item))
      .filter(isMeaningful);

    return {
      status: false,
      message,
      errors: cleaned,
      code,
    };
  }
}

module.exports = ApiResponse;
