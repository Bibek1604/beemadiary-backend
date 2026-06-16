const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");
const businessDate = require("../utils/businessDate");

// Case-insensitive admin check (token carries role/type "ADMIN" / "SUPER_ADMIN")
const isAdminUser = (u) => ["ADMIN", "SUPER_ADMIN"].includes(String(u?.role || u?.type || "").toUpperCase());

const console = {
  log() {},
  error() {},
  warn() {},
};

// All endpoints require authentication
router.use(authMiddleware);

/**
 * POST /api/policy/create
 * Create a new policy for a client
 */
router.post("/policy/create", async (req, res) => {
  try {
    const agentId = req.user?.id;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    const {
      client_id,
      plan_name,
      plan_no,
      policy_term,
      sum_assured,
      ab_pwb,
      doc,
      maturity_time,
      premium_amount,
      discount_scheme,
      premium_due_date,
      bank_account,
      branch,
      status,
    } = req.body;

    // Validation helper
    const isValidStatus = (status) => {
      const validStatuses = ['ACTIVE', 'INACTIVE', 'PENDING', 'LAPSED', 'EXPIRED'];
      return validStatuses.includes(status);
    };

    // Validate required fields
    const errors = [];
    if (!plan_name?.trim()) {
      errors.push("Plan name is required");
    } else if (plan_name.trim().length > 100) {
      errors.push("Plan name must not exceed 100 characters");
    }

    if (!plan_no?.trim()) {
      errors.push("Plan number is required");
    } else if (plan_no.trim().length > 50) {
      errors.push("Plan number must not exceed 50 characters");
    }

    if (!client_id?.trim()) {
      errors.push("Client ID is required");
    }

    if (!premium_amount) {
      errors.push("Premium amount is required");
    } else {
      const premiumNum = parseFloat(premium_amount);
      if (isNaN(premiumNum) || premiumNum <= 0) {
        errors.push("Premium amount must be a positive number");
      }
    }

    // Validate optional fields if provided
    if (sum_assured) {
      const sumNum = parseFloat(sum_assured);
      if (isNaN(sumNum) || sumNum <= 0) {
        errors.push("Sum assured must be a positive number");
      }
    }

    if (status && !isValidStatus(status)) {
      errors.push("Status must be one of: ACTIVE, INACTIVE, PENDING, LAPSED, EXPIRED");
    }

    if (errors.length > 0) {
      return res.status(400).json(
        ApiResponse.error("Validation failed", errors, 400)
      );
    }

    // Verify client exists and belongs to agent
    const client = await prisma.client.findUnique({
      where: { id: client_id },
    });

    if (!client) {
      return res.status(404).json(
        ApiResponse.error("Client not found", null, 404)
      );
    }

    if (client.agent_id !== agentId && !isAdminUser(req.user)) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to create policy for this client", null, 403)
      );
    }

    // Generate unique policy number
    const policyNumber = `LIC-POL-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    // Build policy data - only non-empty values
    const policyData = {
      policy_number: policyNumber,
      plan_name: plan_name.trim(),
      plan_no: plan_no.trim(),
      premium_amount: parseFloat(premium_amount),
      client_id: client_id.trim(),
      agent_id: agentId,
      status: status || "PENDING",
    };

    // Add optional fields
    if (policy_term?.trim()) policyData.policy_term = policy_term.trim();
    if (sum_assured) policyData.sum_assured = parseFloat(sum_assured);
    if (ab_pwb?.trim()) policyData.ab_pwb = ab_pwb.trim();
    if (doc?.trim()) policyData.doc = doc.trim();

    // Validate maturity_time before setting
    if (maturity_time) {
      const maturityDate = new Date(maturity_time);
      if (!isNaN(maturityDate.getTime())) {
        policyData.maturity_time = maturityDate;
      }
    }

    if (discount_scheme?.trim()) policyData.discount_scheme = discount_scheme.trim();
    if (premium_due_date?.trim()) policyData.premium_due_date = premium_due_date.trim();
    if (bank_account?.trim()) policyData.bank_account = bank_account.trim();
    if (branch?.trim()) policyData.branch = branch.trim();

    const policy = await prisma.policy.create({ data: policyData });

    // Filter out null values
    const responseData = Object.fromEntries(
      Object.entries(policy).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(201).json(
      ApiResponse.success("Policy created successfully", {
        id: policy.id,
        data: responseData,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to create policy", null, 500)
    );
  }
});

/**
 * Helper function to determine if a policy should be marked as lapsed
 * based on premium due date being 6+ months overdue
 */
function isLapsedPolicy(premiumDueDate) {
  // Day-aware, Asia/Kathmandu-safe 6-month rule:
  // exactly 6 months overdue => NOT lapsed; 6 months + 1 day => lapsed.
  return businessDate.isLapsedDueDate(premiumDueDate, 6);
}

/**
 * @swagger
 * /api/policies:
 *   get:
 *     summary: Get ALL policies (no parameters)
 *     description: Fetch all policies for the authenticated agent with client information and bank details. No query parameters needed!
 *     tags: [Policy]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All policies retrieved with statistics
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
 *                   example: "All policies retrieved"
 *                 data:
 *                   type: object
 *                   properties:
 *                     stats:
 *                       type: object
 *                       properties:
 *                         total_policies:
 *                           type: integer
 *                           example: 10
 *                         active_policies:
 *                           type: integer
 *                           example: 8
 *                         pending_policies:
 *                           type: integer
 *                           example: 1
 *                         lapsed_policies:
 *                           type: integer
 *                           example: 1
 *                         with_bank_details:
 *                           type: integer
 *                           example: 7
 *                         without_bank_details:
 *                           type: integer
 *                           example: 3
 *                         total_premium:
 *                           type: number
 *                           example: 250000
 *                     policies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           policy_number:
 *                             type: string
 *                             example: "LIC-POL-2026-XYZ"
 *                           plan_name:
 *                             type: string
 *                             example: "Endowment Plan"
 *                           plan_no:
 *                             type: string
 *                           premium_amount:
 *                             type: number
 *                             example: 25000
 *                           sum_assured:
 *                             type: number
 *                             example: 1000000
 *                           bank_name:
 *                             type: string
 *                             description: Bank name (if set)
 *                             example: "Nepal Bank Limited"
 *                           bank_account:
 *                             type: string
 *                             description: Bank account number
 *                             example: "1234567890"
 *                           branch:
 *                             type: string
 *                             description: Bank branch
 *                             example: "Kathmandu Main"
 *                           status:
 *                             type: string
 *                             enum: [ACTIVE, PENDING, LAPSED, EXPIRED]
 *                           client:
 *                             type: object
 *                             description: Client details for this policy
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 description: Internal UUID
 *                               client_id:
 *                                 type: string
 *                                 description: Sequential BM formatted client ID
 *                                 example: "BM00001"
 *                               first_name:
 *                                 type: string
 *                               last_name:
 *                                 type: string
 *                               email:
 *                                 type: string
 *                               phone:
 *                                 type: string
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Failed to get policies
 */
router.get("/policies", async (req, res) => {
  try {
    const agentId = req.user?.id;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Fetch ALL policies with client details
    const policies = await prisma.policy.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      include: {
        client: {
          select: {
            id: true,
            client_id: true,
            first_name: true,
            last_name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
      take: 1000,
    });

    // Count statistics
    const stats = {
      total_policies: policies.length,
      active_policies: policies.filter((p) => p.status === "ACTIVE").length,
      pending_policies: policies.filter((p) => p.status === "PENDING").length,
      lapsed_policies: policies.filter((p) => p.status === "LAPSED").length,
      with_bank_details: policies.filter((p) => p.bank_name && p.bank_account && p.branch).length,
      without_bank_details: policies.filter((p) => !p.bank_name || !p.bank_account || !p.branch).length,
      total_premium: policies.reduce((sum, p) => sum + (parseFloat(p.premium_amount) || 0), 0),
    };

    res.status(200).json(
      ApiResponse.success("All policies retrieved", {
        stats,
        policies: policies,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to get all policies", null, 500)
    );
  }
});

/**
 * GET /api/policy/search
 * Search policies by client name, id, or phone
 */
router.get("/policy/search", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { query } = req.query;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    if (!query?.trim()) {
      return res.status(200).json(
        ApiResponse.success("Policies found", [])
      );
    }

    const searchTerm = query.trim().toLowerCase();

    // Build search query - handle wildcard and normal searches
    const whereClause = {
      agent_id: agentId,
      deleted_at: null,
    };

    // If search term is "*" (wildcard), get all policies
    if (searchTerm !== "*") {
      whereClause.client = {
        OR: [
          { client_id: { contains: searchTerm, mode: "insensitive" } },
          { first_name: { contains: searchTerm, mode: "insensitive" } },
          { last_name: { contains: searchTerm, mode: "insensitive" } },
          { phone: { contains: searchTerm, mode: "insensitive" } },
          { email: { contains: searchTerm, mode: "insensitive" } },
        ],
      };
    }

    // Optional: filter by a specific client
    if (req.query.client_id) {
      whereClause.client_id = String(req.query.client_id);
    }

    // Search by client name, client_id, or client phone
    const policies = await prisma.policy.findMany({
      where: whereClause,
      include: {
        client: true,
      },
      orderBy: { created_at: 'desc' },
      take: 500,
    });

    // Enrich rows with the fields the frontend renders + lapse metadata
    const today = businessDate.getTodayParts();
    const statusFilter = String(req.query.status || "ALL").trim().toUpperCase();

    let rows = policies.map((p) => {
      const isPaid = String(p.premium_status || "").trim().toUpperCase() === "PAID";
      const isLapsedByRule = !isPaid && isLapsedPolicy(p.premium_due_date);
      const isLapsed = String(p.status || "").trim().toUpperCase() === "LAPSED" || isLapsedByRule;
      const dueParts = businessDate.parseDateParts(p.premium_due_date);
      const dueIso = businessDate.toIsoDate(dueParts);
      return {
        ...p,
        client_name: p.client
          ? `${p.client.first_name || ""} ${p.client.last_name || ""}`.trim() || null
          : null,
        client_phone: p.client?.phone || null,
        policy_status: p.status || null,
        premium_status: isPaid ? "PAID" : String(p.premium_status || "DUE").toUpperCase(),
        premium_due_date_ad: dueIso,
        parsed_due_date: dueIso,
        months_overdue: isPaid ? 0 : businessDate.monthsOverdue(p.premium_due_date, today),
        days_overdue: isPaid ? 0 : Math.max(0, businessDate.daysOverdue(p.premium_due_date, today)),
        is_lapsed_by_rule: isLapsedByRule,
        is_lapsed: isLapsed,
      };
    });

    if (statusFilter === "PAID") {
      rows = rows.filter((r) => r.premium_status === "PAID");
    } else if (statusFilter === "UNPAID") {
      // Regular dues list: unpaid only, lapsed policies excluded
      rows = rows.filter((r) => r.premium_status !== "PAID" && !r.is_lapsed);
    } else if (statusFilter === "LAPSED") {
      rows = rows.filter((r) => r.is_lapsed);
    }

    res.status(200).json(
      ApiResponse.success("Policies found", rows)
    );
  } catch (error) {

    // Handle Prisma errors with proper status codes
    const errorCode = error?.code;
    const errorMeta = error?.meta;

    if (errorCode === 'P2025') {
      return res.status(404).json(
        ApiResponse.error("Policy not found", null, 404)
      );
    }

    if (errorCode === 'P2003') {
      return res.status(400).json(
        ApiResponse.error("Invalid client reference", null, 400)
      );
    }

    // Generic error handler
    res.status(500).json(
      ApiResponse.error(
        "Failed to search policies",
        error?.message || "Internal server error",
        500
      )
    );
  }
});

/**
 * GET /api/policy/outdated
 * Get all policies with outdated/unpaid premium dues (6+ months)
 */
router.get("/policy/outdated", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Get all policies for this agent (excluding deleted and already lapsed)
    const policies = await prisma.policy.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      include: {
        client: true,
      },
    });

    // Filter policies where premium due date is 6+ months old
    const outdatedPolicies = policies.filter(p => {
      if (!p.premium_due_date) return false;
      if (p.status === 'LAPSED') return false;
      if (String(p.premium_status || "").toUpperCase() === "PAID") return false;
      return isLapsedPolicy(p.premium_due_date);
    });

    const outdatedWithDaysOverdue = outdatedPolicies.map(p => ({
      ...p,
      days_overdue: Math.floor((new Date() - new Date(p.premium_due_date)) / (1000 * 60 * 60 * 24)),
      months_overdue: Math.floor((new Date() - new Date(p.premium_due_date)) / (1000 * 60 * 60 * 24 * 30)),
    }));

    res.status(200).json(
      ApiResponse.success(
        `Found ${outdatedWithDaysOverdue.length} policies with outdated premium dues (6+ months)`,
        outdatedWithDaysOverdue
      )
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to fetch outdated policies", null, 500)
    );
  }
});

/**
 * GET /api/policy/lapsed
 * Get all policies with LAPSED status (premium not paid for 6+ months)
 */
router.get("/policy/lapsed", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Get all lapsed policies for this agent
    const lapsedPolicies = await prisma.policy.findMany({
      where: {
        agent_id: agentId,
        status: "LAPSED",
        deleted_at: null,
      },
      include: {
        client: true,
      },
      take: 100,
    });

    // Add calculated fields
    const policiesWithOverdue = lapsedPolicies.map(policy => {
      const daysCalc = policy.premium_due_date
        ? Math.floor((new Date() - new Date(policy.premium_due_date)) / (1000 * 60 * 60 * 24))
        : 0;
      const monthsCalc = policy.premium_due_date
        ? Math.floor((new Date() - new Date(policy.premium_due_date)) / (1000 * 60 * 60 * 24 * 30))
        : 0;

      return {
        ...policy,
        days_overdue: daysCalc,
        months_overdue: monthsCalc,
      };
    });

    res.status(200).json(
      ApiResponse.success(
        `Found ${policiesWithOverdue.length} lapsed policies`,
        policiesWithOverdue
      )
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to get lapsed policies", null, 500)
    );
  }
});

/**
 * GET /api/policy/summary
 * Get summary of policy statuses (ACTIVE, LAPSED, EXPIRED, PENDING)
 * NOTE: must be declared BEFORE "/policy/:policyId" or Express treats
 * "summary" as a policyId and this route becomes unreachable.
 */
router.get("/policy/summary", async (req, res) => {
  try {
    const agentId = req.user?.id;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Get count by status
    const statusCounts = await prisma.policy.groupBy({
      by: ["status"],
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      _count: true,
    });

    // Get outdated policies count (premium not paid for 6+ months)
    const allPolicies = await prisma.policy.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      select: {
        id: true,
        premium_due_date: true,
        status: true,
      },
    });

    const outdatedCount = allPolicies.filter(
      p => p.status !== "LAPSED" && isLapsedPolicy(p.premium_due_date)
    ).length;

    const summary = {
      total_policies: allPolicies.length,
      outdated_policies: outdatedCount,
      by_status: statusCounts.reduce((acc, item) => {
        acc[item.status] = item._count;
        return acc;
      }, {}),
    };

    res.status(200).json(
      ApiResponse.success("Policy summary", summary)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to get policy summary", null, 500)
    );
  }
});

/**
 * GET /api/policy/:policyId
 * Get policy details
 */
router.get("/policy/:policyId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { policyId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    const policy = await prisma.policy.findUnique({
      where: { id: policyId },
      include: { client: true },
    });

    if (!policy) {
      return res.status(404).json(
        ApiResponse.error("Policy not found", null, 404)
      );
    }

    if (policy.agent_id !== agentId && !isAdminUser(req.user)) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to view this policy", null, 403)
      );
    }

    // Filter out null values
    const responseData = Object.fromEntries(
      Object.entries(policy).filter(([, v]) => v !== null && v !== undefined && v !== "")
    );

    res.status(200).json(
      ApiResponse.success("Policy details retrieved", responseData)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to get policy details", null, 500)
    );
  }
});

/**
 * PUT /api/policy/:policyId
 * Update policy details
 */
router.put("/policy/:policyId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { policyId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Verify ownership
    const policy = await prisma.policy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      return res.status(404).json(
        ApiResponse.error("Policy not found", null, 404)
      );
    }

    if (policy.agent_id !== agentId && !isAdminUser(req.user)) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to update this policy", null, 403)
      );
    }

    // Validation helper
    const isValidStatus = (status) => {
      const validStatuses = ['ACTIVE', 'INACTIVE', 'PENDING', 'LAPSED', 'EXPIRED'];
      return validStatuses.includes(status);
    };

    // Build update data - only non-empty values with validation
    const updateData = {};
    const allowedFields = [
      "plan_name", "plan_no", "policy_term", "sum_assured", "ab_pwb",
      "doc", "maturity_time", "premium_amount", "discount_scheme",
      "premium_due_date", "bank_account", "branch", "premium_paid", "status",
      "premium_status", "payment_date"
    ];

    const updateErrors = [];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined && req.body[field] !== null && req.body[field] !== "") {
        const value = req.body[field];

        // Validate specific fields
        if (field === "premium_amount") {
          const num = parseFloat(value);
          if (isNaN(num) || num <= 0) {
            updateErrors.push("Premium amount must be a positive number");
            return;
          }
          updateData[field] = num;
        } else if (field === "sum_assured" || field === "premium_paid") {
          const num = parseFloat(value);
          if (isNaN(num) || num < 0) {
            updateErrors.push(`${field} must be a non-negative number`);
            return;
          }
          updateData[field] = num;
        } else if (field === "status") {
          if (!isValidStatus(value)) {
            updateErrors.push("Status must be one of: ACTIVE, INACTIVE, PENDING, LAPSED, EXPIRED");
            return;
          }
          updateData[field] = value;
        } else if (field === "premium_status") {
          const normalized = String(value).trim().toUpperCase();
          if (!["PAID", "DUE", "UNPAID"].includes(normalized)) {
            updateErrors.push("premium_status must be one of: PAID, DUE, UNPAID");
            return;
          }
          updateData[field] = normalized;
        } else if (field === "maturity_time") {
          const dateObj = new Date(value);
          if (isNaN(dateObj.getTime())) {
            updateErrors.push("Invalid maturity time format");
            return;
          }
          updateData[field] = dateObj;
        } else if (field === "payment_date") {
          const dateObj = new Date(value);
          if (isNaN(dateObj.getTime())) {
            updateErrors.push("Invalid payment date format");
            return;
          }
          updateData[field] = dateObj;
        } else {
          updateData[field] = value;
        }
      }
    });

    if (updateErrors.length > 0) {
      return res.status(400).json(
        ApiResponse.error("Validation failed", updateErrors, 400)
      );
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json(
        ApiResponse.error("No valid fields to update", null, 400)
      );
    }

    const updated = await prisma.policy.update({
      where: { id: policyId },
      data: updateData,
    });

    // Filter out null values
    const responseData = Object.fromEntries(
      Object.entries(updated).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Policy updated successfully", responseData)
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to update policy", null, 500)
    );
  }
});

/**
 * DELETE /api/policy/:policyId
 * Delete policy (soft delete)
 */
router.delete("/policy/:policyId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { policyId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Verify ownership
    const policy = await prisma.policy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      return res.status(404).json(
        ApiResponse.error("Policy not found", null, 404)
      );
    }

    if (policy.agent_id !== agentId && !isAdminUser(req.user)) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to delete this policy", null, 403)
      );
    }

    const deleted = await prisma.policy.update({
      where: { id: policyId },
      data: {
        deleted_at: new Date(),
      },
    });

    res.status(200).json(
      ApiResponse.success("Policy deleted successfully", {
        id: deleted.id,
        deleted_at: deleted.deleted_at,
      })
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to delete policy", null, 500)
    );
  }
});

/**
 * POST /api/policy/sync-lapsed
 * Automatically update policy status to LAPSED for all policies with premium due 6+ months ago
 * Only for admin or for agent's own policies
 */
router.post("/policy/sync-lapsed", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const isAdmin = isAdminUser(req.user);

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Build query based on user role
    const whereClause = isAdmin ? {} : { agent_id: agentId };

    // Get all non-lapsed, non-deleted policies
    const policies = await prisma.policy.findMany({
      where: {
        ...whereClause,
        status: { not: "LAPSED" },
        deleted_at: null,
      },
    });

    // Filter and update policies that should be lapsed
    let updatedCount = 0;
    const policiestoUpdate = [];

    for (const policy of policies) {
      if (isLapsedPolicy(policy.premium_due_date)) {
        policiestoUpdate.push(policy.id);
      }
    }

    // Update all lapsed policies in batch
    if (policiestoUpdate.length > 0) {
      await prisma.policy.updateMany({
        where: {
          id: { in: policiestoUpdate },
        },
        data: {
          status: "LAPSED",
        },
      });
      updatedCount = policiestoUpdate.length;
    }

    res.status(200).json(
      ApiResponse.success(
        `Synced lapsed policies. Updated ${updatedCount} policies to LAPSED status`,
        {
          updated_count: updatedCount,
          policy_ids: policiestoUpdate,
        }
      )
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to sync lapsed policies", null, 500)
    );
  }
});

/**
 * POST /api/policy/cleanup-orphans
 * Soft-delete every policy whose owning client no longer exists (the client
 * was deleted or is missing). Keeps policy data consistent with clients so
 * orphaned policies don't linger in counts, dues or the dashboard graph.
 * Admins clean up all agents; a regular agent cleans up only their own.
 */
router.post("/policy/cleanup-orphans", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const isAdmin = isAdminUser(req.user);

    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const whereClause = isAdmin ? {} : { agent_id: agentId };

    // Live (non-deleted) clients in scope, and all active policies in scope.
    const [liveClients, policies] = await Promise.all([
      prisma.client.findMany({
        where: { ...whereClause, deleted_at: null },
        select: { id: true },
      }),
      prisma.policy.findMany({
        where: { ...whereClause, deleted_at: null },
        select: { id: true, client_id: true },
      }),
    ]);

    const liveClientIds = new Set(liveClients.map((c) => String(c.id)));

    // A policy is orphaned when it has no client_id or its client is gone.
    const orphanIds = policies
      .filter((p) => !p.client_id || !liveClientIds.has(String(p.client_id)))
      .map((p) => p.id);

    let removedCount = 0;
    if (orphanIds.length > 0) {
      await prisma.policy.updateMany({
        where: { id: { in: orphanIds } },
        data: { deleted_at: new Date(), status: "INACTIVE" },
      });
      removedCount = orphanIds.length;
    }

    res.status(200).json(
      ApiResponse.success(
        `Removed ${removedCount} orphaned ${removedCount === 1 ? "policy" : "policies"} with no client.`,
        { removed_count: removedCount, policy_ids: orphanIds }
      )
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to clean up orphaned policies", null, 500)
    );
  }
});

/**
 * PUT /api/policy/:policyId/pay-installment
 * Record ONE month's premium as paid: advance the due date by exactly one
 * month (clearing a single overdue installment) instead of clearing all
 * outstanding months at once. The policy stays in the dues list with one
 * fewer month overdue until it is fully caught up, at which point it is
 * marked PAID (and reactivated if it had lapsed).
 */
router.put("/policy/:policyId/pay-installment", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { policyId } = req.params;

    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const policy = await prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) {
      return res.status(404).json(ApiResponse.error("Policy not found", null, 404));
    }
    if (policy.agent_id !== agentId && !isAdminUser(req.user)) {
      return res.status(403).json(ApiResponse.error("Unauthorized to update this policy", null, 403));
    }

    const today = businessDate.getTodayParts();
    const dueParts = businessDate.parseDateParts(policy.premium_due_date);

    // Advance the due date by exactly one calendar month (end-of-month safe).
    const addOneMonth = (parts) => {
      let y = parts.year;
      let m = parts.month + 1;
      if (m > 12) { m = 1; y += 1; }
      const daysInTarget = new Date(Date.UTC(y, m, 0)).getUTCDate();
      return { year: y, month: m, day: Math.min(parts.day, daysInTarget) };
    };

    const updateData = {
      premium_paid: (Number(policy.premium_paid) || 0) + (Number(policy.premium_amount) || 0),
      payment_date: new Date(),
    };

    if (dueParts) {
      const nextParts = addOneMonth(dueParts);
      updateData.premium_due_date = businessDate.toIsoDate(nextParts);
      // Still due if the new due date is today or earlier; otherwise caught up.
      const stillDue = businessDate.compareParts(nextParts, today) <= 0;
      updateData.premium_status = stillDue ? "DUE" : "PAID";
      if (!stillDue && String(policy.status || "").toUpperCase() === "LAPSED") {
        updateData.status = "ACTIVE"; // caught up — reactivate a lapsed policy
      }
    } else {
      // No due date on record: treat this as a single full payment.
      updateData.premium_status = "PAID";
    }

    const updated = await prisma.policy.update({ where: { id: policyId }, data: updateData });
    const monthsOverdue = updated.premium_due_date
      ? businessDate.monthsOverdue(updated.premium_due_date, today)
      : 0;

    res.status(200).json(
      ApiResponse.success("One premium installment recorded as paid", {
        id: updated.id,
        premium_due_date: updated.premium_due_date,
        premium_status: updated.premium_status,
        premium_paid: updated.premium_paid,
        status: updated.status,
        months_overdue: monthsOverdue,
        fully_paid: updated.premium_status === "PAID",
      })
    );
  } catch (error) {
    res.status(500).json(ApiResponse.error("Failed to record premium payment", null, 500));
  }
});

/**
 * PUT /api/policy/:policyId/mark-lapsed
 * Manually mark a specific policy as LAPSED
 */
router.put("/policy/:policyId/mark-lapsed", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { policyId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Verify ownership
    const policy = await prisma.policy.findUnique({
      where: { id: policyId },
    });

    if (!policy) {
      return res.status(404).json(
        ApiResponse.error("Policy not found", null, 404)
      );
    }

    if (policy.agent_id !== agentId && !isAdminUser(req.user)) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to update this policy", null, 403)
      );
    }

    // Update status to LAPSED
    const updated = await prisma.policy.update({
      where: { id: policyId },
      data: { status: "LAPSED" },
      include: { client: true },
    });

    res.status(200).json(
      ApiResponse.success(
        "Policy marked as LAPSED successfully",
        updated
      )
    );
  } catch (error) {
    res.status(500).json(
      ApiResponse.error("Failed to mark policy as lapsed", null, 500)
    );
  }
});

module.exports = router;
