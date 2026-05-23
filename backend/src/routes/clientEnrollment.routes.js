const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const multer = require("multer");
const { prisma } = require("../config/db");
const { uploadToCloudinary } = require("../utils/cloudinaryHelper");

// Configure Multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only image files are allowed."));
    }
  },
});

const parseMaybeJson = (value, fallback = {}) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
};

const firstValue = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const uploadFileToCloud = async (file, folder, publicId) => {
  const result = await uploadToCloudinary(file.buffer, folder, publicId);
  return {
    url: result.secure_url,
    public_id: result.public_id,
    original_name: file.originalname,
    mime_type: file.mimetype,
    size: file.size,
  };
};

const splitFullName = (fullName) => {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(" ");
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ") || parts[0] || "",
  };
};

const normalizePolicyStatus = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (["ACTIVE", "LAPSED", "EXPIRED", "PENDING"].includes(normalized)) {
    return normalized;
  }

  if (normalized === "INACTIVE") {
    return "PENDING";
  }

  return "PENDING";
};

// All endpoints require authentication
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Client Enrollment
 *   description: Client onboarding and profile management endpoints
 */

/**
 * @swagger
 * /api/client/enroll:
 *   post:
 *     summary: Enroll client with policy
 *     description: Create a client record and linked policy with optional profile picture and document images.
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - email
 *               - phone
 *               - address
 *               - plan_name
 *               - plan_no
 *               - policy_term
 *               - policy_number
 *               - sum_assured
 *               - premium_amount
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: Ram Kumar
 *               email:
 *                 type: string
 *                 format: email
 *                 example: ram@example.com
 *               phone:
 *                 type: string
 *                 example: 9841000000
 *               address:
 *                 type: string
 *                 example: Kathmandu, Nepal
 *               plan_name:
 *                 type: string
 *                 example: Endowment Plan
 *               plan_no:
 *                 type: string
 *                 example: 14
 *               policy_term:
 *                 type: string
 *                 example: 20 years
 *               policy_number:
 *                 type: string
 *                 example: LIC-POL-2026-AB123
 *               sum_assured:
 *                 type: number
 *                 example: 1000000
 *               premium_amount:
 *                 type: number
 *                 example: 25000
 *               personal_profile:
 *                 type: string
 *                 description: JSON string containing personal profile fields.
 *                 example: '{"gender":"male","nominee_name":"Sita"}'
 *               policy_details:
 *                 type: string
 *                 description: JSON string containing policy fields.
 *                 example: '{"premium_due_date":"2026-12-31"}'
 *               profile_picture:
 *                 type: string
 *                 format: binary
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Client enrolled successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to enroll client
 */
