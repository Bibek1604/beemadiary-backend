const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
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
            url: result.secure_url,
            public_id: result.public_id,
            filename: files.profile_picture[0].originalname,
          };
        } catch (error) {
          console.error("Profile picture upload failed:", error.message);
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
              url: result.secure_url,
              public_id: result.public_id,
              filename: files.supporting_documents[i].originalname,
            });
          } catch (error) {
            console.error(`Document ${i + 1} upload failed:`, error.message);
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
              url: result.secure_url,
              public_id: result.public_id,
              filename: files.photos[i].originalname,
            });
          } catch (error) {
            console.error(`Photo ${i + 1} upload failed:`, error.message);
          }
        }
      }

      // Update client with profile picture URL if uploaded
      if (uploads.profile_picture) {
        await prisma.client.update({
          where: { id: client_id },
          data: { profile_picture: uploads.profile_picture.url },
        });
      }

      res.status(200).json(
        ApiResponse.success("Documents uploaded successfully", {
          client_id,
          uploads,
        })
      );
    } catch (error) {
      console.error("[Upload Documents Error]:", error);
      res.status(500).json(ApiResponse.error("Failed to upload documents", null, 500));
    }
  }
);

module.exports = router;
