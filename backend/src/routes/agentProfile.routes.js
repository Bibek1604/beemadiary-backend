const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const multer = require("multer");
const { uploadToCloudinary, deleteFromCloudinary } = require("../utils/cloudinaryHelper");
const { prisma } = require("../config/db");
const console = {
  log() {},
  error() {},
  warn() {},
};

// Configure Multer for image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only image files are allowed."));
    }
  },
});

// All endpoints require authentication
router.use(authMiddleware);

/**
 * GET /api/agent/profile
 * Get current agent's profile
 */
/**
 * @swagger
 * /api/agent/profile:
 *   get:
 *     summary: Get agent profile
 *     tags: [Agent Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent profile retrieved successfully
 */
// Aliases: /api/me and /api/agent/me (used by the agent frontend auth flow)
router.get(["/agent/profile", "/agent/me", "/me"], async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found in request", null, 401)
      );
    }

    // Query database for agent profile - get all fields
    const profile = await prisma.agent.findUnique({
      where: { id: userId }
    });

    if (!profile) {
      return res.status(404).json(
        ApiResponse.error("Agent profile not found", null, 404)
      );
    }

    // Filter out null/undefined values for cleaner response
    const cleanedProfile = Object.fromEntries(
      Object.entries(profile).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    // Attach the company assigned by the admin (read-only for the agent) so the
    // settings page can display it. Best-effort: never fail the profile load.
    if (profile.company_id) {
      try {
        const company = await prisma.company.findUnique({ where: { id: profile.company_id } });
        if (company) {
          cleanedProfile.company = {
            id: company.id,
            name: company.name,
            email: company.email,
            phone_number: company.phone_number,
            address: company.address,
          };
          cleanedProfile.company_name = company.name;
        }
      } catch (_e) {
        // ignore — company is optional context
      }
    }

    res.status(200).json(
      ApiResponse.success("Agent profile retrieved successfully", cleanedProfile)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to retrieve agent profile", null, 500)
    );
  }
});

/**
 * POST /api/agent/profile
 * Create or update agent profile (with optional image upload)
 */
/**
 * @swagger
 * /api/agent/profile:
 *   post:
 *     summary: Create or update agent profile
 *     tags: [Agent Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent profile updated successfully
 */
router.post("/agent/profile", upload.single("image"), async (req, res) => {
  try {
    const userId = req.user?.id;
    const {
      full_name,
      email,
      phone_number,
      license_number,
      license_expiry,
      branch,
      designation,
      qualification,
      bio,
      years_of_experience,
      specialization,
      profile_image_url,
    } = req.body;

    if (!userId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    // Validate required fields - no null, no empty strings
    if (!full_name || !full_name.trim()) {
      return res.status(400).json(ApiResponse.error("Full name is required and cannot be empty", null, 400));
    }

    // Validate optional fields
    if (phone_number && phone_number.trim()) {
      if (!isValidPhone(phone_number.trim())) {
        return res.status(400).json(ApiResponse.error("Invalid phone number format", null, 400));
      }
    }

    if (license_number && license_number.trim()) {
      if (!isValidLicenseNumber(license_number.trim())) {
        return res.status(400).json(ApiResponse.error("Invalid license number format", null, 400));
      }
    }

    // Build updateData directly for Prisma update
    const updateData = {
      full_name: full_name.trim(),
    };

    // Email: prefer the value submitted in the form, fall back to the token's email
    if (email && email.trim()) {
      updateData.email = email.trim();
    } else if (req.user?.email) {
      updateData.email = req.user.email;
    }

    // Add optional fields only if they have values
    if (phone_number && phone_number.trim()) updateData.phone_number = phone_number.trim();
    if (license_number && license_number.trim()) updateData.lic_agent_code = license_number.trim();
    if (license_expiry) updateData.license_expiry = new Date(license_expiry);
    if (branch && branch.trim()) updateData.branch_division = branch.trim();
    if (designation && designation.trim()) updateData.position_designation = designation.trim();
    if (qualification && qualification.trim()) updateData.qualification = qualification.trim();
    if (bio && bio.trim()) updateData.short_bio = bio.trim();
    if (years_of_experience) updateData.years_of_experience = years_of_experience;
    if (specialization && specialization.trim()) updateData.specialization = specialization.trim();

    // Handle image upload if included in request
    if (req.file) {
      try {
        const cloudinaryResult = await uploadToCloudinary(
          req.file.buffer,
          `lic-insurance/agent-profiles/${userId}`,
          `agent-profile-${userId}`
        );
        updateData.profile_picture = cloudinaryResult.secure_url;
        updateData.profile_picture_public_id = cloudinaryResult.public_id;
      } catch (cloudinaryError) {
        console.error('Image upload error in profile update:', cloudinaryError.message);
        return res.status(400).json(
          ApiResponse.error(
            `Image upload failed: ${cloudinaryError.message}`,
            null,
            400
          )
        );
      }
    }

    // Check if agent exists
    const existingAgent = await prisma.agent.findUnique({
      where: { id: userId }
    });

    let savedProfile;
    if (existingAgent) {
      // Agent exists - just update
      savedProfile = await prisma.agent.update({
        where: { id: userId },
        data: updateData
      });
    } else {
      // Agent doesn't exist - create (this shouldn't happen in normal flow)
      return res.status(400).json(
        ApiResponse.error("Agent profile not found. Please contact support.", null, 400)
      );
    }

    // Filter out null values for response
    const cleanedResponse = Object.fromEntries(
      Object.entries(savedProfile).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Agent profile updated successfully", cleanedResponse)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to update agent profile", null, 500)
    );
  }
});

