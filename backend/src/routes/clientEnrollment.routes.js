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
 * /api/clients:
 *   get:
 *     summary: Get ALL clients (no parameters)
 *     description: Fetch all clients for the authenticated agent with their policies. No query parameters needed!
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All clients retrieved successfully
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
 *                   example: "All clients retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total_clients:
 *                           type: integer
 *                           example: 5
 *                         clients_with_policies:
 *                           type: integer
 *                           example: 3
 *                         clients_without_policies:
 *                           type: integer
 *                           example: 2
 *                         total_policies:
 *                           type: integer
 *                           example: 3
 *                     clients:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Internal UUID
 *                             example: "51911abe-4965-4526-a7ac-9dec2602e7b1"
 *                           client_id:
 *                             type: string
 *                             description: Random numeric BM formatted client ID (BM-{12 digits}) - USE THIS FOR DISPLAY
 *                             example: "BM-987654321012"
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           phone:
 *                             type: string
 *                           status:
 *                             type: string
 *                           policies:
 *                             type: array
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Failed to get clients
 */
router.get("/clients", async (req, res) => {
  try {
    const agentId = req.user?.id;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Fetch ALL clients with their policies
    const clients = await prisma.client.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      include: {
        policies: {
          where: { deleted_at: null },
          orderBy: { created_at: "desc" },
        },
      },
      orderBy: { created_at: "desc" },
      take: 1000, // Get up to 1000 clients
    });

    // Count statistics
    const stats = {
      total_clients: clients.length,
      clients_with_policies: clients.filter((c) => c.policies?.length > 0).length,
      clients_without_policies: clients.filter((c) => !c.policies || c.policies.length === 0).length,
      total_policies: clients.reduce((sum, c) => sum + (c.policies?.length || 0), 0),
    };

    res.status(200).json(
      ApiResponse.success("All clients retrieved", {
        stats,
        clients: clients,
      })
    );
  } catch (error) {
    console.error("[Get All Clients Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to get all clients", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/clients/all/detailed:
 *   get:
 *     summary: Get ALL clients with COMPLETE details
 *     description: Fetch all clients with complete information including all policy details and bank information. Includes client_id (LIC format).
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All clients with detailed information retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_count:
 *                       type: integer
 *                       example: 5
 *                     clients:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             description: Internal UUID
 *                           client_id:
 *                             type: string
 *                             description: "Random numeric BM formatted ID (e.g., BM-987654321012) - USE FOR DISPLAY"
 *                             example: "BM-987654321012"
 *                           full_name:
 *                             type: string
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           phone:
 *                             type: string
 *                           address:
 *                             type: string
 *                           dob:
 *                             type: string
 *                             format: date
 *                           gender:
 *                             type: string
 *                           nominee_name:
 *                             type: string
 *                           policies_count:
 *                             type: integer
 *                           policies:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 policy_number:
 *                                   type: string
 *                                 plan_name:
 *                                   type: string
 *                                 premium_amount:
 *                                   type: number
 *                                 sum_assured:
 *                                   type: number
 *                                 bank_name:
 *                                   type: string
 *                                 bank_account:
 *                                   type: string
 *                                 branch:
 *                                   type: string
 *                                 status:
 *                                   type: string
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Failed to get clients
 */
router.get("/clients/all/detailed", async (req, res) => {
  try {
    const agentId = req.user?.id;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    const clients = await prisma.client.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      include: {
        policies: {
          where: { deleted_at: null },
          orderBy: { created_at: "desc" },
        },
      },
      orderBy: { created_at: "desc" },
      take: 1000,
    });

    // Format response with all details
    const detailedClients = clients.map((client) => ({
      id: client.id,
      client_id: client.client_id,
      full_name: `${client.first_name} ${client.last_name}`,
      first_name: client.first_name,
      last_name: client.last_name,
      email: client.email,
      phone: client.phone,
      secondary_phone: client.secondary_phone,
      address: client.address,
      dob: client.dob,
      age: client.age,
      gender: client.gender,
      profession: client.profession,
      member_group: client.member_group,
      nominee_name: client.nominee_name,
      relation_with_nominee: client.relation_with_nominee,
      reason_for_insurance: client.reason_for_insurance,
      profile_picture: client.profile_picture,
      status: client.status,
      policies_count: client.policies?.length || 0,
      policies: client.policies?.map((p) => ({
        id: p.id,
        policy_number: p.policy_number,
        plan_name: p.plan_name,
        plan_no: p.plan_no,
        premium_amount: p.premium_amount,
        sum_assured: p.sum_assured,
        bank_name: p.bank_name,
        bank_account: p.bank_account,
        branch: p.branch,
        premium_due_date: p.premium_due_date,
        doc: p.doc,
        maturity_time: p.maturity_time,
        status: p.status,
        created_at: p.created_at,
      })) || [],
      created_at: client.created_at,
      updated_at: client.updated_at,
    }));

    res.status(200).json(
      ApiResponse.success("All clients with detailed information retrieved", {
        total_count: detailedClients.length,
        clients: detailedClients,
      })
    );
  } catch (error) {
    console.error("[Get All Clients Detailed Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to get all clients", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/client/enroll:
 *   post:
 *     summary: Enroll client with complete policy and bank details
 *     description: Create a client record with full personal info, policy details, and bank account information.
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - email
 *               - phone
 *               - address
 *               - plan_name
 *               - plan_no
 *               - premium_amount
 *             properties:
 *               full_name:
 *                 type: string
 *                 description: Client full name (First Last)
 *                 example: "Ram Kumar Singh"
 *               first_name:
 *                 type: string
 *                 description: First name (alternative to full_name)
 *                 example: "Ram"
 *               last_name:
 *                 type: string
 *                 description: Last name (alternative to full_name)
 *                 example: "Kumar"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Client email address (must be unique)
 *                 example: "ram.kumar@example.com"
 *               phone:
 *                 type: string
 *                 pattern: "^[0-9]{10}$"
 *                 description: Primary phone number - exactly 10 numeric digits only (must be unique)
 *                 example: "9841234567"
 *               secondary_phone:
 *                 type: string
 *                 pattern: "^[0-9]{10}$"
 *                 description: Secondary phone number - exactly 10 numeric digits only (optional)
 *                 example: "9841234568"
 *               address:
 *                 type: string
 *                 description: Residential address
 *                 example: "Kathmandu, Nepal"
 *               dob:
 *                 type: string
 *                 format: date
 *                 description: Date of birth
 *                 example: "1990-05-15"
 *               age:
 *                 type: integer
 *                 description: Age in years
 *                 example: 35
 *               gender:
 *                 type: string
 *                 enum: [male, female, other]
 *                 example: "male"
 *               profession:
 *                 type: string
 *                 description: Professional occupation
 *                 example: "Engineer"
 *               member_group:
 *                 type: string
 *                 description: Member group or category
 *                 example: "Corporate"
 *               nominee_name:
 *                 type: string
 *                 description: Name of insurance nominee
 *                 example: "Sita Singh"
 *               relation_with_nominee:
 *                 type: string
 *                 description: Relationship with nominee
 *                 example: "Wife"
 *               reason_for_insurance:
 *                 type: string
 *                 description: Reason for buying insurance
 *                 example: "Financial Security"
 *               plan_name:
 *                 type: string
 *                 description: Insurance plan name
 *                 example: "Endowment Plan"
 *               plan_no:
 *                 type: string
 *                 description: Plan number
 *                 example: "14"
 *               policy_term:
 *                 type: string
 *                 description: Policy term duration
 *                 example: "20 years"
 *               policy_number:
 *                 type: string
 *                 description: Policy number (will be auto-generated if not provided)
 *                 example: "POL-2026-001"
 *               sum_assured:
 *                 type: number
 *                 description: Coverage amount
 *                 example: 1000000
 *               premium_amount:
 *                 type: number
 *                 description: Annual premium amount
 *                 example: 25000
 *               ab_pwb:
 *                 type: string
 *                 description: Additional benefit or PWB code (optional)
 *                 example: "AB-001"
 *               discount_scheme:
 *                 type: string
 *                 description: Discount scheme code or percentage (optional)
 *                 example: "5% Corporate Discount"
 *               doc:
 *                 type: string
 *                 format: date
 *                 description: Date of commencement (optional)
 *                 example: "2026-05-25"
 *               maturity_time:
 *                 type: string
 *                 format: date
 *                 description: Policy maturity date (optional)
 *                 example: "2046-05-25"
 *               policy_status:
 *                 type: string
 *                 enum: [ACTIVE, PENDING, LAPSED, EXPIRED]
 *                 description: Policy status
 *                 example: "ACTIVE"
 *               bank_name:
 *                 type: string
 *                 description: Bank name for premium payment
 *                 example: "Nepal Bank Limited"
 *               bank_account:
 *                 type: string
 *                 pattern: "^[0-9]+$"
 *                 description: Bank account number - numeric digits only (no letters or special characters)
 *                 example: "1234567890"
 *               branch:
 *                 type: string
 *                 description: Bank branch name
 *                 example: "Kathmandu Main Branch"
 *               premium_due_date:
 *                 type: string
 *                 format: date
 *                 description: Premium payment due date
 *                 example: "2026-12-31"
 *               premium_due_paid:
 *                 type: string
 *                 description: Premium payment status
 *                 example: "PAID"
 *     responses:
 *       201:
 *         description: Client enrolled successfully
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
 *                   example: "Client enrolled successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     client_id:
 *                       type: string
 *                       example: "BM-987654321012"
 *                       description: Auto-generated random numeric client ID
 *                     client:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "51911abe-4965-4526-a7ac-9dec2602e7b1"
 *                         client_id:
 *                           type: string
 *                           example: "BM-987654321012"
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
      // Only numeric, exactly 10 digits
      const digits = String(value).replace(/\D/g, '');
      return digits.length === 10;
    };
    const isValidBankAccount = (value) => {
      // Only numeric digits, no letters or special characters
      const digits = String(value).replace(/\D/g, '');
      return digits === String(value).trim() && digits.length > 0 && digits.length <= 20;
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
    else if (!isValidPhone(phone)) errors.push("Phone must be exactly 10 numeric digits");

    if (!address) errors.push("Address is required");
    else if (address.length > 255) errors.push("Address must not exceed 255 characters");

    if (secondaryPhone && !isValidPhone(secondaryPhone)) errors.push("Secondary phone must be exactly 10 numeric digits");

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

    if (bankAccountDetails && !isValidBankAccount(bankAccountDetails)) {
      errors.push("Bank account must contain only numeric digits (no letters or special characters)");
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error("Validation failed", errors, 400));
    }

    // Generate random numeric BM ID (BM-{12 random digits})
    let clientId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      const randomNum = Math.floor(Math.random() * 999999999999);
      clientId = `BM-${String(randomNum).padStart(12, '0')}`;

      // Check if this ID already exists
      const existing = await prisma.client.findUnique({
        where: { client_id: clientId }
      });

      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json(ApiResponse.error("Failed to generate unique client ID", null, 500));
    }
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
      client_id: clientId,
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
      // Store uploaded images in JSON field for persistence
      images: imageUploads && imageUploads.length > 0 ? imageUploads : null,
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
    if (premiumDuePaid?.trim()) policyDataToCreate.premium_paid = premiumDuePaid.trim().toUpperCase();
    if (bankName?.trim()) policyDataToCreate.bank_name = bankName.trim();
    if (bankAccountDetails?.trim()) policyDataToCreate.bank_account = bankAccountDetails.trim();
    if (branch?.trim()) policyDataToCreate.branch = branch.trim();
    if (policyStatusInput?.trim()) {
      const status = policyStatusInput.trim().toUpperCase();
      if (["ACTIVE", "INACTIVE", "PENDING", "LAPSED", "EXPIRED"].includes(status)) {
        policyDataToCreate.status = status;
      } else {
        policyDataToCreate.status = "PENDING";
      }
    } else {
      policyDataToCreate.status = "PENDING";
    }

    console.log('[CLIENT_ENROLL] Policy data being created:', {
      plan_name: policyDataToCreate.plan_name,
      plan_no: policyDataToCreate.plan_no,
      policy_number: policyDataToCreate.policy_number,
      sum_assured: policyDataToCreate.sum_assured,
      premium_amount: policyDataToCreate.premium_amount,
      bank_name: policyDataToCreate.bank_name,
      bank_account: policyDataToCreate.bank_account,
      branch: policyDataToCreate.branch,
      premium_due_date: policyDataToCreate.premium_due_date,
      premium_paid: policyDataToCreate.premium_paid,
      status: policyDataToCreate.status,
    });

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
 *     description: Search authenticated agent's clients by id, name, phone, or email. Returns client_id (LIC format).
 *     tags: [Client Enrollment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search term (name, email, phone, or client_id). Use "*" to get all clients.
 *         example: bibek
 *     responses:
 *       200:
 *         description: Clients found with all details including client_id
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
 *                   example: "Clients found"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Internal UUID of the client
 *                         example: "51911abe-4965-4526-a7ac-9dec2602e7b1"
 *                       client_id:
 *                         type: string
 *                         description: LIC formatted client ID (for display)
 *                         example: "LIC-1716546834000-ABC12"
 *                       first_name:
 *                         type: string
 *                         example: "Bibek"
 *                       last_name:
 *                         type: string
 *                         example: "Sharma"
 *                       email:
 *                         type: string
 *                         format: email
 *                         example: "bibek@example.com"
 *                       phone:
 *                         type: string
 *                         example: "9841000001"
 *                       secondary_phone:
 *                         type: string
 *                         nullable: true
 *                       address:
 *                         type: string
 *                         example: "Kathmandu, Nepal"
 *                       profile_picture:
 *                         type: string
 *                         nullable: true
 *                       status:
 *                         type: string
 *                         example: "ACTIVE"
 *                       policies:
 *                         type: array
 *                         description: Latest policy (if any)
 *                         items:
 *                           type: object
 *                           properties:
 *                             plan_name:
 *                               type: string
 *                             policy_number:
 *                               type: string
 *                             premium_due_date:
 *                               type: string
 *                             status:
 *                               type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Search query is required
 *       401:
 *         description: Unauthorized - Authentication token required
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
      deleted_at: null,
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
        client_id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        secondary_phone: true,
        address: true,
        profile_picture: true,
        created_at: true,
        updated_at: true,
        status: true,
        policies: {
          where: { deleted_at: null },
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            plan_name: true,
            policy_number: true,
            premium_due_date: true,
            status: true,
          },
        },
      },
      take: 50,
    });

    const normalizedClients = clients.map((client) => {
      const latestPolicy = Array.isArray(client.policies) ? client.policies[0] : null;
      return {
        ...client,
        phone_number: client.phone,
        secondary_contact: client.secondary_phone,
        is_active: client.status === "ACTIVE",
        plan_name: latestPolicy?.plan_name || null,
        policy_number: latestPolicy?.policy_number || null,
        premium_due_date_ad: latestPolicy?.premium_due_date || null,
        policy_status: latestPolicy?.status || null,
      };
    });

    res.status(200).json(
      ApiResponse.success("Clients found", normalizedClients)
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

    // Fetch client with related policies
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        policies: {
          where: { deleted_at: null },
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!client) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.deleted_at) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.agent_id !== agentId && req.user?.role !== "admin") {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to view this client", null, 403)
      );
    }

    // Return client with policies intact (don't filter out null values for better data visibility)
    const responseData = {
      ...client,
      policies: client.policies || [],
    };

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
router.put(
  "/client/:clientId",
  upload.fields([
    { name: "profile_picture", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "document", maxCount: 1 },
    { name: "doc_1", maxCount: 1 },
    { name: "doc_2", maxCount: 1 },
  ]),
  async (req, res) => {
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
      include: { policies: true },
    });

    if (!client) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.deleted_at) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.agent_id !== agentId && req.user?.role !== "admin") {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to update this client", null, 403)
      );
    }

    const body = req.body || {};
    const updateData = {};
    const policyUpdateData = {};

    const fullName = firstValue(body.full_name, body.fullName, body.name);
    if (fullName) {
      const { firstName, lastName } = splitFullName(fullName);
      if (firstName) updateData.first_name = firstName;
      if (lastName) updateData.last_name = lastName;
    }

    const firstName = firstValue(body.first_name, body.firstName);
    const lastName = firstValue(body.last_name, body.lastName);
    const email = firstValue(body.email);
    const phone = firstValue(body.phone, body.phone_number, body.contact_number, body.contactNumber);
    const secondaryPhone = firstValue(body.secondary_phone, body.secondary_contact, body.secondaryPhone);
    const address = firstValue(body.address);
    const profession = firstValue(body.profession);
    const memberGroup = firstValue(body.member_group, body.memberGroup, body.member);
    const nomineeName = firstValue(body.nominee_name, body.nomineeName, body.nominee);
    const nomineeRelation = firstValue(body.relation_with_nominee, body.nominee_relation, body.relationWithNominee, body.relation);
    const reasonForInsurance = firstValue(body.reason_for_insurance, body.reasonForInsurance, body.why_bought, body.whyBought);
    const gender = firstValue(body.gender);
    const dob = firstValue(body.dob, body.date_of_birth, body.dateOfBirth);
    const age = firstValue(body.age);

    if (firstName) updateData.first_name = firstName;
    if (lastName) updateData.last_name = lastName;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (secondaryPhone) updateData.secondary_phone = secondaryPhone;
    if (address) updateData.address = address;
    if (profession) updateData.profession = profession;
    if (memberGroup) updateData.member_group = memberGroup;
    if (nomineeName) updateData.nominee_name = nomineeName;
    if (nomineeRelation) updateData.relation_with_nominee = nomineeRelation;
    if (reasonForInsurance) updateData.reason_for_insurance = reasonForInsurance;
    if (gender) updateData.gender = gender.toUpperCase();

    if (dob) {
      const parsedDob = toDateOrNull(dob);
      if (parsedDob) updateData.dob = parsedDob;
    }

    if (age) {
      const parsedAge = parseInt(age, 10);
      if (!Number.isNaN(parsedAge) && parsedAge >= 0) {
        updateData.age = parsedAge;
      }
    }

    const files = req.files || {};
    const profilePictureFile = files.profile_picture?.[0] || files.image?.[0] || null;
    if (profilePictureFile) {
      const profileUpload = await uploadFileToCloud(
        profilePictureFile,
        `lic-insurance/client-enrollment/${client.id}/profile-picture`,
        `${client.id}-profile-picture`
      );
      updateData.profile_picture = profileUpload.url;
      updateData.profile_picture_public_id = profileUpload.public_id;
    }

    const planName = firstValue(body.plan_name, body.planName);
    const planNo = firstValue(body.plan_no, body.planNo);
    const policyNumber = firstValue(body.policy_number, body.policyNumber);
    const policyTerm = firstValue(body.policy_term, body.policyTerm, body.premium_term);
    const sumAssured = firstValue(body.sum_assured, body.sumAssured);
    const abPwb = firstValue(body.ab_pwb, body.abPwb);
    const premiumAmount = firstValue(body.premium_amount, body.premiumAmount);
    const discountScheme = firstValue(body.discount_scheme, body.discountScheme);
    const docAd = firstValue(body.doc_ad, body.doc, body.docAd);
    const maturityDate = firstValue(body.maturity_date, body.maturityTime, body.maturity_time);
    const premiumDueDate = firstValue(body.premium_due_date, body.premium_due_date_ad, body.paymentDueDate, body.payment_due_date);
    const premiumDuePaid = firstValue(body.premium_due_paid, body.premiumDuePaid);
    const bankName = firstValue(body.bank_name, body.bankName);
    const bankAccount = firstValue(body.bank_account, body.bank_account_details, body.bankAccountDetails);
    const branch = firstValue(body.branch, body.bank_branch, body.bankBranch);
    const policyStatus = firstValue(body.policy_status, body.policyStatus, body.status);

    if (planName) policyUpdateData.plan_name = planName;
    if (planNo) policyUpdateData.plan_no = planNo;
    if (policyNumber) policyUpdateData.policy_number = policyNumber;
    if (policyTerm) policyUpdateData.policy_term = policyTerm;
    if (abPwb) policyUpdateData.ab_pwb = abPwb;
    if (discountScheme) policyUpdateData.discount_scheme = discountScheme;
    if (docAd) policyUpdateData.doc = docAd;
    if (premiumDueDate) policyUpdateData.premium_due_date = premiumDueDate;
    if (premiumDuePaid) policyUpdateData.premium_paid = premiumDuePaid.toUpperCase();
    if (bankName) policyUpdateData.bank_name = bankName;
    if (bankAccount) policyUpdateData.bank_account = bankAccount;
    if (branch) policyUpdateData.branch = branch;
    if (policyStatus) policyUpdateData.status = normalizePolicyStatus(policyStatus);

    console.log('[CLIENT_UPDATE] Policy update data:', {
      plan_name: policyUpdateData.plan_name,
      bank_name: policyUpdateData.bank_name,
      bank_account: policyUpdateData.bank_account,
      branch: policyUpdateData.branch,
      premium_due_date: policyUpdateData.premium_due_date,
      premium_paid: policyUpdateData.premium_paid,
      status: policyUpdateData.status,
    });

    if (sumAssured) {
      const parsedSum = parseFloat(sumAssured);
      if (!Number.isNaN(parsedSum) && parsedSum > 0) {
        policyUpdateData.sum_assured = parsedSum;
      }
    }

    if (premiumAmount) {
      const parsedPremium = parseFloat(premiumAmount);
      if (!Number.isNaN(parsedPremium) && parsedPremium > 0) {
        policyUpdateData.premium_amount = parsedPremium;
      }
    }

    if (maturityDate) {
      const parsedMaturity = toDateOrNull(maturityDate);
      if (parsedMaturity) {
        policyUpdateData.maturity_time = parsedMaturity;
      }
    }

    if (Object.keys(updateData).length === 0 && Object.keys(policyUpdateData).length === 0) {
      return res.status(400).json(
        ApiResponse.error("No valid fields to update", null, 400)
      );
    }

    const updatedClient = Object.keys(updateData).length > 0
      ? await prisma.client.update({
          where: { id: clientId },
          data: updateData,
        })
      : client;

    let updatedPolicy = null;
    if (Object.keys(policyUpdateData).length > 0) {
      const existingPolicy = client.policies?.[0] || await prisma.policy.findFirst({
        where: { client_id: clientId, deleted_at: null },
        orderBy: { created_at: "desc" },
      });

      if (existingPolicy) {
        updatedPolicy = await prisma.policy.update({
          where: { id: existingPolicy.id },
          data: policyUpdateData,
        });
      }
    }

    const responseData = Object.fromEntries(
      Object.entries(updatedClient).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Client updated successfully", {
        data: responseData,
        policy: updatedPolicy || undefined,
      })
    );
  } catch (error) {
    console.error("[Update Client Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to update client", null, 500)
    );
  }
}
);

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

    if (client.deleted_at) {
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
