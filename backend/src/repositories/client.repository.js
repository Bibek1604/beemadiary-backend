const BaseRepository = require("./base.repository");

class ClientRepository extends BaseRepository {
  constructor() {
    super("client");
  }
}

module.exports = new ClientRepository();
