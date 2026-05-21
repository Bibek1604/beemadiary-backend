const bulkNotificationService = require("../services/bulkNotification.service");
const asyncHandler = require("../utils/asyncHandler");
const ApiResponse = require("../utils/apiResponse");

/**
 * Bulk Notification Controllers
 */

/**
 * POST /api/admin/bulk-notifications
 * Send a notification (single agent or all agents)
 */
const createNotification = asyncHandler(async (req, res) => {
  const { title, content, target_type, target_agent_id } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  const notification = await bulkNotificationService.createNotification(
    { title, content, target_type, target_agent_id },
    req.user.id,
    ipAddress
  );

  return res.status(201).json(
    ApiResponse.success("Notification sent successfully", notification)
  );
});

/**
 * GET /api/admin/bulk-notifications
 * Get all notifications with pagination and search
 */
const getAllNotifications = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;

  const result = await bulkNotificationService.getAllNotifications({
    page,
    limit,
    search,
  });

  return res.status(200).json(
    ApiResponse.success("Notifications retrieved successfully", result)
  );
});

/**
 * GET /api/admin/bulk-notifications/:id
 * Get a single notification by ID
 */
const getNotificationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await bulkNotificationService.getNotificationById(id);

  return res.status(200).json(
    ApiResponse.success("Notification retrieved successfully", notification)
  );
});

/**
 * DELETE /api/admin/bulk-notifications/:id
 * Soft delete a notification
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  await bulkNotificationService.deleteNotification(id, req.user.id, ipAddress);

  return res.status(200).json(
    ApiResponse.success("Notification deleted successfully", { id })
  );
});

module.exports = {
  createNotification,
  getAllNotifications,
  getNotificationById,
  deleteNotification,
};
