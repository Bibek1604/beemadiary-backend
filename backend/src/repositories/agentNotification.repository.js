const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const BaseRepository = require("./base.repository");

class AgentNotificationRepository extends BaseRepository {
  constructor() {
    super("bulkNotification");
  }

  /**
   * Find notifications for a specific agent (Target SINGLE & matching target_agent_id OR Target ALL)
   */
  async findAgentNotifications(agentId, { page = 1, limit = 10, search, is_read }) {
    const skip = (page - 1) * limit;

    const where = {
      OR: [
        { target_type: "ALL" },
        { target_type: "SINGLE", target_agent_id: agentId },
      ],
      deleted_at: null,
    };

    if (search) {
      where.OR = where.OR.map((condition) => ({
        ...condition,
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { content: { contains: search, mode: "insensitive" } },
        ],
      }));
    }

    if (is_read !== undefined) {
      if (is_read === true || is_read === "true") {
        where.reads = {
          some: {
            agent_id: agentId,
            is_read: true,
          },
        };
      } else {
        where.reads = {
          none: {
            agent_id: agentId,
            is_read: true,
          },
        };
      }
    }

    const [notifications, total] = await Promise.all([
      prisma.bulkNotification.findMany({
        where,
        skip,
        take: parseInt(limit, 10),
        orderBy: { created_at: "desc" },
        include: {
          creator: { select: { id: true, username: true, email: true } },
          reads: {
            where: { agent_id: agentId },
            select: { is_read: true, read_at: true },
          },
        },
      }),
      prisma.bulkNotification.count({ where }),
    ]);

    // Format the result to include is_read at the root level for the specific agent
    const formattedNotifications = notifications.map((notif) => {
      const readStatus = notif.reads[0];
      return {
        id: notif.id,
        title: notif.title,
        content: notif.content,
        target_type: notif.target_type,
        created_at: notif.created_at,
        creator: notif.creator,
        is_read: readStatus ? readStatus.is_read : false,
        read_at: readStatus ? readStatus.read_at : null,
      };
    });

    return {
      notifications: formattedNotifications,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findAgentNotificationById(agentId, notificationId) {
    const notification = await prisma.bulkNotification.findFirst({
      where: {
        id: notificationId,
        deleted_at: null,
        OR: [
          { target_type: "ALL" },
          { target_type: "SINGLE", target_agent_id: agentId },
        ],
      },
      include: {
        creator: { select: { id: true, username: true, email: true } },
        reads: {
          where: { agent_id: agentId },
          select: { is_read: true, read_at: true },
        },
      },
    });

    if (!notification) return null;

    const readStatus = notification.reads[0];
    return {
      id: notification.id,
      title: notification.title,
      content: notification.content,
      target_type: notification.target_type,
      created_at: notification.created_at,
      creator: notification.creator,
      is_read: readStatus ? readStatus.is_read : false,
      read_at: readStatus ? readStatus.read_at : null,
    };
  }

  async markAsRead(agentId, notificationId) {
    const existingRead = await prisma.notificationRead.findUnique({
      where: {
        notification_id_agent_id: {
          notification_id: notificationId,
          agent_id: agentId,
        },
      },
    });

    if (existingRead) {
      return prisma.notificationRead.update({
        where: { id: existingRead.id },
        data: { is_read: true, read_at: new Date() },
      });
    }

    return prisma.notificationRead.create({
      data: {
        notification_id: notificationId,
        agent_id: agentId,
        is_read: true,
        read_at: new Date(),
      },
    });
  }

  async getUnreadCount(agentId) {
    const where = {
      OR: [
        { target_type: "ALL" },
        { target_type: "SINGLE", target_agent_id: agentId },
      ],
      deleted_at: null,
      reads: {
        none: {
          agent_id: agentId,
          is_read: true,
        },
      },
    };

    return prisma.bulkNotification.count({ where });
  }
}

module.exports = new AgentNotificationRepository();