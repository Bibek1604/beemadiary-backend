const BaseRepository = require("./base.repository");

class CompanyRepository extends BaseRepository {
  constructor() {
    super("company");
  }
}

module.exports = new CompanyRepository();
