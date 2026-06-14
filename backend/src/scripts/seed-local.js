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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@localhost.com";
const ADMIN_PASSWORD =
  process.env.SEED_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || "Admin@123456";

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

// Generic idempotent upsert by any single field (used for clients by email and
// policies by policy_number).
async function upsertBy(model, field, value, data) {
  const existing = await model.findFirst({ where: { [field]: value } });
  return existing
    ? model.update({ where: { [field]: value }, data })
    : model.create({ data });
}

// ---------------------------------------------------------------------------
// Test dataset — 6 clients designed to exercise every list/notification.
// "Today" for these scenarios is mid-June 2026. The 6-month lapse threshold is
// therefore ~2025-12-14, premium dues look at the CURRENT month, and birthdays
// match clients whose dob month is June (today = the 14th).
// ---------------------------------------------------------------------------
const TEST_CLIENTS = [
  {
    client_id: "BM-000000000101",
    first_name: "Ram", last_name: "Bahadur", email: "ram.lapsed@example.com",
    phone: "9810000101", gender: "MALE", dob: "1985-03-10", member_group: "Individual",
    created_at: "2026-01-15",
    policy: {
      policy_number: "LIC-SEED-101", plan_name: "Jeevan Anand", plan_no: "815",
      premium_amount: 12000, sum_assured: 500000,
      premium_due_date: "2025-09-15", premium_status: "DUE", status: "LAPSED",
    },
    scenario: "6+ months overdue -> LAPSED list + Outdated list",
  },
  {
    client_id: "BM-000000000102",
    first_name: "Sita", last_name: "Sharma", email: "sita.bday@example.com",
    phone: "9810000102", gender: "FEMALE", dob: "1990-06-14", member_group: "Individual",
    created_at: "2026-02-20",
    policy: {
      policy_number: "LIC-SEED-102", plan_name: "Jeevan Labh", plan_no: "936",
      premium_amount: 9000, sum_assured: 400000,
      premium_due_date: "2026-09-01", premium_status: "PAID", status: "ACTIVE",
    },
    scenario: "Birthday TODAY (Jun 14) -> birthday-today notification + this-month birthdays",
  },
  {
    client_id: "BM-000000000103",
    first_name: "Hari", last_name: "Thapa", email: "hari.due@example.com",
    phone: "9810000103", gender: "MALE", dob: "1988-06-25", member_group: "Family",
    created_at: "2026-03-10",
    policy: {
      policy_number: "LIC-SEED-103", plan_name: "New Endowment", plan_no: "914",
      premium_amount: 8000, sum_assured: 350000,
      premium_due_date: "2026-06-28", premium_status: "DUE", status: "ACTIVE",
    },
    scenario: "Birthday this month (Jun 25) + premium due this month -> Premium Dues + due reminder",
  },
  {
    client_id: "BM-000000000104",
    first_name: "Gita", last_name: "Rai", email: "gita.overdue@example.com",
    phone: "9810000104", gender: "FEMALE", dob: "1995-01-20", member_group: "Individual",
    created_at: "2026-04-05",
    policy: {
      policy_number: "LIC-SEED-104", plan_name: "Jeevan Umang", plan_no: "945",
      premium_amount: 6000, sum_assured: 300000,
      premium_due_date: "2026-02-10", premium_status: "DUE", status: "ACTIVE",
    },
    scenario: "~4 months overdue (3-5) -> Overdue warning zone (not yet lapsed)",
  },
  {
    client_id: "BM-000000000105",
    first_name: "Aayush", last_name: "Karki", email: "aayush.child@example.com",
    phone: "9810000105", gender: "CHILD", dob: "2015-11-05", member_group: "Child",
    created_at: "2026-05-12",
    policy: {
      policy_number: "LIC-SEED-105", plan_name: "Children Money Back", plan_no: "832",
      premium_amount: 5000, sum_assured: 250000,
      premium_due_date: "2026-12-01", premium_status: "PAID", status: "ACTIVE",
    },
    scenario: "Child member, paid & active -> gender/member breakdown",
  },
  {
    client_id: "BM-000000000106",
    first_name: "Maya", last_name: "Gurung", email: "maya.new@example.com",
    phone: "9810000106", gender: "FEMALE", dob: "1992-08-12", member_group: "Individual",
    created_at: "2026-06-10",
    policy: {
      policy_number: "LIC-SEED-106", plan_name: "Jeevan Jyoti", plan_no: "823",
      premium_amount: 7000, sum_assured: 320000,
      premium_due_date: "2026-06-30", premium_status: "DUE", status: "PENDING",
    },
    scenario: "Enrolled this month + due this month -> New client + Premium Dues + monthly graph",
  },
];

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

  // 4) Test clients + policies (linked to the seeded agent)
  for (const c of TEST_CLIENTS) {
    const birthYear = Number(c.dob.slice(0, 4));
    const client = await upsertBy(prisma.client, "email", c.email, {
      client_id: c.client_id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      phone: c.phone,
      secondary_phone: null,
      address: "Kathmandu, Nepal",
      dob: new Date(c.dob),
      age: 2026 - birthYear,
      gender: c.gender,
      nominee_name: `${c.first_name}'s Nominee`,
      relation_with_nominee: "Spouse",
      father_name: `${c.first_name} Senior`,
      mother_name: `${c.first_name}'s Mother`,
      grandfather_name: `${c.first_name} Senior-most`,
      profession: "Service",
      member_group: c.member_group,
      reason_for_insurance: "Protection",
      status: "ACTIVE",
      agent_id: user.id,
      created_at: new Date(c.created_at),
      deleted_at: null,
    });

    const p = c.policy;
    await upsertBy(prisma.policy, "policy_number", p.policy_number, {
      policy_number: p.policy_number,
      plan_name: p.plan_name,
      plan_no: p.plan_no,
      policy_term: "20 years",
      sum_assured: p.sum_assured,
      premium_amount: p.premium_amount,
      premium_due_date: p.premium_due_date, // "YYYY-MM-DD" string (parsed by businessDate)
      premium_status: p.premium_status,
      premium_paid: p.premium_status === "PAID" ? p.premium_amount : 0,
      status: p.status,
      bank_name: "Nepal Bank Ltd",
      bank_account: "0123456789",
      branch: "Kathmandu Main",
      client_id: client.id,
      agent_id: user.id,
      company_id: company.id,
      created_at: new Date(c.created_at),
      deleted_at: null,
    });
  }

  console.log("\n  Seed complete. You can log in with:\n");
  console.log("  ADMIN");
  console.log("    endpoint : POST /api/admin/login");
  console.log(`    email    : ${admin.email}`);
  console.log(`    password : ${ADMIN_PASSWORD}`);
  console.log("\n  USER (agent)");
  console.log("    endpoint : POST /api/agent/login   (alias: /api/users/login)");
  console.log(`    email    : ${user.email}`);
  console.log(`    password : ${USER_PASSWORD}`);

  console.log(`\n  Seeded ${TEST_CLIENTS.length} test clients (all owned by ${user.email}):`);
  for (const c of TEST_CLIENTS) {
    console.log(`    - ${c.first_name} ${c.last_name} (${c.gender}) :: ${c.scenario}`);
  }
  console.log("\n  Expected results when you log in as the agent:");
  console.log("    Lapsed list .......... Ram Bahadur (LIC-SEED-101)");
  console.log("    Outdated (6m+) ....... Ram Bahadur");
  console.log("    Overdue warning ...... Gita Rai (~4 months)");
  console.log("    Premium dues (June) .. Hari Thapa, Maya Gurung");
  console.log("    Birthdays this month . Sita Sharma (14th), Hari Thapa (25th)");
  console.log("    Birthday TODAY ....... Sita Sharma");
  console.log("    New this month ....... Maya Gurung");
  console.log("    Policy statuses ...... 4 ACTIVE, 1 PENDING, 1 LAPSED");
  console.log("    Gender breakdown ..... 2 MALE, 3 FEMALE, 1 CHILD");
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
