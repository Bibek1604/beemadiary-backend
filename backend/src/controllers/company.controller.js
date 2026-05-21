const companyService = require("../services/company.service");
const { uploadFile } = require("../utils/cloudinary");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

/**
 * Company Controllers
 */
const createCompany = asyncHandler(async (req, res) => {
  const { name, email, phone_number } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Verify file upload presence
  if (!req.file) {
    return res.status(400).json(
      ApiResponse.error("Validation failed", ["Company image file is required"])
    );
  }

  // Upload file buffer to Cloudinary (or local storage fallback)
  let imageUrl;
  try {
    imageUrl = await uploadFile(req.file);
  } catch (uploadError) {
    const error = new Error("Failed to upload company image");
    error.statusCode = 500;
    error.errors = [uploadError.message || "Cloudinary upload failed"];
    throw error;
  }

  // Delegate creation to service layer
  const company = await companyService.createCompany(
    {
      name,
      email,
      phone_number,
      image: imageUrl,
    },
    req.user.id,
    ipAddress
  );

  return res.status(201).json(
    ApiResponse.success("Company created successfully", {
      id: company.id,
      name: company.name,
      email: company.email,
      phone_number: company.phone_number,
      image: company.image,
      created_at: company.created_at,
    })
  );
});

module.exports = {
  createCompany,
};
