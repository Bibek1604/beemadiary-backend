const express = require("express");
const asyncHandler = require('../utils/asyncHandler');
const router = express.Router();

// -- Global error routing: auto-wrap every handler so async errors reach the
// global error handler in app.ts (non-destructive; any existing try/catch still runs).
['get', 'post', 'put', 'patch', 'delete'].forEach((_m) => {
  const _orig = router[_m].bind(router);
  router[_m] = (path, ...handlers) =>
    _orig(path, ...handlers.map((h) => (typeof h === 'function' ? asyncHandler(h) : h)));
});
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const logger = require('../utils/logger');
const { prisma } = require("../config/db");

// All dashboard endpoints require authentication
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Dashboard and overview endpoints
 */

/**
 * @swagger
 * /api/dashboard-overview/:
 *   get:
 *     summary: Get dashboard overview data
 *     description: Get summary statistics and visualizations for agent dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard overview retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch dashboard overview
 */
router.get("/dashboard-overview/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found in request", null, 401)
      );
    }

    // Get summary statistics
    const totalMembers = await prisma.client.count({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
    });

    const totalPolicies = await prisma.policy.count({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
    });

    const activePolicies = await prisma.policy.count({
      where: {
        agent_id: agentId,
        status: "ACTIVE",
        deleted_at: null,
      },
    });

    const lapsedPolicies = await prisma.policy.count({
      where: {
        agent_id: agentId,
        status: "LAPSED",
        deleted_at: null,
      },
    });

    // Get gender breakdown
    const genderStats = await prisma.client.groupBy({
      by: ["gender"],
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      _count: {
        id: true,
      },
    });

    const genderBreakdown = {
      MALE: 0,
      FEMALE: 0,
      CHILD: 0,
    };

    genderStats.forEach((stat) => {
      const gender = (stat.gender || "MALE").toUpperCase();
      if (gender === "M" || gender === "MALE") {
        genderBreakdown.MALE = stat._count.id;
      } else if (gender === "F" || gender === "FEMALE") {
        genderBreakdown.FEMALE = stat._count.id;
      } else {
        genderBreakdown.CHILD = stat._count.id;
      }
    });

    // Get policy status breakdown
    const policyStats = await prisma.policy.groupBy({
      by: ["status"],
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      _count: {
        id: true,
      },
    });

    const statusBreakdown = {};
    policyStats.forEach((stat) => {
      statusBreakdown[stat.status || "PENDING"] = stat._count.id;
    });

    // Calculate total premium amount
    const premiumData = await prisma.policy.aggregate({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      _sum: {
        premium_amount: true,
      },
    });

    const totalPremium = premiumData._sum.premium_amount || 0;

    // Get recent clients
    const recentClients = await prisma.client.findMany({
      where: {
        agent_id: agentId,
        deleted_at: null,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 5,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        phone: true,
        created_at: true,
      },
    });

    const summary = {
      total_members: totalMembers,
      total_policies: totalPolicies,
      active_policies: activePolicies,
      lapsed_policies: lapsedPolicies,
      total_premium: parseFloat(totalPremium.toString()),
    };

    const visualizations = {
      gender_breakdown: genderBreakdown,
      policy_status_breakdown: statusBreakdown,
    };

    const dashboardData = {
      summary,
      visualizations,
      recent_clients: recentClients,
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(
      ApiResponse.success("Dashboard overview retrieved successfully", {
        data: dashboardData,
      })
    );
  } catch (error) {
    logger.error("[Dashboard Overview Error]:", error);
    return res.status(500).json(
      ApiResponse.error("Failed to fetch dashboard overview", null, 500)
    );
  }
});

module.exports = router;
