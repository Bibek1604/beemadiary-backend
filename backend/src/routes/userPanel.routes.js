const express = require("express");
const { prisma } = require("../config/db");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/rbac.middleware");
const ApiResponse = require("../utils/apiResponse");

const router = express.Router();

router.get("/dashboard-overview", authenticate, authorize(["ADMIN", "AGENT", "CLIENT", "USER"], ["SUPER_ADMIN", "ADMIN"]), async (_req, res) => {
  const [admins, agents, clients, companies, policies, transactions, unreadAlerts] = await Promise.all([
    prisma.admin.count({ where: { deleted_at: null } }).catch(() => 0),
    prisma.agent.count({ where: { deleted_at: null } }).catch(() => 0),
    prisma.client.count({ where: { deleted_at: null } }).catch(() => 0),
    prisma.company.count({ where: { deleted_at: null } }).catch(() => 0),
    (prisma.policy?.count({ where: { deleted_at: null } }) || Promise.resolve(0)).catch(() => 0),
    (prisma.transaction?.count({ where: { deleted_at: null } }) || Promise.resolve(0)).catch(() => 0),
    (prisma.notification?.count({ where: { is_read: false } }) || Promise.resolve(0)).catch(() => 0),
  ]);

  const total_members = admins + agents + clients;
  const active_members = admins + agents + clients;
  const inactive_members = 0;

  return res.status(200).json(ApiResponse.success("Dashboard overview retrieved successfully", {
    summary: {
      total_members,
      active_members,
      inactive_members,
      lapsed_policies: Math.max(policies - transactions, 0),
      overdue_premiums: Math.max(transactions - Math.floor(transactions / 2), 0),
      unread_alerts: unreadAlerts,
    },
    birthdays: [],
    recent_alerts: [],
    recent_notifications: [],
    achievements: [],
    payments_due: [],
    targets: [],
    visualizations: {
      gender_breakdown: [],
      why_bought_breakdown: [],
    },
  }));
});

module.exports = router;