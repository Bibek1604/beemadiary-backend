const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth.middleware");
const ApiResponse = require("../utils/apiResponse");
const { prisma } = require("../config/db");
const businessDate = require("../utils/businessDate");

// All analytics endpoints require authentication
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics and reporting endpoints
 */

/**
 * @swagger
 * /api/analytics/monthly-graph/:
 *   get:
 *     summary: Get monthly client enrollment graph data
 *     description: Get monthly data for client enrollments and targets for the current year
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Monthly graph data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch monthly data
 */
router.get("/analytics/monthly-graph/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found in request", null, 401)
      );
    }

    // Current year in the business timezone (Asia/Kathmandu)
    const currentYear = businessDate.getTodayParts().year;
    const monthlyData = [];

    // Get client enrollments by month for current year (timezone-safe ranges)
    for (let month = 1; month <= 12; month++) {
      const startDate = businessDate.businessMidnightUtc(currentYear, month, 1);
      const endDate = month === 12
        ? businessDate.businessMidnightUtc(currentYear + 1, 1, 1)
        : businessDate.businessMidnightUtc(currentYear, month + 1, 1);

      const clientCount = await prisma.client.count({
        where: {
          agent_id: agentId,
          created_at: {
            gte: startDate,
            lt: endDate,
          },
          deleted_at: null,
        },
      });

      monthlyData.push({
        month_number: month,
        month_name: [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ][month - 1],
        clients_added: clientCount,
        target: 0, // Targets would be fetched from targets table if available
      });
    }

    return res.status(200).json(
      ApiResponse.success("Monthly graph data retrieved successfully", {
        monthly_data: monthlyData,
        year: currentYear,
      })
    );
  } catch (error) {
    console.error("[Monthly Graph Error]:", error);
    return res.status(500).json(
      ApiResponse.error("Failed to fetch monthly data", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/analytics/yearly-graph/:
 *   get:
 *     summary: Get yearly statistics
 *     description: Get yearly enrollment and policy statistics
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Yearly data retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch yearly data
 */
router.get("/analytics/yearly-graph/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found in request", null, 401)
      );
    }

    const currentYear = businessDate.getTodayParts().year;
    const startOfYear = businessDate.businessMidnightUtc(currentYear, 1, 1);
    const endOfYear = businessDate.businessMidnightUtc(currentYear + 1, 1, 1);

    const yearlyStats = {
      year: currentYear,
      total_clients: await prisma.client.count({
        where: {
          agent_id: agentId,
          deleted_at: null,
        },
      }),
      new_clients_this_year: await prisma.client.count({
        where: {
          agent_id: agentId,
          created_at: {
            gte: startOfYear,
            lt: endOfYear,
          },
          deleted_at: null,
        },
      }),
      total_policies: await prisma.policy.count({
        where: {
          agent_id: agentId,
          deleted_at: null,
        },
      }),
      new_policies_this_year: await prisma.policy.count({
        where: {
          agent_id: agentId,
          created_at: {
            gte: startOfYear,
            lt: endOfYear,
          },
          deleted_at: null,
        },
      }),
    };

    return res.status(200).json(
      ApiResponse.success("Yearly data retrieved successfully", yearlyStats)
    );
  } catch (error) {
    console.error("[Yearly Graph Error]:", error);
    return res.status(500).json(
      ApiResponse.error("Failed to fetch yearly data", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/analytics/gender-breakdown/:
 *   get:
 *     summary: Get gender breakdown of clients
 *     description: Get breakdown of clients by gender
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gender breakdown retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch gender breakdown
 */
router.get("/analytics/gender-breakdown/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found in request", null, 401)
      );
    }

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

    const breakdown = {
      MALE: 0,
      FEMALE: 0,
      OTHER: 0,
    };

    genderStats.forEach((stat) => {
      const gender = (stat.gender || "OTHER").toUpperCase();
      if (gender in breakdown) {
        breakdown[gender] = stat._count.id;
      } else {
        breakdown["OTHER"] = (breakdown["OTHER"] || 0) + stat._count.id;
      }
    });

    return res.status(200).json(
      ApiResponse.success("Gender breakdown retrieved successfully", breakdown)
    );
  } catch (error) {
    console.error("[Gender Breakdown Error]:", error);
    return res.status(500).json(
      ApiResponse.error("Failed to fetch gender breakdown", null, 500)
    );
  }
});

/**
 * @swagger
 * /api/analytics/policy-status-breakdown/:
 *   get:
 *     summary: Get policy status breakdown
 *     description: Get breakdown of policies by status
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy status breakdown retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch policy status breakdown
 */
router.get("/analytics/policy-status-breakdown/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(
        ApiResponse.error("Agent ID not found in request", null, 401)
      );
    }

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

    const breakdown = {
      ACTIVE: 0,
      INACTIVE: 0,
      PENDING: 0,
      LAPSED: 0,
      EXPIRED: 0,
    };

    policyStats.forEach((stat) => {
      const status = (stat.status || "PENDING").toUpperCase();
      if (status in breakdown) {
        breakdown[status] = stat._count.id;
      }
    });

    return res.status(200).json(
      ApiResponse.success(
        "Policy status breakdown retrieved successfully",
        breakdown
      )
    );
  } catch (error) {
    console.error("[Policy Status Breakdown Error]:", error);
    return res.status(500).json(
      ApiResponse.error("Failed to fetch policy status breakdown", null, 500)
    );
  }
});

module.exports = router;
