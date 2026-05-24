const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");

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

    if (client.agent_id !== agentId && req.user?.role !== "admin") {
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
    console.error("[Policy Create Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to create policy", null, 500)
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
      return res.status(400).json(
        ApiResponse.error("Search query is required", null, 400)
      );
    }

    const searchTerm = query.trim().toLowerCase();

    // Search by client name, client_id, or client phone
    const policies = await prisma.policy.findMany({
      where: {
        agent_id: agentId,
        client: {
          OR: [
            { client_id: { contains: searchTerm, mode: "insensitive" } },
            { first_name: { contains: searchTerm, mode: "insensitive" } },
            { last_name: { contains: searchTerm, mode: "insensitive" } },
            { phone: { contains: searchTerm, mode: "insensitive" } },
            { email: { contains: searchTerm, mode: "insensitive" } },
          ],
        },
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
            secondary_phone: true,
            address: true,
            dob: true,
            age: true,
            gender: true,
            profession: true,
            member_group: true,
            nominee_name: true,
            relation_with_nominee: true,
            reason_for_insurance: true,
            image: true,
            profile_picture: true,
            status: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
      take: 50,
    });

    res.status(200).json(
      ApiResponse.success("Policies found", policies)
    );
  } catch (error) {
    console.error("[Policy Search Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to search policies", null, 500)
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
    console.log("🔍 [Outdated Policies] AgentId:", agentId);

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
      const dueDate = new Date(p.premium_due_date);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return dueDate <= sixMonthsAgo;
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
    console.error("❌ [Get Outdated Policies Error]:", error?.message);
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
    console.log("🔍 [Lapsed Policies] AgentId:", agentId);
    console.log("🔍 [Lapsed Policies] User:", req.user);

    if (!agentId) {
      console.error("❌ [Lapsed Policies] No agent ID found");
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Get all lapsed policies for this agent
    console.log("🔍 [Lapsed Policies] Querying with agent_id:", agentId);
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

    console.log("✅ [Lapsed Policies] Found:", lapsedPolicies.length, "policies");

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

    console.log("✅ [Lapsed Policies] Returning:", policiesWithOverdue.length, "policies with overdue data");
    res.status(200).json(
      ApiResponse.success(
        `Found ${policiesWithOverdue.length} lapsed policies`,
        policiesWithOverdue
      )
    );
  } catch (error) {
    console.error("❌ [Get Lapsed Policies Error] Full Error:", error);
    console.error("❌ [Get Lapsed Policies Error] Message:", error?.message);
    console.error("❌ [Get Lapsed Policies Error] Stack:", error?.stack);
    res.status(500).json(
      ApiResponse.error("Failed to get lapsed policies", null, 500)
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

    if (policy.agent_id !== agentId && req.user?.role !== "admin") {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to view this policy", null, 403)
      );
    }

    // Filter out null values
    const responseData = Object.fromEntries(
      Object.entries(policy).filter(([_, value]) => value !== null && value !== undefined && value !== "")
    );

    res.status(200).json(
      ApiResponse.success("Policy details retrieved", responseData)
    );
  } catch (error) {
    console.error("[Get Policy Error]:", error);
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

    if (policy.agent_id !== agentId && req.user?.role !== "admin") {
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
      "premium_due_date", "bank_account", "branch", "premium_paid", "status"
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
        } else if (field === "maturity_time") {
          const dateObj = new Date(value);
          if (isNaN(dateObj.getTime())) {
            updateErrors.push("Invalid maturity time format");
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
    console.error("[Update Policy Error]:", error);
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

    if (policy.agent_id !== agentId && req.user?.role !== "admin") {
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
    console.error("[Delete Policy Error]:", error);
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
    const isAdmin = req.user?.role === "admin";

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
    console.error("[Sync Lapsed Policies Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to sync lapsed policies", null, 500)
    );
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

    if (policy.agent_id !== agentId && req.user?.role !== "admin") {
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
    console.error("[Mark Policy Lapsed Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to mark policy as lapsed", null, 500)
    );
  }
});

/**
 * GET /api/policy/summary
 * Get summary of policy statuses (ACTIVE, LAPSED, EXPIRED, PENDING)
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
    console.error("[Policy Summary Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to get policy summary", null, 500)
    );
  }
});

module.exports = router;