/**
 * PUT /api/agent/profile/:id
 * Update specific profile fields
 */
/**
 * @swagger
 * /api/agent/profile/{id}:
 *   put:
 *     summary: Update agent profile by id
 *     tags: [Agent Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Agent profile updated successfully
 */
router.put("/agent/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (id !== userId && !["ADMIN", "SUPER_ADMIN"].includes(String(req.user?.role || req.user?.type || "").toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to update this profile", null, 403)
      );
    }

    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json(ApiResponse.error("Agent profile not found", null, 404));
    }

    const updateData = mapAgentProfileBody(req.body);

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(ApiResponse.error("No valid fields to update", null, 400));
    }

    const saved = await prisma.agent.update({ where: { id }, data: updateData });

    const cleaned = Object.fromEntries(
      Object.entries(saved).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Agent profile updated successfully", cleaned)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to update agent profile", null, 500)
    );
  }
});

/**
 * PATCH /api/profile/update
 * Update the authenticated agent's own profile (JSON or multipart with `image`).
 * Mirrors POST /api/agent/profile but is partial — only provided fields change.
 */
router.patch("/profile/update", upload.single("image"), async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const existing = await prisma.agent.findUnique({ where: { id: userId } });
    if (!existing) {
      return res.status(404).json(ApiResponse.error("Agent profile not found", null, 404));
    }

    const updateData = mapAgentProfileBody(req.body);

    // Optional image upload
    if (req.file) {
      try {
        const cloudinaryResult = await uploadToCloudinary(
          req.file.buffer,
          `lic-insurance/agent-profiles/${userId}`,
          `agent-profile-${userId}`
        );
        updateData.profile_picture = cloudinaryResult.secure_url;
        updateData.profile_picture_public_id = cloudinaryResult.public_id;
      } catch (cloudinaryError) {
        return res.status(400).json(
          ApiResponse.error(`Image upload failed: ${cloudinaryError.message}`, null, 400)
        );
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(ApiResponse.error("No valid fields to update", null, 400));
    }

    const saved = await prisma.agent.update({ where: { id: userId }, data: updateData });

    const cleaned = Object.fromEntries(
      Object.entries(saved).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Agent profile updated successfully", cleaned)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to update agent profile", null, 500)
    );
  }
});

/**
 * DELETE /api/agent/profile/:id
 * Delete or deactivate own agent profile (requires matching security PIN)
 */
/**
 * @swagger
 * /api/agent/profile/{id}:
 *   delete:
 *     summary: Delete agent profile by id
 *     tags: [Agent Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Profile deleted / deactivated successfully
 */
router.delete("/agent/profile/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { pin } = req.query; // PIN passed as query param from delete confirmation modal

    if (id !== userId && !["ADMIN", "SUPER_ADMIN"].includes(String(req.user?.role || req.user?.type || "").toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to delete this profile", null, 403)
      );
    }

    const profile = await prisma.agent.findUnique({ where: { id: userId } });
    if (!profile) {
      return res.status(404).json(ApiResponse.error("Profile not found", null, 404));
    }

    // If PIN is set, require it to be passed and match
    if (profile.security_pin && pin !== profile.security_pin) {
      return res.status(403).json(ApiResponse.error("Invalid security PIN", null, 403));
    }

    // If no PIN is set yet, allow deletion (first-time deactivation without PIN)
    await prisma.agent.update({
      where: { id: userId },
      data: {
        deleted_at: new Date(),
        status: "INACTIVE",
        // If a new PIN was sent, save it first
        ...(pin && !profile.security_pin ? { security_pin: String(pin) } : {}),
      }
    });

    res.status(200).json(
      ApiResponse.success("Profile deleted / deactivated successfully", { id: userId })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to delete agent profile", null, 500)
    );
  }
});

/**
 * POST /api/agent/profile/upload-image
 * Upload agent profile image to Cloudinary
 */
