const ApiResponse = require("../utils/apiResponse");

/**
 * Validation Middleware using Joi
 * @param {object} schemas - Object containing Joi schemas for body, query, and/or params
 * @returns {Function} Express middleware function
 */
const validate = (schemas) => (req, res, next) => {
  const validationOptions = {
    abortEarly: false,  // Include all errors, not just the first one
    allowUnknown: true,  // Allow properties not specified in the schema
    stripUnknown: true,  // Remove properties not specified in the schema
  };

  const targets = ["body", "query", "params"];

  for (const target of targets) {
    if (schemas[target]) {
      const { error, value } = schemas[target].validate(req[target], validationOptions);
      
      if (error) {
        const errorDetails = error.details.map(detail => detail.message.replace(/"/g, ""));
        return res.status(400).json(
          ApiResponse.error("Validation failed", errorDetails)
        );
      }
      
      // Replace with validated and sanitized values
      req[target] = value;
    }
  }

  next();
};

module.exports = validate;
