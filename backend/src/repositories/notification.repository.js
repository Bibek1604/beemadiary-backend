const BaseRepository = require("./base.repository");

class NotificationRepository extends BaseRepository {
  constructor() {
    super("notification");
  }
}

module.exports = new NotificationRepository();
