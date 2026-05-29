const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");

// All endpoints require authentication
router.use(authMiddleware);

/**
 * POST /api/policy/bank-details
 * Add bank details to a policy
 * Required: policy_id, bank_account, branch, premium_due_date, premium_paid
 */
/**
 * @swagger
 * /api/policy/bank-details:
 *   post:
 *     summary: Add policy bank details
 *     tags: [Policy]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bank details added successfully
 */
router.post("/policy/bank-details", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found", null, 401));
    }

    const {
      policy_id,
      bank_name,
      bank_account,
      branch,
      premium_due_date,
      premium_paid,
    } = req.body;

    // Validation
    const errors = [];
    if (!policy_id?.trim()) errors.push("Policy ID is required");
    if (bank_name && !bank_name?.trim()) errors.push("Bank name is invalid");
    if (!bank_account?.trim()) errors.push("Bank account is required");
    if (!branch?.trim()) errors.push("Branch is required");
    if (!premium_due_date?.trim()) errors.push("Premium due date is required");
    if (premium_paid === undefined || premium_paid === null) {
      errors.push("Premium paid amount is required");
    } else {
      const amount = parseFloat(premium_paid);
      if (isNaN(amount) || amount < 0) errors.push("Premium paid must be a valid positive number");
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error("Validation failed", errors, 400));
    }

    // Verify policy exists
    const policy = await prisma.policy.findUnique({
      where: { id: policy_id },
    });

    if (!policy) {
      return res.status(404).json(ApiResponse.error("Policy not found", null, 404));
    }

    // Update policy with bank details
    const updatedPolicy = await prisma.policy.update({
      where: { id: policy_id },
      data: {
        bank_name: bank_name?.trim() || null,
        bank_account: bank_account.trim(),
        branch: branch.trim(),
        premium_due_date: premium_due_date.trim(),
        premium_paid: parseFloat(premium_paid),
      },
    });

    const cleanRecord = (record) =>
      Object.fromEntries(Object.entries(record).filter(([_, value]) => value !== null && value !== undefined && value !== ""));

    res.status(200).json(
      ApiResponse.success("Bank details added successfully", {
        policy: cleanRecord(updatedPolicy),
      })
    );
  } catch (error) {
    console.error("[Add Bank Details Error]:", error);
    res.status(500).json(ApiResponse.error("Failed to add bank details", null, 500));
  }
});

module.exports = router;
