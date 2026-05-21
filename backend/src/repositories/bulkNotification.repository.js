const BaseRepository = require("./base.repository");

class BulkNotificationRepository extends BaseRepository {
  constructor() {
    super("bulkNotification");
  }

  /**
   * Find notifications with pagination, search, and relations
   * @param {object} options - { page, limit, search }
   * @returns {object} { data, total, page, limit, totalPages }
   */
  async findWithPagination({ page = 1, limit = 10, search = "" }) {
    const skip = (page - 1) * limit;

    const where = { deleted_at: null };

    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim(), mode: "insensitive" } },
        { content: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const include = {
      target_agent: {
        select: {
          id: true,
          full_name: true,
          email: true,
        },
      },
      creator: {
        select: {
          id: true,
          username: true,
          email: true,
        },
      },
    };

    const [data, total] = await Promise.all([
      this.model.findMany({
        where,
        include,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      this.model.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Find a notification by ID with related data
   * @param {string} id - UUID of notification
   * @returns {object|null}
   */
  async findByIdWithRelations(id) {
    return this.model.findFirst({
      where: { id, deleted_at: null },
      include: {
        target_agent: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            email: true,
          },
        },
        creator: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });
  }
}

module.exports = new BulkNotificationRepository();
