const Joi = require("joi");

const getNotifications = Joi.object({
  page: Joi.number().integer().min(1).default(1).messages({
    "number.base": "Page must be a number",
    "number.min": "Page must be at least 1"
  }),
  limit: Joi.number().integer().min(1).max(100).default(10).messages({
    "number.base": "Limit must be a number",
    "number.min": "Limit must be at least 1",
    "number.max": "Limit cannot exceed 100"
  }),
  search: Joi.string().trim().allow("").optional(),
  is_read: Joi.boolean().optional().messages({
    "boolean.base": "is_read must be a boolean (true/false)"
  })
});

const getNotificationById = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.empty": "Notification ID is required",
    "any.required": "Notification ID is required",
    "string.guid": "Invalid Notification ID format"
  })
});

const markAsRead = Joi.object({
  id: Joi.string().uuid().required().messages({
    "string.empty": "Notification ID is required",
    "any.required": "Notification ID is required",
    "string.guid": "Invalid Notification ID format"
  })
});

module.exports = {
  getNotifications,
  getNotificationById,
  markAsRead
};