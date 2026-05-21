/**
 * Async handler to wrap express controllers and avoid repetitive try-catch blocks
 * @param {Function} fn - Controller function
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