router.post(
  "/client/enroll",
  upload.fields([
    { name: "profile_picture", maxCount: 1 },
    { name: "images", maxCount: 10 },
  ]),
  async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found in request", null, 401));
    }

    const personalProfile = parseMaybeJson(req.body.personal_profile || req.body.personalProfile, {});
    const policyDetails = parseMaybeJson(req.body.policy_details || req.body.policyDetails, {});
    const payload = { ...req.body, ...personalProfile, ...policyDetails };

    const firstNameInput = firstValue(payload.first_name, payload.firstName);
    const lastNameInput = firstValue(payload.last_name, payload.lastName);
    let fullName = firstValue(payload.full_name, payload.fullName, payload.name);
    if (!fullName && (firstNameInput || lastNameInput)) {
      fullName = `${firstNameInput} ${lastNameInput}`.trim();
    }
    const { firstName, lastName } = splitFullName(fullName);
    const email = firstValue(payload.email);
    const phone = firstValue(payload.phone, payload.contact_number, payload.contactNumber);
    const address = firstValue(payload.address);
    const secondaryPhone = firstValue(payload.secondary_phone, payload.secondaryContact, payload.secondary_contact);
    const dob = firstValue(payload.dob, payload.date_of_birth, payload.dateOfBirth);
    const age = firstValue(payload.age);
    const gender = firstValue(payload.gender);
    const nomineeName = firstValue(payload.nominee_name, payload.nomineeName);
    const relationWithNominee = firstValue(payload.relation_with_nominee, payload.relationWithNominee);
    const profession = firstValue(payload.profession);
    const memberGroup = firstValue(payload.member_group, payload.memberGroup);
    const reasonForInsurance = firstValue(payload.reason_for_insurance, payload.reasonForInsurance, payload.why_bought, payload.whyBought);

    const planName = firstValue(payload.plan_name, payload.planName);
    const planNo = firstValue(payload.plan_no, payload.planNo);
    const policyTerm = firstValue(payload.policy_term, payload.policyTerm);
    const policyNumberInput = firstValue(payload.policy_number, payload.policyNumber);
    const sumAssured = firstValue(payload.sum_assured, payload.sumAssured);
    const abPwb = firstValue(payload.ab_pwb, payload.abPwb);
    const doc = firstValue(payload.doc);
    const maturityTime = firstValue(payload.maturity_time, payload.maturityTime);
    const premiumAmount = firstValue(payload.premium_amount, payload.premiumAmount);
    const discountScheme = firstValue(payload.discount_scheme, payload.discountScheme);
    const premiumDueDate = firstValue(payload.premium_due_date, payload.payment_due_date, payload.paymentDueDate);
    const bankName = firstValue(payload.bank_name, payload.bankName);
    const bankAccountDetails = firstValue(payload.bank_account_details, payload.bankAccountDetails, payload.bank_account);
    const branch = firstValue(payload.branch);
    const premiumDuePaid = firstValue(payload.premium_due_paid, payload.premiumDuePaid);
    const policyStatusInput = firstValue(payload.policy_status, payload.policyStatus, payload.status);

    const imageLabels = parseMaybeJson(req.body.image_labels || req.body.imageLabels, []);
    const profileFiles = req.files || {};
    const profilePictureFile = profileFiles.profile_picture?.[0] || null;
    const imageFiles = profileFiles.images || [];

    const isValidEmail = (value) => /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
    const isValidPhone = (value) => {
      const digits = value.replace(/\s/g, '').replace(/\D/g, '');
      return digits.length >= 9 && digits.length <= 15;
    };
    const isValidNumber = (value) => {
      const num = parseFloat(String(value));
      return !Number.isNaN(num) && Number.isFinite(num) && num > 0;
    };

    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, company_id: true },
    });
    const fallbackCompany = await prisma.company.findFirst({ select: { id: true } });
    const companyId = agent?.company_id || fallbackCompany?.id || null;

    const errors = [];
    if (!fullName) errors.push("Full name is required");
    else if (fullName.length > 100) errors.push("Full name must not exceed 100 characters");

    if (!email) errors.push("Email is required");
    else if (!isValidEmail(email)) errors.push("Invalid email format");
    else if (email.length > 255) errors.push("Email must not exceed 255 characters");

    if (!phone) errors.push("Phone number is required");
    else if (!isValidPhone(phone)) errors.push("Phone must contain 9-15 digits");

    if (!address) errors.push("Address is required");
    else if (address.length > 255) errors.push("Address must not exceed 255 characters");

    if (secondaryPhone && !isValidPhone(secondaryPhone)) errors.push("Secondary phone must contain 9-15 digits");

    if (dob) {
      const dobDate = new Date(dob);
      if (Number.isNaN(dobDate.getTime())) errors.push("Invalid date of birth format");
      else if (dobDate > new Date()) errors.push("Date of birth cannot be in the future");
    }

    if (age) {
      const ageNum = parseInt(age, 10);
      if (Number.isNaN(ageNum) || ageNum < 0 || ageNum > 120) {
        errors.push("Age must be a valid non-negative number up to 120");
      }
    }

    if (gender?.trim()) {
      const validGenders = ["male", "female", "other"];
      if (!validGenders.includes(gender.trim().toLowerCase())) {
        errors.push("Gender must be one of: male, female, other");
      }
    }

    if (premiumDueDate) {
      const dueDate = new Date(premiumDueDate);
      if (Number.isNaN(dueDate.getTime())) errors.push("Premium due date must be a valid date");
    }

    if (doc) {
      const docDate = new Date(doc);
      if (Number.isNaN(docDate.getTime())) errors.push("DOC must be a valid date");
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error("Validation failed", errors, 400));
    }

    const clientId = `LIC-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const uploadFolderBase = `lic-insurance/client-enrollment/${clientId}`;

    const imageUploads = await Promise.all(
      imageFiles.map((file, index) =>
        uploadFileToCloud(file, `${uploadFolderBase}/images`, `${clientId}-image-${index + 1}`).then((result) => ({
          label: imageLabels[index] || file.originalname,
          ...result,
        }))
      )
    );

    const profilePictureUpload = profilePictureFile
      ? await uploadFileToCloud(profilePictureFile, `${uploadFolderBase}/profile-picture`, `${clientId}-profile-picture`)
      : null;

    const existing = await prisma.client.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (existing) {
      return res.status(400).json(ApiResponse.error("Email or phone already registered", null, 400));
    }

    const clientData = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      address,
      agent_id: agentId,
      secondary_phone: secondaryPhone || null,
      dob: dob ? new Date(dob) : null,
      age: age ? parseInt(age, 10) : null,
      gender: gender || null,
      nominee_name: nomineeName || null,
      relation_with_nominee: relationWithNominee || null,
      profession: profession || null,
      member_group: memberGroup || null,
      reason_for_insurance: reasonForInsurance || null,
      profile_picture: profilePictureUpload?.url || null,
      profile_picture_public_id: profilePictureUpload?.public_id || null,
    };

    const client = await prisma.client.create({ data: clientData });

    // ── Create Policy if policy data is provided ──
    let policyRecord = null;
    const policyDataToCreate = {
      client_id: client.id,
      agent_id: agentId,
    };

    // Add policy fields if provided
    if (planName?.trim()) policyDataToCreate.plan_name = planName.trim();
    if (planNo?.trim()) policyDataToCreate.plan_no = planNo.trim();
    if (policyNumberInput?.trim()) policyDataToCreate.policy_number = policyNumberInput.trim();
    else policyDataToCreate.policy_number = `LIC-POL-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    if (policyTerm?.trim()) policyDataToCreate.policy_term = policyTerm.trim();
    if (sumAssured && isValidNumber(sumAssured)) policyDataToCreate.sum_assured = parseFloat(sumAssured);
    if (premiumAmount && isValidNumber(premiumAmount)) policyDataToCreate.premium_amount = parseFloat(premiumAmount);
    if (abPwb?.trim()) policyDataToCreate.ab_pwb = abPwb.trim();
    if (doc) {
      const docDate = new Date(doc);
      if (!Number.isNaN(docDate.getTime())) policyDataToCreate.doc = doc;
    }
    if (maturityTime?.trim()) policyDataToCreate.maturity_time = maturityTime.trim();
    if (discountScheme?.trim()) policyDataToCreate.discount_scheme = discountScheme.trim();
    if (premiumDueDate?.trim()) policyDataToCreate.premium_due_date = premiumDueDate.trim();
    if (bankName?.trim()) policyDataToCreate.bank_name = bankName.trim();
    if (bankAccountDetails?.trim()) policyDataToCreate.bank_account = bankAccountDetails.trim();
    if (branch?.trim()) policyDataToCreate.bank_branch = branch.trim();
    if (policyStatusInput?.trim()) {
      const status = policyStatusInput.trim().toUpperCase();
      if (["ACTIVE", "INACTIVE", "PENDING", "LAPSED", "EXPIRED"].includes(status)) {
        policyDataToCreate.policy_status = status;
      } else {
        policyDataToCreate.policy_status = "PENDING";
      }
    } else {
      policyDataToCreate.policy_status = "PENDING";
    }

    // Create policy only if policy details are provided
    if (Object.keys(policyDataToCreate).length > 3) { // More than just client_id, agent_id, policy_number, policy_status
      try {
        policyRecord = await prisma.policy.create({ data: policyDataToCreate });
      } catch (policyError) {
        console.warn("[Client Enroll] Policy creation failed (non-blocking):", policyError.message);
      }
    }

    const cleanRecord = (record) =>
      Object.fromEntries(Object.entries(record).filter(([_, value]) => value !== null && value !== undefined && value !== ""));

    return res.status(201).json(
      ApiResponse.success("Client enrolled successfully", {
        data: cleanRecord(client),
        client_id: client.id,
        policy: policyRecord ? cleanRecord(policyRecord) : null,
        uploads: {
          profile_picture: profilePictureUpload,
          images: imageUploads,
        },
      })
    );
  } catch (error) {
    console.error("[Client Enroll Error]:", error);
    return res.status(500).json(ApiResponse.error("Failed to enroll client", null, 500));
  }
});

