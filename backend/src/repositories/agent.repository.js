const BaseRepository = require("./base.repository");

class AgentRepository extends BaseRepository {
  constructor() {
    super("agent");
  }
}

module.exports = new AgentRepository();
