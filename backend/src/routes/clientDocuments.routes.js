const express = require("express");
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

// -- Global error routing: auto-wrap every handler so async errors reach the
// global error handler in app.ts (non-destructive; any existing try/catch still runs).
['get', 'post', 'put', 'patch', 'delete'].forEach((_m) => {
  const _orig = router[_m].bind(router);
  router[_m] = (path, ...handlers) =>
    _orig(path, ...handlers.map((h) => (typeof h === 'function' ? asyncHandler(h) : h)));
});
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const logger = require('../utils/logger');
const multer = require("multer");
const { prisma } = require("../config/db");
const { uploadToCloudinary } = require("../utils/cloudinaryHelper");

// Configure Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// All endpoints require authentication
router.use(authMiddleware);

/**
 * POST /api/client/documents
 * Upload documents for a client
 * Required: client_id
 * Files: profile_picture, supporting_documents[], photos[]
 */
/**
 * @swagger
 * /api/client/documents:
 *   post:
 *     summary: Upload client documents
 *     tags: [Client Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 */
router.post(
  "/client/documents",
  upload.fields([
    { name: "profile_picture", maxCount: 1 },
    { name: "supporting_documents", maxCount: 5 },
    { name: "photos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const agentId = req.user?.id;
      const { client_id } = req.body;

      if (!agentId) {
        return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
      }

      if (!client_id?.trim()) {
        return res.status(400).json(ApiResponse.error("Client ID is required", null, 400));
      }

      // Verify client exists and belongs to agent
      const client = await prisma.client.findUnique({
        where: { id: client_id },
      });

      if (!client || client.agent_id !== agentId) {
        return res.status(404).json(ApiResponse.error("Client not found", null, 404));
      }

      const files = req.files || {};
      const uploadFolder = `lic-insurance/client-documents/${client_id}`;
      const uploads = {};

      // Upload profile picture
      if (files.profile_picture?.[0]) {
        try {
          const result = await uploadToCloudinary(
            files.profile_picture[0].buffer,
            `${uploadFolder}/profile`,
            `${client_id}-profile`
          );
          uploads.profile_picture = {
            url: result.resilient_url,
            public_id: result.public_id,
            filename: files.profile_picture[0].originalname,
          };
        } catch (error) {
          logger.error("Profile picture upload failed:", error);
        }
      }

      // Upload supporting documents
      uploads.supporting_documents = [];
      if (files.supporting_documents?.length > 0) {
        for (let i = 0; i < files.supporting_documents.length; i++) {
          try {
            const result = await uploadToCloudinary(
              files.supporting_documents[i].buffer,
              `${uploadFolder}/documents`,
              `${client_id}-doc-${i + 1}`
            );
            uploads.supporting_documents.push({
              url: result.resilient_url,
              public_id: result.public_id,
              filename: files.supporting_documents[i].originalname,
            });
          } catch (error) {
            logger.error(`Document ${i + 1} upload failed:`, error);
          }
        }
      }

      // Upload photos
      uploads.photos = [];
      if (files.photos?.length > 0) {
        for (let i = 0; i < files.photos.length; i++) {
          try {
            const result = await uploadToCloudinary(
              files.photos[i].buffer,
              `${uploadFolder}/photos`,
              `${client_id}-photo-${i + 1}`
            );
            uploads.photos.push({
              url: result.resilient_url,
              public_id: result.public_id,
              filename: files.photos[i].originalname,
            });
          } catch (error) {
            logger.error(`Photo ${i + 1} upload failed:`, error);
          }
        }
      }

      // Persist all uploaded documents to the client record.
      const updateData = {};
      if (uploads.profile_picture) {
        updateData.profile_picture = uploads.profile_picture.url;
        updateData.profile_picture_public_id = uploads.profile_picture.public_id;
      }
      // Append (don't overwrite) any existing docs/photos already on the client
      const existing = client; // we already loaded it above
      const existingDocs = Array.isArray(existing.documents) ? existing.documents : [];
      const existingImages = Array.isArray(existing.images) ? existing.images : [];
      if (uploads.supporting_documents && uploads.supporting_documents.length > 0) {
        updateData.documents = [...existingDocs, ...uploads.supporting_documents];
      }
      if (uploads.photos && uploads.photos.length > 0) {
        updateData.images = [...existingImages, ...uploads.photos];
      }
      if (Object.keys(updateData).length > 0) {
        await prisma.client.update({
          where: { id: client_id },
          data: updateData,
        });
      }

      res.status(200).json(
        ApiResponse.success("Documents uploaded successfully", {
          client_id,
          uploads,
        })
      );
    } catch (error) {
      logger.error("[Upload Documents Error]:", error);
      res.status(500).json(ApiResponse.error("Failed to upload documents", null, 500));
    }
  }
);

module.exports = router;
