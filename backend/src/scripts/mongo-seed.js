/**
 * MongoDB seed script.
 *
 * Run with:  npm run seed
 *
 * Uses the Prisma-compatible Mongo adapter exposed by src/config/db.js so the
 * same API used everywhere else in the codebase is used here too.
 */
require("dotenv/config");
const { prisma } = require("../config/db");
const bcrypt = require("bcryptjs");

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const allowProductionSeed = process.env.ALLOW_SEED_IN_PRODUCTION === "true";

  if (isProduction && !allowProductionSeed) {
    throw new Error(
      "Refusing to run seed in production. Set ALLOW_SEED_IN_PRODUCTION=true only when you intentionally want to reseed a live database."
    );
  }

  console.log("Seeding MongoDB data...");

  if (isProduction) {
    console.warn("Production seed override enabled. Existing admin, agent, client, and policy records will be upserted.");
  }

  const adminEmail = "admin@beemadiary.com";
  const agentEmail = "agent@test.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const agentPassword = process.env.SEED_AGENT_PASSWORD;

  if (!adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD is required");
  }

  if (!agentPassword) {
    throw new Error("SEED_AGENT_PASSWORD is required");
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const agentPasswordHash = await bcrypt.hash(agentPassword, 10);

  const companyEmail = "beemadiary@company.local";
  const existingCompany = await prisma.company.findUnique({ where: { email: companyEmail } });
  const companyData = {
    name: "BeemaDiary Insurance",
    email: companyEmail,
    phone_number: "+10000000001",
    image: "https://placehold.co/400x400?text=BeemaDiary",
    address: "Kathmandu, Nepal",
    status: "ACTIVE",
  };
  const company = existingCompany
    ? await prisma.company.update({ where: { email: companyEmail }, data: companyData })
    : await prisma.company.create({ data: companyData });

  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } });
  const adminData = {
    username: "admin",
    email: adminEmail,
    phone: "+10000000000",
    password_hash: passwordHash,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  };
  const admin = existingAdmin
    ? await prisma.admin.update({ where: { email: adminEmail }, data: adminData })
    : await prisma.admin.create({ data: adminData });

  const existingAgent = await prisma.agent.findUnique({ where: { email: agentEmail } });
  const agentData = {
    agent_code: "TEST001",
    full_name: "Test Agent",
    email: agentEmail,
    phone_number: "9999999999",
    password_hash: agentPasswordHash,
    status: "ACTIVE",
    company_id: company.id,
  };
  const agent = existingAgent
    ? await prisma.agent.update({ where: { email: agentEmail }, data: agentData })
    : await prisma.agent.create({ data: agentData });

  console.log("Seed complete:");
  console.log("- Company:", company.name);
  console.log("- Admin:", admin.email);
  console.log("- Agent:", agent.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma.$disconnect) {
      await prisma.$disconnect();
    }
  });
