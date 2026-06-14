const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");

// All endpoints require authentication
router.use(authMiddleware);

/**
 * GET /api/diagnostic/client/:clientId
 * View complete client data with all details
 */
/**
 * @swagger
 * /api/diagnostic/client/{clientId}:
 *   get:
 *     summary: Get diagnostic data for a client
 *     tags: [Diagnostic]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: clientId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client diagnostic data
 */
router.get("/diagnostic/client/:clientId", async (req, res) => {
  try {
    const agentId = req.user?.id;
    const { clientId } = req.params;

    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found", null, 401)
      );
    }

    // Fetch complete client data
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

    if (client.agent_id !== agentId && !["ADMIN", "SUPER_ADMIN"].includes(String(req.user?.role || req.user?.type || "").toUpperCase())) {
      return res.status(403).json(
        ApiResponse.error("Unauthorized to view this client", null, 403)
      );
    }

    // Return detailed diagnostic info
    res.status(200).json(
      ApiResponse.success("Client diagnostic data", {
        client: {
          id: client.id,
          name: `${client.first_name} ${client.last_name}`,
          email: client.email,
          phone: client.phone,
          agent_id: client.agent_id,
          status: client.status,
          created_at: client.created_at,
          updated_at: client.updated_at,
        },
        policies_count: client.policies?.length || 0,
        policies: (client.policies || []).map((policy) => ({
          id: policy.id,
          policy_number: policy.policy_number,
          plan_name: policy.plan_name,
          plan_no: policy.plan_no,
          premium_amount: policy.premium_amount,
          sum_assured: policy.sum_assured,
          // Bank details
          bank_name: policy.bank_name,
          bank_account: policy.bank_account,
          branch: policy.branch,
          // Policy details
          policy_term: policy.policy_term,
          doc: policy.doc,
          maturity_time: policy.maturity_time,
          premium_due_date: policy.premium_due_date,
          premium_paid: policy.premium_paid,
          status: policy.status,
          ab_pwb: policy.ab_pwb,
          discount_scheme: policy.discount_scheme,
          created_at: policy.created_at,
          updated_at: policy.updated_at,
          // Check for missing fields
          missing_bank_details: [
            !policy.bank_name ? "bank_name" : null,
            !policy.bank_account ? "bank_account" : null,
            !policy.branch ? "branch" : null,
          ].filter(Boolean),
        })),
        summary: {
          has_policies: (client.policies?.length || 0) > 0,
          all_policies_complete: (client.policies || []).every(
            (p) => p.bank_name && p.bank_account && p.branch
          ),
        },
      })
    );
  } catch (error) {
    console.error("[Diagnostic Client Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to get diagnostic data", null, 500)
    );
  }
});

/**
 * GET /api/diagnostic/agent/clients
 * View all clients and their policies for this agent
 */
/**
 * @swagger
 * /api/diagnostic/agent/clients:
 *   get:
 *     summary: Get diagnostic data for agent clients
 *     tags: [Diagnostic]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Agent client diagnostic data
 */
router.get("/diagnostic/agent/clients", async (req, res) => {
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
        },
      },
      take: 20,
    });

    res.status(200).json(
      ApiResponse.success("Agent client diagnostic data", {
        total_clients: clients.length,
        clients: clients.map((c) => ({
          id: c.id,
          name: `${c.first_name} ${c.last_name}`,
          email: c.email,
          policies_count: c.policies?.length || 0,
          has_complete_policy: (c.policies || []).some(
            (p) => p.bank_name && p.bank_account && p.branch
          ),
        })),
      })
    );
  } catch (error) {
    console.error("[Diagnostic Clients Error]:", error);
    res.status(500).json(
      ApiResponse.error("Failed to get diagnostic data", null, 500)
    );
  }
});

module.exports = router;
