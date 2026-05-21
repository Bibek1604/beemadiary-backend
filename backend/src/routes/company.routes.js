const express = require("express");
const router = express.Router();
const companyController = require("../controllers/company.controller");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/rbac.middleware");
const { upload } = require("../utils/cloudinary");
const validate = require("../middlewares/validate.middleware");
const companyValidator = require("../validators/company.validator");

/**
 * @swagger
 * /api/admin/companies:
 *   post:
 *     summary: Create a Company
 *     description: Register a new insurance company with a logo/image. Authorized admin only.
 *     tags:
 *       - Companies
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone_number
 *               - image
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the company
 *                 example: "LIC Nepal"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Unique contact email
 *                 example: "info@licnepal.com"
 *               phone_number:
 *                 type: string
 *                 description: Unique contact phone number
 *                 example: "+9771452299"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: "Image logo file (allowed: jpg, jpeg, png, webp; max size 5MB)"
 *     responses:
 *       201:
 *         description: Company created successfully
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
 *                   example: "Company created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       example: "3b25fbfb-8260-47bf-8f25-ca68bb7d22cc"
 *                     name:
 *                       type: string
 *                       example: "LIC Nepal"
 *                     email:
 *                       type: string
 *                       example: "info@licnepal.com"
 *                     phone_number:
 *                       type: string
 *                       example: "+9771452299"
 *                     image:
 *                       type: string
 *                       example: "https://res.cloudinary.com/duif4cibu/image/upload/v1612345/lic_diary/172782348.png"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2026-05-22T00:15:00.000Z"
 *       400:
 *         description: Validation error, duplicate parameters, or invalid file type.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized. Missing or invalid Bearer JWT.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden. Authenticated user lacks admin permissions.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  "/admin/companies",
  authenticate,
  authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]),
  upload.single("image"),
  validate(companyValidator.createCompany),
  companyController.createCompany
);

module.exports = router;
