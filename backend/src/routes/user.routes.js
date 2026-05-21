const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const validate = require("../middlewares/validate.middleware");
const userValidator = require("../validators/user.validator");
const { verifyToken, requireRole } = require("../middlewares/auth.middleware");
const { upload } = require("../utils/cloudinary");

/**
 * @swagger
 * tags:
 *   name: User Profile
 *   description: "Agent profile management endpoints"
 */

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get Current Logged-in User Profile
 *     description: "Retrieve account info, personal info, professional info, and profile image. Authorized agent only."
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Profile fetched successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     agent_code:
 *                       type: string
 *                     role:
 *                       type: string
 *                     email:
 *                       type: string
 *                     platform:
 *                       type: string
 *                     profile:
 *                       type: object
 *                       properties:
 *                         full_name:
 *                           type: string
 *                         phone_number:
 *                           type: string
 *                         lic_agent_code:
 *                           type: string
 *                         branch_division:
 *                           type: string
 *                         qualification:
 *                           type: string
 *                         position_designation:
 *                           type: string
 *                         short_bio:
 *                           type: string
 *                         profile_picture:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an agent
 *       404:
 *         description: Profile not found
 */
router.get(
  "/users/me",
  verifyToken,
  requireRole("AGENT"),
  userController.getProfile
);

/**
 * @swagger
 * /api/users/me:
 *   put:
 *     summary: Update Current User Profile
 *     description: "Update text fields and/or profile picture. Requires multipart/form-data. Authorized agent only."
 *     tags: [User Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               lic_agent_code:
 *                 type: string
 *               branch_division:
 *                 type: string
 *               qualification:
 *                 type: string
 *               position_designation:
 *                 type: string
 *               short_bio:
 *                 type: string
 *               profile_picture:
 *                 type: string
 *                 format: binary
 *             required:
 *               - full_name
 *               - email
 *               - phone_number
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Profile updated successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Not an agent
 *       404:
 *         description: Profile not found
 */
router.put(
  "/users/me",
  verifyToken,
  requireRole("AGENT"),
  upload.single("profile_picture"),
  validate(userValidator.updateProfile, "body"),
  userController.updateProfile
);

module.exports = router;
