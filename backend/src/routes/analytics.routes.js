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
const businessDate = require("../utils/businessDate");

// All analytics endpoints require authentication
router.use(authMiddleware);

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: Analytics and reporting endpoints
 */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * @swagger
 * /api/analytics/monthly-graph/:
 *   get:
 *     summary: Get monthly client enrollment graph data
 *     description: |
 *       Returns monthly client enrollment counts and configured targets for a given year.
 *       Defaults to the current business year (Asia/Kathmandu) when ?year is omitted.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2026
 *         description: Year to retrieve data for (defaults to current year)
 *     responses:
 *       200:
 *         description: Monthly graph data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     year: { type: integer }
 *                     monthly_data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           month_number: { type: integer }
 *                           month_name:   { type: string }
 *                           clients_added:{ type: integer }
 *                           target:       { type: integer }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch monthly data
 */
router.get("/analytics/monthly-graph/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found in request", null, 401));
    }

    // Accept ?year= with validation; default to current business year
    let graphYear = Number.parseInt(req.query.year, 10);
    if (!Number.isInteger(graphYear) || graphYear < 1950 || graphYear > 2100) {
      graphYear = businessDate.getTodayParts().year;
    }

    const startDate = businessDate.businessMidnightUtc(graphYear, 1, 1);
    const endDate   = businessDate.businessMidnightUtc(graphYear + 1, 1, 1);

    // DB-side monthly aggregation (MongoDB $group) — replaces fetch-all-then-bucket-in-JS.
    // Groups by UTC year+month to exactly mirror the previous behaviour: parseDateParts
    // reads UTC parts for a Date, and only clients whose UTC year === graphYear were counted.
    const [monthRows, monthTargets] = await Promise.all([
      prisma.client.aggregateRaw([
        { $match: { agent_id: agentId, deleted_at: null, created_at: { $gte: startDate, $lt: endDate } } },
        { $group: { _id: { y: { $year: "$created_at" }, m: { $month: "$created_at" } }, count: { $sum: 1 } } },
      ]),
      prisma.agentTarget.findMany({
        where: {
          agent_id: agentId,
          target_type: "MONTHLY",
          deleted_at: null,
        },
        select: { period_name: true, target_value: true },
      }).catch(() => []),
    ]);

    // Build per-month counts, keeping only the rows whose UTC year matches graphYear.
    const countByMonth = new Array(12).fill(0);
    (monthRows || []).forEach((r) => {
      const y = Number(r?._id?.y);
      const m = Number(r?._id?.m);
      if (y === graphYear && m >= 1 && m <= 12) {
        countByMonth[m - 1] += Number(r.count) || 0;
      }
    });

    // Build targets lookup keyed by 0-based month index, e.g. "Jan 2026" → 0
    const targetByMonth = new Map();
    monthTargets.forEach((t) => {
      const parts = String(t.period_name || "").trim().split(" ");
      const monthIdx = MONTHS_SHORT.indexOf(parts[0]);
      const year = Number.parseInt(parts[1], 10);
      if (monthIdx >= 0 && year === graphYear) {
        targetByMonth.set(monthIdx, Number(t.target_value) || 0);
      }
    });

    const monthlyData = countByMonth.map((count, i) => ({
      month_number:  i + 1,
      month_name:    MONTHS_FULL[i],
      clients_added: count,
      target:        targetByMonth.get(i) || 0,
    }));

    return res.status(200).json(
      ApiResponse.success("Monthly graph data retrieved successfully", {
        year: graphYear,
        monthly_data: monthlyData,
      })
    );
  } catch (error) {
    logger.error("[Monthly Graph Error]:", error);
    return res.status(500).json(ApiResponse.error("Failed to fetch monthly data", null, 500));
  }
});

/**
 * @swagger
 * /api/analytics/yearly-graph/:
 *   get:
 *     summary: Get yearly statistics
 *     description: |
 *       Returns cumulative totals and new-this-year counts for clients and policies.
 *       Defaults to the current business year.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2026
 *         description: Year to retrieve data for (defaults to current year)
 *     responses:
 *       200:
 *         description: Yearly data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     year:               { type: integer }
 *                     total_clients:      { type: integer }
 *                     new_clients_this_year: { type: integer }
 *                     total_policies:     { type: integer }
 *                     new_policies_this_year: { type: integer }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch yearly data
 */
