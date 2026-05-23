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
            client_id: true,
            first_name: true,
            last_name: true,
            phone: true,
            email: true,
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

    // Soft delete
    await prisma.policy.update({
      where: { id: policyId },
      data: { deleted_at: new Date() },
    });

    res.status(200).json(
      ApiResponse.success("Policy deleted successfully", null)
    );
  } catch (error) {
    console.error("[Delete Policy Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to delete policy", null, 500)
    );
  }
});

module.exports = router;
