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
    .min(1)
    .required()
    .messages({
      "string.empty": "Password is required and cannot be empty",
      "any.required": "Password is required",
    }),
});

module.exports = {
  login: {
    body: loginSchema,
  },
};
