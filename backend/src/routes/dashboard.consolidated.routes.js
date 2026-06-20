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

// All endpoints require authentication
router.use(authMiddleware);

/**
 * Consolidated dashboard API.
 *
 *   GET /api/dashboard            -> dashboard for the authenticated agent
 *   GET /api/dashboard/:agentId   -> same, with explicit agent id (agents may
 *                                    only request their own id; admins any)
 *
 * Query params:
 *   year      - year for the commencement (DOC) graph, default: current year
 *   duesMonth - "YYYY-MM" month for premium dues list, default: current month
 *
 * Single JSON response:
 *   today, portfolioStats, birthdays, premiumDues, overduePremiums,
 *   lapsedList, notifications, targets, calendarEvents,
 *   commencementGraph, clientBreakdown
 *
 * All date logic is timezone-safe (Asia/Kathmandu via utils/businessDate).
 * Lapse rule is day-aware: exactly 6 months overdue => NOT lapsed,
 * 6 months + 1 day => lapsed.
 */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const LAPSE_MONTHS = 6;   // months of non-payment before a policy lapses
const OVERDUE_MONTHS = 3; // months overdue before entering the warning zone

const {
  getTodayParts,
  parseDateParts,
  toIsoDate,
  isLapsedDueDate,
  monthsOverdue,
} = businessDate;

const pad2 = (n) => String(n).padStart(2, "0");

const clientName = (c) =>
  (c?.full_name && String(c.full_name).trim()) ||
  `${c?.first_name || ""} ${c?.last_name || ""}`.trim() ||
  "Client";

const isChildClient = (c) => {
  const gender = String(c?.gender || "").trim().toUpperCase();
  const group = String(c?.member_group || "").trim().toUpperCase();
  return gender === "CHILD" || gender === "C" || group === "CHILD";
};

const isPaidPolicy = (p) =>
  String(p?.premium_status || "").trim().toUpperCase() === "PAID";

