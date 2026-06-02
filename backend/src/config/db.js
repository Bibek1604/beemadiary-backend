const mongoClientModule = require("./mongoClient");

const prisma = mongoClientModule.default || mongoClientModule;
const { MongoConnectionManager } = mongoClientModule;

module.exports = {
  prisma,
  MongoConnectionManager,
};
