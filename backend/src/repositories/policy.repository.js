const BaseRepository = require("./base.repository");

class PolicyRepository extends BaseRepository {
  constructor() {
    super("policy");
  }
}

module.exports = new PolicyRepository();
