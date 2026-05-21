const BaseRepository = require("./base.repository");

class AdminRepository extends BaseRepository {
  constructor() {
    super("admin");
  }
}

module.exports = new AdminRepository();
