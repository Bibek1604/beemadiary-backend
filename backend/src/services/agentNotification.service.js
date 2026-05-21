const agentNotificationRepository = require("../repositories/agentNotification.repository");
const auditLogRepository = require("../repositories/audit.repository");

class AgentNotificationService {
  async getNotifications(agentId, options) {
    return await agentNotificationRepository.findAgentNotifications(agentId, options);
  }

  async getNotificationById(agentId, notificationId) {
    const notification = await agentNotificationRepository.findAgentNotificationById(agentId, notificationId);
    
    if (!notification) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      error.errors = [`Notification with ID '${notificationId}' does not exist or you do not have permission to view it`];
      throw error;
    }
    
    return notification;
  }

  async markAsRead(agentId, notificationId) {
    // Check if notification exists and belongs to the agent
    const notification = await agentNotificationRepository.findAgentNotificationById(agentId, notificationId);
    if (!notification) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      error.errors = [`Notification with ID '${notificationId}' does not exist or you do not have permission to access it`];
      throw error;
    }

    // Mark as read
    await agentNotificationRepository.markAsRead(agentId, notificationId);

    // Audit log
    await auditLogRepository.create({
      user_id: agentId,
      user_type: "AGENT",
      action: "NOTIFICATION_MARKED_READ",
      details: { notification_id: notificationId },
    });

    return { success: true };
  }

  async getUnreadCount(agentId) {
    const unread_count = await agentNotificationRepository.getUnreadCount(agentId);
    return { unread_count };
  }
}

module.exports = new AgentNotificationService();