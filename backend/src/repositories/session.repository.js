const BaseRepository = require("./base.repository");

class SessionRepository extends BaseRepository {
  constructor() {
    super("session");
  }
}

module.exports = new SessionRepository();
