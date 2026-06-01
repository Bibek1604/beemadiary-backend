const express = require("express");
const router = express.Router();
const { prisma } = require("../config/db");
const companyController = require("../controllers/company.controller");
const authenticate = require("../middlewares/auth.middleware");
const { authenticateAdmin } = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/rbac.middleware");
const { upload } = require("../utils/cloudinary");
const validate = require("../middlewares/validate.middleware");
const companyValidator = require("../validators/company.validator");
const ApiResponse = require("../utils/apiResponse");

const toIso = (value) => (value ? new Date(value).toISOString() : null);
const normalizeStatus = (value) => String(value || "ACTIVE").toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";

const serializeCompany = (company) => ({
  id: company.id,
  name: company.name,
  email: company.email,
  phone_number: company.phone_number,
  image: company.image,
  status: company.status,
  created_at: toIso(company.created_at),
  updated_at: toIso(company.updated_at),
});

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
  authenticateAdmin,
  authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]),
  upload.single("image"),
  validate(companyValidator.createCompany),
  companyController.createCompany
);

/**
 * @swagger
 * /api/admin/companies:
 *   get:
 *     summary: List companies
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 */
router.get("/admin/companies", authenticateAdmin, authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]), async (_req, res) => {
  const companies = await prisma.company.findMany({ where: { deleted_at: null }, orderBy: { created_at: "desc" } });
  return res.status(200).json(ApiResponse.success("Companies retrieved successfully", companies.map(serializeCompany)));
});

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   get:
 *     summary: Get company by id
 *     tags: [Companies]
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
 *         description: Company retrieved successfully
 */
router.get("/admin/companies/:id", authenticateAdmin, authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company || company.deleted_at) {
    return res.status(404).json(ApiResponse.notFound("Company not found"));
  }
  return res.status(200).json(ApiResponse.success("Company retrieved successfully", serializeCompany(company)));
});

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   patch:
 *     summary: Update company
 *     tags: [Companies]
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
 *         description: Company updated successfully
 */
router.patch("/admin/companies/:id", authenticateAdmin, authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]), upload.single("image"), async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company || company.deleted_at) {
    return res.status(404).json(ApiResponse.notFound("Company not found"));
  }

  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name ?? undefined,
      email: req.body.email ?? undefined,
      phone_number: req.body.phone_number ?? undefined,
      image: req.body.image ?? undefined,
      status: req.body.status === undefined ? undefined : normalizeStatus(req.body.status),
    },
  });

  return res.status(200).json(ApiResponse.success("Company updated successfully", serializeCompany(updated)));
});

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   delete:
 *     summary: Delete company
 *     tags: [Companies]
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
 *         description: Company deleted successfully
 */
router.delete("/admin/companies/:id", authenticateAdmin, authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company || company.deleted_at) {
    return res.status(404).json(ApiResponse.notFound("Company not found"));
  }

  await prisma.company.update({ where: { id: req.params.id }, data: { deleted_at: new Date(), status: "INACTIVE" } });
  return res.status(200).json(ApiResponse.success("Company deleted 