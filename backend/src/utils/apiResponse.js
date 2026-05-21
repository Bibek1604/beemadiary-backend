/**
 * Standardized API Response Utilities
 */

class ApiResponse {
  /**
   * Send a success response
   * @param {string} message - Success message
   * @param {any} data - Response payload
   * @returns {object}
   */
  static success(message = "Success", data = {}) {
    return {
      status: true,
      message,
      data,
    };
  }

  /**
   * Send an error response
   * @param {string} message - Error status message
   * @param {array} errors - Detailed errors list
   * @returns {object}
   */
  static error(message = "An error occurred", errors = []) {
    return {
      status: false,
      message,
      errors: Array.isArray(errors) ? errors : [errors],
    };
  }
}

module.exports = ApiResponse;
