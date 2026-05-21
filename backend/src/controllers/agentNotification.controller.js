const agentNotificationService = require("../services/agentNotification.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getNotifications = asyncHandler(async (req, res) => {
  const agentId = req.user.id; // User must be logged in agent
  
  const options = {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 10,
    search: req.query.search,
    is_read: req.query.is_read
  };

  const result = await agentNotificationService.getNotifications(agentId, options);
  
  return res.status(200).json(
    ApiResponse.success("Notifications fetched successfully", result)
  );
});

const getNotificationById = asyncHandler(async (req, res) => {
  const agentId = req.user.id;
  const { id } = req.params;

  const notification = await agentNotificationService.getNotificationById(agentId, id);

  return res.status(200).json(
    ApiResponse.success("Notification details fetched successfully", notification)
  );
});

const markAsRead = asyncHandler(async (req, res) => {
  const agentId = req.user.id;
  const { id } = req.params;

  await agentNotificationService.markAsRead(agentId, id);

  return res.status(200).json(
    ApiResponse.success("Notification marked as read successfully")
  );
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const agentId = req.user.id;

  const data = await agentNotificationService.getUnreadCount(agentId);

  return res.status(200).json(
    ApiResponse.success("Unread notification count fetched successfully", data)
  );
});

module.exports = {
  getNotifications,
  getNotificationById,
  markAsRead,
  getUnreadCount
};