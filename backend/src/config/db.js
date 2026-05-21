const { PrismaClient } = require("@prisma/client");
const env = require("./env");

const prisma = new PrismaClient({
  log: env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"],
});

module.exports = {
  prisma,
};