router.get("/analytics/yearly-graph/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found in request", null, 401));
    }

    let graphYear = Number.parseInt(req.query.year, 10);
    if (!Number.isInteger(graphYear) || graphYear < 1950 || graphYear > 2100) {
      graphYear = businessDate.getTodayParts().year;
    }

    const startOfYear = businessDate.businessMidnightUtc(graphYear, 1, 1);
    const endOfYear   = businessDate.businessMidnightUtc(graphYear + 1, 1, 1);

    const [totalClients, newClientsThisYear, totalPolicies, newPoliciesThisYear] = await Promise.all([
      prisma.client.count({ where: { agent_id: agentId, deleted_at: null } }),
      prisma.client.count({ where: { agent_id: agentId, deleted_at: null, created_at: { gte: startOfYear, lt: endOfYear } } }),
      prisma.policy.count({ where: { agent_id: agentId, deleted_at: null } }),
      prisma.policy.count({ where: { agent_id: agentId, deleted_at: null, created_at: { gte: startOfYear, lt: endOfYear } } }),
    ]);

    return res.status(200).json(
      ApiResponse.success("Yearly data retrieved successfully", {
        year: graphYear,
        total_clients: totalClients,
        new_clients_this_year: newClientsThisYear,
        total_policies: totalPolicies,
        new_policies_this_year: newPoliciesThisYear,
      })
    );
  } catch (error) {
    logger.error("[Yearly Graph Error]:", error);
    return res.status(500).json(ApiResponse.error("Failed to fetch yearly data", null, 500));
  }
});

/**
 * @swagger
 * /api/analytics/gender-breakdown/:
 *   get:
 *     summary: Get gender breakdown of clients
 *     description: Returns count of active clients grouped by gender (MALE, FEMALE, CHILD, OTHER).
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Gender breakdown retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     MALE:   { type: integer }
 *                     FEMALE: { type: integer }
 *                     CHILD:  { type: integer }
 *                     OTHER:  { type: integer }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch gender breakdown
 */
router.get("/analytics/gender-breakdown/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found in request", null, 401));
    }

    const genderStats = await prisma.client.groupBy({
      by: ["gender"],
      where: { agent_id: agentId, deleted_at: null },
      _count: { id: true },
    });

    const breakdown = { MALE: 0, FEMALE: 0, CHILD: 0, OTHER: 0 };

    genderStats.forEach((stat) => {
      const gender = (stat.gender || "OTHER").trim().toUpperCase();
      if (gender === "MALE"   || gender === "M") breakdown.MALE   += stat._count.id;
      else if (gender === "FEMALE" || gender === "F") breakdown.FEMALE += stat._count.id;
      else if (gender === "CHILD"  || gender === "C") breakdown.CHILD  += stat._count.id;
      else breakdown.OTHER += stat._count.id;
    });

    return res.status(200).json(
      ApiResponse.success("Gender breakdown retrieved successfully", breakdown)
    );
  } catch (error) {
    logger.error("[Gender Breakdown Error]:", error);
    return res.status(500).json(ApiResponse.error("Failed to fetch gender breakdown", null, 500));
  }
});

/**
 * @swagger
 * /api/analytics/policy-status-breakdown/:
 *   get:
 *     summary: Get policy status breakdown
 *     description: Returns count of active (non-deleted) policies grouped by status.
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Policy status breakdown retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ACTIVE:   { type: integer }
 *                     INACTIVE: { type: integer }
 *                     PENDING:  { type: integer }
 *                     LAPSED:   { type: integer }
 *                     EXPIRED:  { type: integer }
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to fetch policy status breakdown
 */
router.get("/analytics/policy-status-breakdown/", async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found in request", null, 401));
    }

    const policyStats = await prisma.policy.groupBy({
      by: ["status"],
      where: { agent_id: agentId, deleted_at: null },
      _count: { id: true },
    });

    const breakdown = { ACTIVE: 0, INACTIVE: 0, PENDING: 0, LAPSED: 0, EXPIRED: 0 };

    policyStats.forEach((stat) => {
      const status = (stat.status || "PENDING").toUpperCase();
      if (status in breakdown) {
        breakdown[status] = stat._count.id;
      }
    });

    return res.status(200).json(
      ApiResponse.success("Policy status breakdown retrieved successfully", breakdown)
    );
  } catch (error) {
    logger.error("[Policy Status Breakdown Error]:", error);
    return res.status(500).json(ApiResponse.error("Failed to fetch policy status breakdown", null, 500));
  }
});

module.exports = router;
