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
  console.log("Seeding MongoDB data...");

  const adminEmail = "admin@beemadiary.com";
  const agentEmail = "agent@test.com";
  const clientEmail = "john@example.com";
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

  const existingClient = await prisma.client.findUnique({ where: { email: clientEmail } });
  const clientData = {
    first_name: "John",
    last_name: "Doe",
    email: clientEmail,
    phone: "9876543210",
    address: "123 Main St, City",
    agent_id: agent.id,
    status: "ACTIVE",
  };
  const client = existingClient
    ? await prisma.client.update({ where: { email: clientEmail }, data: clientData })
    : await prisma.client.create({ data: clientData });

  const policyNumber = "POL-2026-001";
  const existingPolicy = await prisma.policy.findUnique({ where: { policy_number: policyNumber } });
  const policyData = {
    policy_number: policyNumber,
    plan_name: "LIC Plan",
    plan_no: "123",
    policy_term: "20 years",
    premium_amount: 10000,
    sum_assured: 500000,
    bank_name: "HDFC",
    bank_account: "0123456789",
    branch: "Main",
    premium_due_date: "2026-12-01",
    premium_paid: 0,
    status: "PENDING",
    client_id: client.id,
    agent_id: agent.id,
    company_id: company.id,
  };
  const policy = existingPolicy
    ? await prisma.policy.update({ where: { policy_number: policyNumber }, data: policyData })
    : await prisma.policy.create({ data: policyData });

  console.log("Seed complete:");
  console.log("- Company:", company.name);
  console.log("- Admin:", admin.email);
  console.log("- Agent:", agent.email);
  console.log("- Client:", client.email);
  console.log("- Policy:", policy.policy_number);
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
