const BaseRepository = require("./base.repository");

class AuditLogRepository extends BaseRepository {
  constructor() {
    super("auditLog");
  }
}

module.exports = new AuditLogRepository();
