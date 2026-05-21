const { prisma } = require("../config/db");

/**
 * Base Repository providing common database operations using Prisma
 */
class BaseRepository {
  /**
   * @param {string} modelName - Model name in lowercase camelCase (matching prisma client keys e.g. 'admin', 'company')
   */
  constructor(modelName) {
    this.model = prisma[modelName];
    this.modelName = modelName;
  }

  /**
   * Checks if model supports soft delete (i.e. has deleted_at field)
   * @returns {boolean}
   */
  hasSoftDelete() {
    const softDeleteModels = ["admin", "company", "agent", "client", "policy", "transaction"];
    return softDeleteModels.includes(this.modelName.toLowerCase());
  }

  /**
   * Find multiple records with filters, order, and pagination
   * @param {object} options - query options
   */
  async findMany(options = {}) {
    const { where = {}, include, orderBy, skip, take, select } = options;

    // Apply soft delete filter if applicable and not explicitly bypassed
    if (this.hasSoftDelete() && where.deleted_at === undefined) {
      where.deleted_at = null;
    }

    return this.model.findMany({
      where,
      include,
      orderBy,
      skip: skip !== undefined ? parseInt(skip, 10) : undefined,
      take: take !== undefined ? parseInt(take, 10) : undefined,
      select,
    });
  }

  /**
   * Count records matching a filter
   * @param {object} where - filter criteria
   */
  async count(where = {}) {
    if (this.hasSoftDelete() && where.deleted_at === undefined) {
      where.deleted_at = null;
    }
    return this.model.count({ where });
  }

  /**
   * Find record by its primary key ID
   * @param {string} id - Record UUID
   * @param {object} include - Prisma includes relation object
   */
  async findById(id, include) {
    const where = { id };
    if (this.hasSoftDelete()) {
      where.deleted_at = null;
    }
    return this.model.findFirst({
      where,
      include,
    });
  }

  /**
   * Find a single record matching filter criteria
   * @param {object} where - query filter criteria
   * @param {object} include - Prisma includes relation object
   */
  async findOne(where = {}, include) {
    if (this.hasSoftDelete() && where.deleted_at === undefined) {
      where.deleted_at = null;
    }
    return this.model.findFirst({
      where,
      include,
    });
  }

  /**
   * Create a new record
   * @param {object} data - Model creation payload
   */
  async create(data) {
    return this.model.create({ data });
  }

  /**
   * Update an existing record
   * @param {string} id - Record UUID
   * @param {object} data - update changes payload
   */
  async update(id, data) {
    return this.model.update({
      where: { id },
      data,
    });
  }

  /**
   * Performs soft delete (sets deleted_at) or hard delete depending on model capacity
   * @param {string} id - Record UUID
   */
  async delete(id) {
    if (this.hasSoftDelete()) {
      return this.model.update({
        where: { id },
        data: { deleted_at: new Date() },
      });
    }
    return this.model.delete({
      where: { id },
    });
  }

  /**
   * Force hard delete a record even if soft delete is supported
   * @param {string} id - Record UUID
   */
  async hardDelete(id) {
    return this.model.delete({
      where: { id },
    });
  }
}

module.exports = BaseRepository;
