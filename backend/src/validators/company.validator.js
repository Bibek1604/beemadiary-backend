const Joi = require("joi");

// Custom validation helper to reject whitespace-only strings
const noWhitespaceOnly = (value, helpers) => {
  if (value && typeof value === "string" && value.trim() === "") {
    return helpers.error("string.empty");
  }
  return value;
};

const createCompanySchema = Joi.object({
  name: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .required()
    .messages({
      "string.empty": "Company name is required and cannot be empty",
      "any.required": "Company name is required",
    }),
  email: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    .email()
    .required()
    .messages({
      "string.email": "Please enter a valid email address",
      "string.empty": "Company email is required and cannot be empty",
      "any.required": "Company email is required",
    }),
  phone_number: Joi.string()
    .trim()
    .custom(noWhitespaceOnly, "Whitespace Validation")
    // Allow standard international numbers, digits, spaces, dashes
    .pattern(/^\+?[1-9]\d{1,14}$|^[0-9-\s()+]*$/)
    .required()
    .messages({
      "string.pattern.base": "Please enter a valid phone number",
      "string.empty": "Phone number is required and cannot be empty",
      "any.required": "Phone number is required",
    }),
});

module.exports = {
  createCompany: {
    body: createCompanySchema,
  },
};
