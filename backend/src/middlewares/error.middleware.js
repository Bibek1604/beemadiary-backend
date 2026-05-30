const ApiResponse = require("../utils/apiResponse");
const logger = require("../utils/logger");
const env = require("../config/env");

/**
 * Global Error Handling Middleware
 */
const errorMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors = err.errors || [];

  // Log the complete error trace
  logger.error(`${req.method} ${req.originalUrl} failed:`, err);

  // Handle Prisma Database Errors
  if (typeof err.code === "string" && err.code.startsWith("P")) {
    statusCode = 400;
    switch (err.code) {
      case "P2002": // Unique constraint violation
        const targets = err.meta ? err.meta.target : [];
        message = "Unique constraint violation";
        errors = targets.map(t => `${t} must be unique`);
        if (errors.length === 0) {
          errors = ["A record with this unique field value already exists"];
        }
        break;
      case "P2025": // Record not found
        statusCode = 404;
        message = "Resource not found";
        errors = [err.meta && err.meta.cause ? err.meta.cause : "The requested record was not found"];
        break;
      case "P2003": // Foreign key violation
        message = "Invalid reference key (Foreign key constraint failed)";
        errors = [`Foreign key constraint failed on field: ${err.meta ? err.meta.field_name : "unknown"}`];
        break;
      default:
        message = "Database operation failed";
        errors = [err.message || "An unexpected database error occurred"];
        break;
    }
  }

  // Handle MongoDB duplicate key / selection errors
  if (err.code === 11000 || err.codeName === "DuplicateKey") {
    statusCode = 409;
    message = "Unique constraint violation";
    const fields = err.keyPattern ? Object.keys(err.keyPattern) : [];
    errors = fields.length > 0 ? fields.map((field) => `${field} must be unique`) : ["A record with this unique field value already exists"];
  }

  if (err.name === "MongoServerSelectionError" || err.name === "MongoNetworkError") {
    statusCode = 503;
    message = "Database service is unavailable";
    errors = [err.message || "Unable to connect to the database"];
  }

  // Handle Joi validation errors (if we use Joi)
  if (err.isJoi) {
    statusCode = 400;
    message = "Validation failed";
    errors = err.details.map(d => d.message);
  }

  // Handle Multer errors (file uploads)
  if (err.name === "MulterError" || err.message.includes("Only images")) {
    statusCode = 400;
    message = "Validation failed";
    if (err.code === "LIMIT_FILE_SIZE") {
      errors = ["File is too large. Maximum allowed size is 5MB"];
    } else {
      errors = [err.message || "An error occurred during file upload"];
    }
  }

  // Handle JWT authentication errors
  if (err.name === "UnauthorizedError" || err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Unauthorized access";
    errors = [err.message || "Invalid token"];
  } else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Session expired";
    errors = ["Authentication token has expired"];
  }

  // Format standard error response
  const responsePayload = ApiResponse.error(message, errors);

  return res.status(statusCode).json(responsePayload);
};

module.exports = errorMiddleware;