async function buildDashboard(agentId, query) {
  const today = getTodayParts();

  // ---- Filters from query params (validated, safe defaults) ----
  let graphYear = Number.parseInt(query.year, 10);
  if (!Number.isInteger(graphYear) || graphYear < 1950 || graphYear > 2100) {
    graphYear = today.year;
  }

  let duesYear = today.year;
  let duesMonth = today.month;
  if (typeof query.duesMonth === "string") {
    const m = query.duesMonth.trim().match(/^(\d{4})-(\d{1,2})$/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
      duesYear = Number(m[1]);
      duesMonth = Number(m[2]);
    }
  }

  // ---- Load agent's data in parallel ----
  const [clients, allPolicies] = await Promise.all([
    prisma.client.findMany({
      where: { agent_id: agentId, deleted_at: null },
      select: {
        id: true,
        client_id: true,
        full_name: true,
        first_name: true,
        last_name: true,
        dob: true,
        gender: true,
        member_group: true,
        profile_picture: true,
        created_at: true,
      },
    }),
    prisma.policy.findMany({
      where: { agent_id: agentId, deleted_at: null },
      select: {
        id: true,
        policy_number: true,
        status: true,
        doc: true,
        premium_amount: true,
        premium_due_date: true,
        premium_status: true,
        client_id: true,
        created_at: true,
      },
    }),
  ]);

  const clientById = new Map(clients.map((c) => [c.id, c]));

  // Only consider policies that still belong to a live (non-deleted) client.
  // This self-heals any orphaned policies left over from older deletions so
  // counts like Active Portfolio, dues and overdue stay consistent with reality.
  const policies = allPolicies.filter((p) => clientById.has(p.client_id));

  // ---- Portfolio stats ----
  const totalClients = clients.length;

  const activePortfolio = policies.filter(
    (p) => String(p.status || "").trim().toUpperCase() === "ACTIVE"
  ).length;

  const newThisMonth = clients.filter((c) => {
    const parts = parseDateParts(c.created_at);
    return parts && parts.year === today.year && parts.month === today.month;
  }).length;

  // ---- Birthdays this month ----
  const birthdays = clients
    .map((c) => ({ client: c, dobParts: parseDateParts(c.dob) }))
    .filter(({ dobParts }) => dobParts && dobParts.month === today.month)
    .map(({ client, dobParts }) => ({
      id: client.id,
      name: clientName(client),
      first_name: client.first_name,
      last_name: client.last_name,
      photo: client.profile_picture || null,
      dob: toIsoDate(dobParts),
      day: dobParts.day,
      ageTurning:
        dobParts.year > 1900 && dobParts.year <= today.year
          ? today.year - dobParts.year
          : null,
    }))
    .sort((a, b) => a.day - b.day);

  // ---- Lapsed list (unpaid for more than 6 months — day-aware boundary) ----
  const lapsedPolicyIds = new Set();
  const lapsedList = policies
    .map((p) => ({ policy: p, dueParts: parseDateParts(p.premium_due_date) }))
    .filter(({ policy, dueParts }) => {
      if (isPaidPolicy(policy) || !dueParts) return false;
      return isLapsedDueDate(policy.premium_due_date, LAPSE_MONTHS, today);
    })
    .map(({ policy, dueParts }) => {
      lapsedPolicyIds.add(policy.id);
      const client = clientById.get(policy.client_id) || null;
      const overdueMonths = monthsOverdue(policy.premium_due_date, today);
      return {
        clientId: policy.client_id || null,
        name: clientName(client),
        photo: client?.profile_picture || null,
        policyNo: policy.policy_number || null,
        dueDate: toIsoDate(dueParts),
        lastPaidDate: null, // payment history not stored per policy in current schema
        monthsOverdue: overdueMonths,
        outstandingAmount: (Number(policy.premium_amount) || 0) * overdueMonths,
      };
    })
    .sort((a, b) => b.monthsOverdue - a.monthsOverdue);

  // ---- Premium dues for the selected month (unpaid only, excluding lapsed) ----
  const premiumDues = policies
    .map((p) => ({ policy: p, dueParts: parseDateParts(p.premium_due_date) }))
    .filter(
      ({ policy, dueParts }) =>
        !isPaidPolicy(policy) &&
        !lapsedPolicyIds.has(policy.id) &&
        dueParts &&
        dueParts.year === duesYear &&
        dueParts.month === duesMonth
    )
    .map(({ policy, dueParts }) => {
      const client = clientById.get(policy.client_id) || null;
      return {
        id: policy.id,
        clientId: policy.client_id || null,
        name: clientName(client),
        photo: client?.profile_picture || null,
        policyNo: policy.policy_number || null,
        amount: Number(policy.premium_amount) || 0,
        dueDate: toIsoDate(dueParts),
      };
    })
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  // ---- Overdue premiums (3+ months overdue, not yet lapsed — warning zone) ----
  const overduePremiums = policies
    .map((p) => ({ policy: p, dueParts: parseDateParts(p.premium_due_date) }))
    .filter(({ policy, dueParts }) => {
      if (isPaidPolicy(policy) || !dueParts || lapsedPolicyIds.has(policy.id)) return false;
      return monthsOverdue(policy.premium_due_date, today) >= OVERDUE_MONTHS;
    })
    .map(({ policy, dueParts }) => {
      const client = clientById.get(policy.client_id) || null;
      return {
        id: policy.id,
        clientId: policy.client_id || null,
        name: clientName(client),
        photo: client?.profile_picture || null,
        policyNo: policy.policy_number || null,
        amount: Number(policy.premium_amount) || 0,
        dueDate: toIsoDate(dueParts),
      };
    })
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));

  // ---- Commencement (DOC) graph ----
  const docYears = new Set([today.year]);
  const monthlyCounts = new Array(12).fill(0);
  policies.forEach((p) => {
    // Date of Commencement is optional; fall back to when the policy was
    // recorded so the graph still reflects real activity instead of "No data".
    const docParts = parseDateParts(p.doc) || parseDateParts(p.created_at);
    if (!docParts) return;
    docYears.add(docParts.year);
    if (docParts.year === graphYear) {
      monthlyCounts[docParts.month - 1] += 1;
    }
  });
  docYears.add(graphYear);
  const availableYears = [...docYears]
    .filter((y) => y >= 1950 && y <= 2100)
    .sort((a, b) => b - a);

  // ---- Client breakdown ----
  let male = 0;
  let female = 0;
  let child = 0;
  clients.forEach((c) => {
    if (isChildClient(c)) { child += 1; return; }
    const gender = String(c.gender || "").trim().toUpperCase();
    if (gender === "MALE" || gender === "M") male += 1;
    else if (gender === "FEMALE" || gender === "F") female += 1;
  });
  const adults = totalClients - child;
  const adultPercent = totalClients > 0 ? Math.round((adults / totalClients) * 100) : 0;
  const childPercent = totalClients > 0 ? 100 - adultPercent : 0;

  // ---- Calendar events (for the calendar widget) ----
  const calendarEvents = [];

  birthdays.forEach((b) => {
    if (b.dob) {
      calendarEvents.push({ date: b.dob, type: "BIRTHDAY", label: b.name, clientId: b.id });
    }
  });

  [...premiumDues, ...overduePremiums].forEach((d) => {
    if (d.dueDate) {
      calendarEvents.push({ date: d.dueDate, type: "DUE", label: d.name, clientId: d.clientId });
    }
  });

  lapsedList.forEach((l) => {
    if (l.dueDate) {
      calendarEvents.push({ date: l.dueDate, type: "LAPSED", label: l.name, clientId: l.clientId });
    }
  });

  // ---- Computed notifications (deduped by stable id, generated from live data) ----
  const notifications = [];

  lapsedList.forEach((l) => {
    notifications.push({
      id: `lapsed-${l.policyNo || l.clientId}`,
      type: "LAPSED",
      title: "Policy Lapsed",
      message: `Policy #${l.policyNo || "N/A"} for ${l.name} has lapsed — unpaid for ${l.monthsOverdue}+ months`,
      clientId: l.clientId,
      policyNo: l.policyNo,
      isRead: false,
      createdAt: today.iso,
    });
  });

  birthdays.forEach((b) => {
    if (b.day === today.day) {
      notifications.push({
        id: `birthday-${b.id}-${today.iso}`,
        type: "BIRTHDAY",
        title: "Client Birthday Today",
        message: `🎂 ${b.name}'s birthday is today!`,
        clientId: b.id,
        isRead: false,
        createdAt: today.iso,
      });
    }
  });

  const todayUtc = new Date(Date.UTC(today.year, today.month - 1, today.day));
  premiumDues.forEach((due) => {
    if (!due.dueDate) return;
    const duePts = parseDateParts(due.dueDate);
    if (!duePts) return;
    const dueUtc = new Date(Date.UTC(duePts.year, duePts.month - 1, duePts.day));
    const daysLeft = Math.round((dueUtc - todayUtc) / 86400000);
    if (daysLeft >= 0 && daysLeft <= 7) {
      notifications.push({
        id: `due-${due.id}`,
        type: "DUE",
        title: daysLeft === 0 ? "Premium Due Today" : "Premium Due Soon",
        message:
          daysLeft === 0
            ? `Premium for ${due.name} (Policy ${due.policyNo || "N/A"}) is due today`
            : `Premium for ${due.name} is due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
        clientId: due.clientId,
        policyNo: due.policyNo,
        isRead: false,
        createdAt: today.iso,
      });
    }
  });

  // ---- Monthly / yearly targets for the current period ----
  let targets = { monthly: { target: 0, achieved: 0 }, yearly: { target: 0, achieved: 0 } };
  try {
    const currentMonthPeriod = `${MONTHS_SHORT[today.month - 1]} ${today.year}`;
    const currentYearPeriod = `${today.year}`;

    const [mTarget, yTarget] = await Promise.all([
      prisma.agentTarget.findFirst({
        where: { agent_id: agentId, target_type: "MONTHLY", period_name: currentMonthPeriod, deleted_at: null },
      }),
      prisma.agentTarget.findFirst({
        where: { agent_id: agentId, target_type: "YEARLY", period_name: currentYearPeriod, deleted_at: null },
      }),
    ]);

    const monthStart = businessDate.businessMidnightUtc(today.year, today.month, 1);
    const monthEnd = today.month === 12
      ? businessDate.businessMidnightUtc(today.year + 1, 1, 1)
      : businessDate.businessMidnightUtc(today.year, today.month + 1, 1);
    const yearStart = businessDate.businessMidnightUtc(today.year, 1, 1);
    const yearEnd = businessDate.businessMidnightUtc(today.year + 1, 1, 1);

    const [monthlyAchieved, yearlyAchieved] = await Promise.all([
      prisma.client.count({
        where: { agent_id: agentId, deleted_at: null, created_at: { gte: monthStart, lt: monthEnd } },
      }),
      prisma.client.count({
        where: { agent_id: agentId, deleted_at: null, created_at: { gte: yearStart, lt: yearEnd } },
      }),
    ]);

    targets = {
      monthly: { target: mTarget ? Number(mTarget.target_value) : 0, achieved: monthlyAchieved },
      yearly: { target: yTarget ? Number(yTarget.target_value) : 0, achieved: yearlyAchieved },
    };
  } catch (_e) {
    // keep default zeros — agentTarget model may not exist in all environments
  }

  return {
    today: today.iso,
    timezone: businessDate.BUSINESS_TZ,
    agentId,
    portfolioStats: {
      totalClients,
      activePortfolio,
      newThisMonth,
      birthdaysThisMonth: birthdays.length,
    },
    birthdays,
    premiumDues,
    premiumDuesMonth: `${duesYear}-${pad2(duesMonth)}`,
    overduePremiums,
    lapsedList,
    notifications: {
      unreadCount: notifications.length,
      items: notifications,
    },
    targets,
    calendarEvents,
    commencementGraph: {
      year: graphYear,
      availableYears,
      monthlyCounts,
    },
    clientBreakdown: {
      male,
      female,
      child,
      total: totalClients,
      adultPercent,
      childPercent,
    },
  };
}

async function handleDashboardRequest(req, res) {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) {
      return res.status(401).json(ApiResponse.error("Agent ID not found in request", null, 401));
    }

    const requesterRole = String(req.user?.type || req.user?.role || "").toUpperCase();
    const requestedAgentId = req.params.agentId;

    // Agents may only access their own dashboard; admins may pass any agent id.
    let agentId = requesterId;
    if (requestedAgentId && requestedAgentId !== requesterId) {
      if (requesterRole === "ADMIN" || requesterRole === "SUPER_ADMIN") {
        agentId = requestedAgentId;
      } else {
        return res.status(403).json(
          ApiResponse.error("Forbidden", ["You can only access your own dashboard"], 403)
        );
      }
    }

    const dashboard = await buildDashboard(agentId, req.query || {});
    return res.status(200).json(ApiResponse.success("Dashboard data retrieved successfully", dashboard));
  } catch (error) {
    logger.error("[Consolidated Dashboard Error]:", error);
    return res.status(500).json(ApiResponse.error("Failed to fetch dashboard data", null, 500));
  }
}

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Get consolidated dashboard data for the authenticated agent
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Dashboard data retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get("/dashboard", handleDashboardRequest);
/**
 * @swagger
 * /api/dashboard/{agentId}:
 *   get:
 *     summary: Get consolidated dashboard data for a specific agent
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: agentId, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Dashboard data retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get("/dashboard/:agentId", handleDashboardRequest);

module.exports = router;
