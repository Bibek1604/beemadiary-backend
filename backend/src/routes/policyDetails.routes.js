const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");

// All endpoints require authentication
router.use(authMiddleware);

/**
 * POST /api/policy/create
 * Create policy with policy details
 * Required: client_id, plan_name, plan_no, policy_number, policy_term, sum_assured, premium_amount, policy_status
 * Optional: ab_pwb, doc, maturity_time, discount_scheme
 */
router.post("/policy/create", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const {
      client_id,
      plan_name,
      plan_no,
      policy_number,
      policy_term,
      sum_assured,
      premium_amount,
      policy_status,
      ab_pwb,
      doc,
      maturity_time,
      discount_scheme,
    } = req.body;

    // Validation
    const errors = [];
    if (!client_id?.trim?.()) errors.push("Client ID is required");
    if (!plan_name?.trim?.()) errors.push("Plan name is required");
    if (!plan_no?.trim?.()) errors.push("Plan number is required");
    if (!policy_number?.trim?.()) errors.push("Policy number is required");
    if (!policy_term?.trim?.()) errors.push("Policy term is required");

    if (sum_assured === undefined || sum_assured === null || sum_assured === '') {
      errors.push("Sum assured is required");
    } else {
      const num = parseFloat(sum_assured);
      if (isNaN(num) || num <= 0) errors.push("Sum assured must be a positive number");
    }

    if (premium_amount === undefined || premium_amount === null || premium_amount === '') {
      errors.push("Premium amount is required");
    } else {
      const num = parseFloat(premium_amount);
      if (isNaN(num) || num <= 0) errors.push("Premium amount must be a positive number");
    }

    if (!policy_status?.trim?.()) errors.push("Policy status is required");

    if (doc) {
      const docDate = new Date(doc);
      if (isNaN(docDate.getTime())) errors.push("Invalid DOC date");
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error("Validation failed", errors, 400));
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: client_id },
    });

    if (!client) {
      return res.status(404).json(ApiResponse.error("Client not found", null, 404));
    }

    // Get company
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { company_id: true },
    });
    const fallbackCompany = await prisma.company.findFirst({ select: { id: true } });
    const companyId = agent?.company_id || fallbackCompany?.id;

    if (!companyId) {
      return res.status(400).json(ApiResponse.error("Company not found", null, 400));
    }

    // Create policy
    const policy = await prisma.policy.create({
      data: {
        client_id: String(client_id).trim(),
        plan_name: String(plan_name).trim(),
        plan_no: String(plan_no).trim(),
        policy_number: String(policy_number).trim(),
        policy_term: String(policy_term).trim(),
        sum_assured: parseFloat(sum_assured),
        premium_amount: parseFloat(premium_amount),
        ab_pwb: ab_pwb ? String(ab_pwb).trim() : null,
        doc: doc ? new Date(doc) : null,
        maturity_time: maturity_time ? String(maturity_time).trim() : null,
        discount_scheme: discount_scheme ? String(discount_scheme).trim() : null,
        agent_id: agentId,
        company_id: companyId,
        status: "PENDING",
      },
    });

    const cleanRecord = (record) =>
      Object.fromEntries(Object.entries(record).filter(([_, value]) => value !== null && value !== undefined && value !== ""));

    res.status(201).json(
      ApiResponse.success("Policy created successfully", {
        id: policy.id,
        policy: cleanRecord(policy),
      })
    );
  } catch (error) {
    console.error("[Create Policy Error]:", error);
    res.status(500).json(ApiResponse.error("Failed to create policy", null, 500));
  }
});

module.exports = router;
