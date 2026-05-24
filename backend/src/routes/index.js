const express = require("express");
const router = express.Router();
const authRoutes = require("./auth.routes");
const companyRoutes = require("./company.routes");
const bulkNotificationRoutes = require("./bulkNotification.routes");
const agentNotificationRoutes = require("./agentNotification.routes");
const userRoutes = require("./user.routes");
const adminCompatRoutes = require("./admin.compat.routes");
const userPanelRoutes = require("./userPanel.routes");
const agentProfileRoutes = require("./agentProfile.routes");
const clientEnrollmentRoutes = require("./clientEnrollment.routes");
const policyRoutes = require("./policy.routes");
const clientPersonalRoutes = require("./clientPersonal.routes");
const clientDocumentsRoutes = require("./clientDocuments.routes");
const policyDetailsRoutes = require("./policyDetails.routes");
const policyBankDetailsRoutes = require("./policyBankDetails.routes");
const notesRoutes = require("./notes.routes");
const targetsRoutes = require("./targets.routes");
const analyticsRoutes = require("./analytics.routes");
const dashboardRoutes = require("./dashboard.routes");
const bcrypt = require("bcryptjs");
const { prisma } = require("../config/db");

/**
 * Seed endpoint - Creates test agent (DEVELOPMENT ONLY)
 */
router.get("/seed", async (req, res) => {
  try {
    // Check if agent already exists
    const existing = await prisma.agent.findUnique({
      where: { email: "agent@test.com" },
    });

    if (existing) {
      return res.status(200).json({
        status: true,
        message: "Test agent already exists",
        data: {
          email: "agent@test.com",
          password: "agent@123456",
        },
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash("agent@123456", 10);

    // Create agent
    const agent = await prisma.agent.create({
      data: {
        full_name: "Test Agent",
        email: "agent@test.com",
        phone_number: "9876543210",
        password_hash: hashedPassword,
        status: "ACTIVE",
      },
    });

    return res.status(201).json({
      status: true,
      message: "Test agent created successfully",
      data: {
        id: agent.id,
        email: agent.email,
        password: "agent@123456",
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Failed to seed database",
      error: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
router.get("/health", (req, res) => {
  return res.status(200).json({
    status: true,
    message: "Backend services are healthy",
    data: {
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    },
  });
});

// Import and mount child routes
// When mounted at /api, these map to /api/admin/login, etc.
router.use("/", authRoutes);
router.use("/", companyRoutes);
router.use("/admin", adminCompatRoutes);
router.use("/user-panel", userPanelRoutes);
router.use("/", bulkNotificationRoutes);
router.use("/", agentNotificationRoutes);
router.use("/", userRoutes);
router.use("/", agentProfileRoutes);
router.use("/", clientEnrollmentRoutes);
router.use("/", policyRoutes);
router.use("/", clientPersonalRoutes);
router.use("/", clientDocumentsRoutes);
router.use("/", policyDetailsRoutes);
router.use("/", policyBankDetailsRoutes);
router.use("/", notesRoutes);
router.use("/", targetsRoutes);
router.use("/", analyticsRoutes);
router.use("/", dashboardRoutes);

module.exports = router;

