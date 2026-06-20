const Joi = require("joi");

// Custom validation helper to reject whitespace-only strings
const noWhitespaceOnly = (value, helpers) => {
  if (value && typeof value === "string" && value.trim() === "") {
    return helpers.error("string.empty");
  }
  return value;
};

const loginSchema = Joi.object({
  email: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .email()
    .required()
    .messages({
      "string.email": "Please enter a valid email address",
      "string.empty": "Email is required and cannot be empty",
      "any.required": "Email is required",
    }),
  password: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .min(6)
    .required()
    .messages({
      "string.min": "Password must be at least 6 characters",
      "string.empty": "Password is required and cannot be empty",
      "any.required": "Password is required",
    }),
});

const registerSchema = Joi.object({
  email: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .email()
    .required()
    .messages({
      "string.email": "Please enter a valid email address",
      "string.empty": "Email is required and cannot be empty",
      "any.required": "Email is required",
    }),
  password: Joi.string()
    .min(6)
    .max(128)
    .required()
    .messages({
      "string.min": "Password must be at least 6 characters",
      "string.empty": "Password is required and cannot be empty",
      "any.required": "Password is required",
    }),
  full_name: Joi.string().trim().max(120).allow("", null),
  phone_number: Joi.string().trim().max(20).allow("", null),
});

module.exports = {
  login: {
    body: loginSchema,
  },
  register: {
    body: registerSchema,
  },
};