/**
 * @swagger
 * /api/agent/profile/upload-image:
 *   post:
 *     summary: Upload agent profile image
 *     tags: [Agent Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 */
router.post("/agent/profile/upload-image", upload.single("image"), async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    if (!req.file) {
      return res.status(400).json(ApiResponse.error("No image file provided", null, 400));
    }

    // Validate file type
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json(
        ApiResponse.error("Invalid image format. Allowed: JPEG, PNG, WebP, GIF", null, 400)
      );
    }

    // Validate file size (max 5MB)
    const maxSizeMB = 5;
    if (req.file.size > maxSizeMB * 1024 * 1024) {
      return res.status(400).json(
        ApiResponse.error(`Image size must be less than ${maxSizeMB}MB`, null, 400)
      );
    }

    // Upload to Cloudinary
    let cloudinaryResult;
    try {
      cloudinaryResult = await uploadToCloudinary(
        req.file.buffer,
        `lic-insurance/agent-profiles/${userId}`,
        `agent-profile-${userId}`
      );
    } catch (cloudinaryError) {
      console.error('Image upload error:', cloudinaryError.message);
      return res.status(400).json(
        ApiResponse.error(
          `Image upload failed: ${cloudinaryError.message}`,
          null,
          400
        )
      );
    }

    // Store public_id and url in database
    const agent = await prisma.agent.upsert({
      where: { id: userId },
      create: {
        id: userId,
        profile_picture: cloudinaryResult.secure_url,
        profile_picture_public_id: cloudinaryResult.public_id,
      },
      update: {
        profile_picture: cloudinaryResult.secure_url,
        profile_picture_public_id: cloudinaryResult.public_id,
      }
    });

    res.status(200).json(
      ApiResponse.success("Image uploaded successfully", {
        image_url: cloudinaryResult.secure_url,
        public_id: cloudinaryResult.public_id,
        file_size: req.file.size,
        file_type: req.file.mimetype,
        upload_provider: 'Cloudinary',
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to upload image", null, 500)
    );
  }
});

/**
 * DELETE /api/agent/profile/profile-image
 * Delete agent profile image from Cloudinary
 */
/**
 * @swagger
 * /api/agent/profile/profile-image:
 *   delete:
 *     summary: Delete agent profile image
 *     tags: [Agent Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Image deleted successfully
 */
router.delete("/agent/profile/profile-image", async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    // Get public_id from database
    const agent = await prisma.agent.findUnique({ where: { id: userId } });
    if (!agent?.profile_picture_public_id) {
      return res.status(404).json(ApiResponse.error("No image to delete", null, 404));
    }

    // Delete from Cloudinary
    const deleteResult = await deleteFromCloudinary(agent.profile_picture_public_id);

    // Update database to remove image references
    await prisma.agent.update({
      where: { id: userId },
      data: {
        profile_picture: null,
        profile_picture_public_id: null,
      }
    });

    res.status(200).json(
      ApiResponse.success("Image deleted successfully", null)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to delete image", null, 500)
    );
  }
});

// ── Helpers ──
/**
 * Map an incoming profile body (accepts both DB column names and the
 * frontend-friendly aliases) to a clean Prisma update object. Only keys with
 * a real value are included, so updates are always partial/non-destructive.
 */
function mapAgentProfileBody(body = {}) {
  const data = {};
  const setStr = (col, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      data[col] = String(value).trim();
    }
  };

  setStr("full_name", body.full_name ?? body.name);
  setStr("email", body.email);
  setStr("phone_number", body.phone_number ?? body.phone);
  setStr("lic_agent_code", body.lic_agent_code ?? body.license_number);
  setStr("agent_code", body.agent_code);
  setStr("branch_division", body.branch_division ?? body.branch);
  setStr("position_designation", body.position_designation ?? body.designation);
  setStr("qualification", body.qualification);
  setStr("short_bio", body.short_bio ?? body.bio);
  setStr("specialization", body.specialization);

  if (body.years_of_experience !== undefined && body.years_of_experience !== null && body.years_of_experience !== "") {
    data.years_of_experience = body.years_of_experience;
  }
  if (body.license_expiry) {
    const d = new Date(body.license_expiry);
    if (!isNaN(d.getTime())) data.license_expiry = d;
  }
  if (body.profile_image_url && String(body.profile_image_url).trim()) {
    data.profile_picture = String(body.profile_image_url).trim();
  }

  return data;
}

// ── Validation Helpers ──
function isValidPhone(phone) {
  const phoneRegex = /^[\d\s\-\+\(\)]{10,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ""));
}

function isValidLicenseNumber(license) {
  // Accept any alphanumeric string (3+ characters)
  return license && license.length >= 3;
}

function getFileExtension(mimeType) {
  const mimeMap = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return mimeMap[mimeType] || ".jpg";
}

module.exports = router;
