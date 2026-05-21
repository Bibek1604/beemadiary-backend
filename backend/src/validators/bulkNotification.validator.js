const Joi = require("joi");

// Custom validation helper to reject whitespace-only strings
const noWhitespaceOnly = (value, helpers) => {
  if (value && typeof value === "string" && value.trim() === "") {
    return helpers.error("string.empty");
  }
  return value;
};

// UUID format validation pattern
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Create Bulk Notification Schema
 */
const createBulkNotificationSchema = Joi.object({
  title: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .required()
    .messages({
      "string.empty": "Notification title is required and cannot be empty",
      "any.required": "Notification title is required",
    }),
  content: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .required()
    .messages({
      "string.empty": "Notification content is required and cannot be empty",
      "any.required": "Notification content is required",
    }),
  target_type: Joi.string()
    .trim()
    .valid("single", "all")
    .required()
    .messages({
      "any.only": "target_type must be either 'single' or 'all'",
      "string.empty": "target_type is required and cannot be empty",
      "any.required": "target_type is required",
    }),
  target_agent_id: Joi.string()
    .trim()
    .pattern(uuidPattern)
    .when("target_type", {
      is: "single",
      then: Joi.required(),
      otherwise: Joi.forbidden().messages({
        "any.unknown": "target_agent_id must not be provided when target_type is 'all'",
      }),
    })
    .messages({
      "string.pattern.base": "target_agent_id must be a valid UUID",
      "string.empty": "target_agent_id is required for single target type",
      "any.required": "target_agent_id is required when target_type is 'single'",
    }),
});

/**
 * Get All Notifications Query Schema
 */
const getAllNotificationsSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      "number.base": "page must be a number",
      "number.integer": "page must be an integer",
      "number.min": "page must be at least 1",
    }),
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(10)
    .messages({
      "number.base": "limit must be a number",
      "number.integer": "limit must be an integer",
      "number.min": "limit must be at least 1",
      "number.max": "limit must not exceed 100",
    }),
  search: Joi.string()
    .trim()
    .allow("")
    .max(200)
    .default("")
    .messages({
      "string.max": "search query must not exceed 200 characters",
    }),
});

/**
 * ID Parameter Schema (for :id routes)
 */
const idParamSchema = Joi.object({
  id: Joi.string()
    .trim()
    .pattern(uuidPattern)
    .required()
    .messages({
      "string.pattern.base": "ID must be a valid UUID",
      "string.empty": "ID parameter is required",
      "any.required": "ID parameter is required",
    }),
});

module.exports = {
  createBulkNotification: {
    body: createBulkNotificationSchema,
  },
  getAllNotifications: {
    query: getAllNotificationsSchema,
  },
  getNotificationById: {
    params: idParamSchema,
  },
  deleteNotification: {
    params: idParamSchema,
  },
};