/**
 * @swagger
 * /api/client/search:
 *   get:
 *     summary: Search clients
 *     description: Search authenticated agent's clients by id, name, phone, or email.
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term
 *         example: ram
 *     responses:
 *       200:
 *         description: Clients found
 *       400:
 *         description: Search query is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to search clients
 */
router.get("/client/search", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { query } = req.query;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    if (!query?.trim()) {
      return res.status(400).json(
        ApiResponse.error("Search query is required", null, 400)
      );
    }

    const searchTerm = query.trim().toLowerCase();

    // Build search query - handle wildcard and normal searches
    let whereClause = {
      agent_id: agentId,
    };

    // If search term is "*" (wildcard), get all clients
    if (searchTerm !== "*") {
      whereClause.OR = [
        { first_name: { contains: searchTerm, mode: "insensitive" } },
        { last_name: { contains: searchTerm, mode: "insensitive" } },
        { phone: { contains: searchTerm, mode: "insensitive" } },
        { email: { contains: searchTerm, mode: "insensitive" } },
        { client_id: { contains: searchTerm, mode: "insensitive" } },
      ];
    }

    const clients = await prisma.client.findMany({
      where: whereClause,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        status: true,
        client_id: true,
      },
      take: 50,
    });

    res.status(200).json(
      ApiResponse.success("Clients found", clients)
    );
  } catch (error) {
    console.error("[Client Search Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to search clients", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/client/{clientId}:
 *   get:
 *     summary: Get client details
 *     description: Get a single client and linked policies by client id.
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *     responses:
 *       200:
 *         description: Client details retrieved
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Unauthorized to view this client
 *       404:
 *         description: Client not found
 *       500:
 *         description: Failed to get client details
 */
router.get("/client/:clientId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { clientId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { policies: true },
    });

    if (!client) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.agent_id !== agentId && req.user?.role !== "admin") {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to view this client", null, 403)
      );
    }

    // Filter out null values
    const responseData = Object.fromEntries(
      Object.entries(client).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Client details retrieved", responseData)
    );
  } catch (error) {
    console.error("[Get Client Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to get client details", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/client/{clientId}:
 *   put:
 *     summary: Update client details
 *     description: Update selected fields of a client record.
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phone:
 *                 type: string
 *               secondary_phone:
 *                 type: string
 *               address:
 *                 type: string
 *               dob:
 *                 type: string
 *                 format: date
 *               age:
 *                 type: integer
 *               gender:
 *                 type: string
 *               nominee_name:
 *                 type: string
 *               relation_with_nominee:
 *                 type: string
 *               profession:
 *                 type: string
 *               member_group:
 *                 type: string
 *               reason_for_insurance:
 *                 type: string
 *     responses:
 *       200:
 *         description: Client updated successfully
 *       400:
 *         description: No valid fields to update
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Unauthorized to update this client
 *       404:
 *         description: Client not found
 *       500:
 *         description: Failed to update client
 */
router.put("/client/:clientId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { clientId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Verify ownership
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.agent_id !== agentId && req.user?.role !== "admin") {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to update this client", null, 403)
      );
    }

    // Build update data - only non-empty values
    const updateData = {};
    const allowedFields = [
      "first_name", "last_name", "email", "phone", "secondary_phone",
      "address", "dob", "age", "gender", "nominee_name",
      "relation_with_nominee", "profession", "member_group", "reason_for_insurance"
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== "") {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(
        ApiResponse.error("No valid fields to update", null, 400)
      );
    }

    const updated = await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });

    // Filter out null values
    const responseData = Object.fromEntries(
      Object.entries(updated).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Client updated successfully", responseData)
    );
  } catch (error) {
    console.error("[Update Client Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to update client", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/client/{clientId}:
 *   delete:
 *     summary: Delete / deactivate client (PIN-verified)
 *     description: Soft-deletes a client record. If the agent has set a `security_pin`, it must be passed as query param `pin`.
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *         description: Client identifier
 *       - in: query
 *         name: pin
 *         required: false
 *         schema:
 *           type: string
 *           example: "1234"
 *         description: Agent's 4-digit security PIN (required if agent has set one)
 *     responses:
 *       200:
 *         description: Client deleted / deactivated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Invalid security PIN
 *       404:
 *         description: Client not found
 *       500:
 *         description: Failed to delete client
 */
router.delete("/client/:clientId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { clientId } = req.params;
    const { pin } = req.query; // Optional PIN from query params

    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    });

    if (!client) {
      return res.status(404).json(ApiResponse.error("Client not found", null, 404));
    }

    // Verify ownership
    if (client.agent_id !== agentId && req.user?.role !== "admin") {
      return res.status(403).json(ApiResponse.error("Unauthorized to delete this client", null, 403));
    }

    // If the client record has a security_pin set, require PIN before deletion
    if (client.security_pin && pin !== client.security_pin) {
      return res.status(403).json(
        ApiResponse.error("Invalid security PIN", null, 403)
      );
    }

    await prisma.client.update({
      where: { id: clientId },
      data: { deleted_at: new Date(), status: "INACTIVE" },
    });

    res.status(200).json(
      ApiResponse.success("Client deleted / deactivated successfully", { client_id: clientId })
    );
  } catch (error) {
    console.error("[Delete Client Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to delete client", null, 500)
    );
  }
});

module.exports = router;
