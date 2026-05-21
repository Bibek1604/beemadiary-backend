const Joi = require("joi");

const updateProfile = Joi.object({
  full_name: Joi.string().trim().min(1).required().messages({
    "string.empty": "Full name cannot be empty",
    "any.required": "Full name is required",
  }),
  email: Joi.string().trim().email().required().messages({
    "string.email": "Invalid email format",
    "string.empty": "Email cannot be empty",
    "any.required": "Email is required",
  }),
  phone_number: Joi.string()
    .trim()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      "string.pattern.base": "Phone number must contain only numbers",
      "string.empty": "Phone number cannot be empty",
      "any.required": "Phone number is required",
    }),
  lic_agent_code: Joi.string().trim().allow("").optional(),
  branch_division: Joi.string().trim().allow("").optional(),
  qualification: Joi.string().trim().allow("").optional(),
  position_designation: Joi.string().trim().allow("").optional(),
  short_bio: Joi.string().trim().max(500).allow("").optional().messages({
    "string.max": "Short bio cannot exceed 500 characters",
  }),
});

module.exports = {
  updateProfile,
};
