const express = require("express");
const router = express.Router();
const authRoutes = require("./auth.routes");
const companyRoutes = require("./company.routes");
const bulkNotificationRoutes = require("./bulkNotification.routes");
const agentNotificationRoutes = require("./agentNotification.routes");

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
router.use("/", bulkNotificationRoutes);
router.use("/", agentNotificationRoutes);

module.exports = router;

