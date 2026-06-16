/**
 * Local seed script — creates a WORKING admin and a WORKING user (agent)
 * that you can immediately log in with on a local deployment.
 *
 * Why this exists:
 *   Agent/user self-registration is DISABLED in this app (see auth.routes.js).
 *   So the only way to get a login-able account locally is to seed it.
 *
 * What it creates (idempotent — safe to run repeatedly):
 *   - 1 Company   (so the agent has a valid company_id)
 *   - 1 Admin     -> log in at  POST /api/admin/login
 *   - 1 Agent/User-> log in at  POST /api/agent/login   (alias: /api/users/login)
 *
 * Credentials are read from environment variables (with sensible local
 * defaults), so you can override them without editing this file.
 *
 * Run with:   npm run seed:local
 */

const path = require("path");
const dotenv = require("dotenv");

// Load env: the environment-specific file first (so it wins), then the base
// .env as a fallback. This matches running locally with NODE_ENV=development.
const nodeEnv = process.env.NODE_ENV || "development";
dotenv.config({ path: path.join(__dirname, "../../", `.env.${nodeEnv}`) });
dotenv.config({ path: path.join(__dirname, "../../", ".env") });

const bcrypt = require("bcryptjs");
const { prisma } = require("../config/db");

// ---------------------------------------------------------------------------
// Configurable credentials (env first, then safe local defaults)
// ---------------------------------------------------------------------------
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@beemadiary.com";
const ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "Admin@123456@beemadiary@kts";

const USER_EMAIL =
  process.env.SEED_AGENT_EMAIL || process.env.SEED_USER_EMAIL || "agent@localhost.com";
const USER_PASSWORD =
  process.env.SEED_AGENT_PASSWORD || process.env.SEED_USER_PASSWORD || "Agent@123456";

async function upsertByEmail(model, email, data) {
  const existing = await model.findUnique({ where: { email } });
  return existing
    ? model.update({ where: { email }, data })
    : model.create({ data });
}

async function main() {
  const isProduction = process.env.NODE_ENV === "production";
  const allowProductionSeed = process.env.ALLOW_SEED_IN_PRODUCTION === "true";

  if (isProduction && !allowProductionSeed) {
    throw new Error(
      "Refusing to seed in production. Set ALLOW_SEED_IN_PRODUCTION=true only if you really mean it."
    );
  }

  console.log(`\nSeeding local accounts (NODE_ENV=${nodeEnv})...`);

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const userHash = await bcrypt.hash(USER_PASSWORD, 10);

  // 1) Company (gives the agent a valid company_id)
  const companyEmail = "beemadiary@company.local";
  const company = await upsertByEmail(prisma.company, companyEmail, {
    name: "BeemaDiary Insurance",
    email: companyEmail,
    phone_number: "+10000000001",
    image: "https://placehold.co/400x400?text=BeemaDiary",
    address: "Kathmandu, Nepal",
    status: "ACTIVE",
    deleted_at: null,
  });

  // 2) Admin  ->  POST /api/admin/login
  const admin = await upsertByEmail(prisma.admin, ADMIN_EMAIL, {
    username: "admin",
    email: ADMIN_EMAIL,
    phone: "+10000000000",
    password_hash: adminHash,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
    deleted_at: null,
  });

  // 3) Agent / User  ->  POST /api/agent/login  (alias /api/users/login)
  const user = await upsertByEmail(prisma.agent, USER_EMAIL, {
    agent_code: "LOCAL001",
    full_name: "Local Test User",
    email: USER_EMAIL,
    phone_number: "9999999999",
    password_hash: userHash,
    status: "ACTIVE",
    company_id: company.id,
    deleted_at: null,
  });

  console.log("\n  Seed complete. You can log in with:\n");
  console.log("  ADMIN");
  console.log("    endpoint : POST /api/admin/login");
  console.log(`    email    : ${admin.email}`);
  console.log(`    password : ${ADMIN_PASSWORD}`);
  console.log("\n  USER (agent)");
  console.log("    endpoint : POST /api/agent/login   (alias: /api/users/login)");
  console.log(`    email    : ${user.email}`);
  console.log(`    password : ${USER_PASSWORD}`);
  console.log("");
}

main()
  .catch((e) => {
    console.error("\nSeed failed:", e.message);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma.$disconnect) await prisma.$disconnect();
  });
