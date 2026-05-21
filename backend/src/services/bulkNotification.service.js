const bulkNotificationRepository = require("../repositories/bulkNotification.repository");
const agentRepository = require("../repositories/agent.repository");
const auditLogRepository = require("../repositories/audit.repository");

/**
 * Bulk Notification Management Business Logic Service
 */
class BulkNotificationService {
  /**
   * Create/Send a bulk notification
   * @param {object} notificationData - title, content, target_type, target_agent_id
   * @param {string} adminId - ID of the creating administrator
   * @param {string} ipAddress - Admin client IP address
   */
  async createNotification(notificationData, adminId, ipAddress) {
    const { title, content, target_type, target_agent_id } = notificationData;

    // Convert target_type to uppercase for DB enum
    const dbTargetType = target_type.toUpperCase();

    // If target_type is 'single', verify agent exists
    if (dbTargetType === "SINGLE") {
      const agent = await agentRepository.findById(target_agent_id);
      if (!agent) {
        const error = new Error("Target agent not found");
        error.statusCode = 404;
        error.errors = [`Agent with ID '${target_agent_id}' does not exist`];
        throw error;
      }
    }

    // Create the notification record
    const notification = await bulkNotificationRepository.create({
      title,
      content,
      target_type: dbTargetType,
      target_agent_id: dbTargetType === "SINGLE" ? target_agent_id : null,
      created_by: adminId,
    });

    // Log audit trail
    await auditLogRepository.create({
      user_id: adminId,
      user_type: "ADMIN",
      action: "NOTIFICATION_CREATE",
      details: {
        notification_id: notification.id,
        title: notification.title,
        target_type: notification.target_type,
        target_agent_id: notification.target_agent_id,
      },
      ip_address: ipAddress || null,
    }).catch(err => {
      console.error("Audit log creation failed during notification create:", err);
    });

    // Return with relations populated
    return bulkNotificationRepository.findByIdWithRelations(notification.id);
  }

  /**
   * Get all notifications with pagination and search
   * @param {object} queryParams - { page, limit, search }
   */
  async getAllNotifications(queryParams) {
    const { page, limit, search } = queryParams;
    return bulkNotificationRepository.findWithPagination({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 10,
      search: search || "",
    });
  }

  /**
   * Get a single notification by ID
   * @param {string} id - Notification UUID
   */
  async getNotificationById(id) {
    const notification = await bulkNotificationRepository.findByIdWithRelations(id);

    if (!notification) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      error.errors = [`Notification with ID '${id}' does not exist or has been deleted`];
      throw error;
    }

    return notification;
  }

  /**
   * Soft delete a notification
   * @param {string} id - Notification UUID
   * @param {string} adminId - ID of the deleting administrator
   * @param {string} ipAddress - Admin client IP address
   */
  async deleteNotification(id, adminId, ipAddress) {
    // Check existence first
    const existing = await bulkNotificationRepository.findByIdWithRelations(id);

    if (!existing) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      error.errors = [`Notification with ID '${id}' does not exist or has been deleted`];
      throw error;
    }

    // Soft delete
    await bulkNotificationRepository.delete(id);

    // Log audit trail
    await auditLogRepository.create({
      user_id: adminId,
      user_type: "ADMIN",
      action: "NOTIFICATION_DELETE",
      details: {
        notification_id: id,
        title: existing.title,
      },
      ip_address: ipAddress || null,
    }).catch(err => {
      console.error("Audit log creation failed during notification delete:", err);
    });

    return { id, deleted: true };
  }
}

module.exports = new BulkNotificationService();
