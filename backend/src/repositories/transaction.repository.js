const BaseRepository = require("./base.repository");

class TransactionRepository extends BaseRepository {
  constructor() {
    super("transaction");
  }
}

module.exports = new TransactionRepository();
