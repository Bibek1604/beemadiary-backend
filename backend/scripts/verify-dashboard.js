/* Functional verification of GET /api/dashboard with a stubbed database. */
const path = require("path");
const BACKEND = require("path").join(__dirname, "..");

// Same timezone logic as the route
const TZ = process.env.DASHBOARD_TIMEZONE || "Asia/Kathmandu";
const [TY, TM, TD] = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date()).split("-").map(Number);
const pad = (n) => String(n).padStart(2, "0");
const ym = (y, m) => { // normalize year/month after offset
  const d = new Date(Date.UTC(y, m - 1, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
};
const prev7 = ym(TY, TM - 7); // 7 months ago => overdue (>5 months)

// ---- Seed data ----
const clients = [
  { id: "c1", first_name: "Ram", last_name: "K", gender: "MALE", member_group: "ADULT", dob: "1990-" + pad(TM) + "-15", created_at: `${TY}-${pad(TM)}-03`, profile_picture: null },
  { id: "c2", first_name: "Sita", last_name: "S", gender: "FEMALE", member_group: "ADULT", dob: "1985-01-20", created_at: "2025-03-10", profile_picture: "pic.jpg" },
  { id: "c3", first_name: "Babu", last_name: "T", gender: "MALE", member_group: "CHILD", dob: "2018-" + pad(TM) + "-02", created_at: `${TY}-${pad(TM)}-01`, profile_picture: null },
  { id: "c4", first_name: "Hari", last_name: "B", gender: null, member_group: null, dob: null, created_at: "2024-12-31", profile_picture: null },
];
const policies = [
  { id: "p1", policy_number: "PN1", status: "ACTIVE", doc: `${TY}-02-10`, premium_amount: 5000, premium_due_date: `${TY}-${pad(TM)}-20`, premium_status: "DUE", client_id: "c1" },
  { id: "p2", policy_number: "PN2", status: "ACTIVE", doc: "2019-07-01", premium_amount: 2000, premium_due_date: `${prev7.y}-${pad(prev7.m)}-15`, premium_status: "DUE", client_id: "c2" },
  { id: "p3", policy_number: "PN3", status: "LAPSED", doc: `${TY}-${pad(TM)}-05`, premium_amount: 1500, premium_due_date: `${TY}-${pad(TM)}-05`, premium_status: "PAID", client_id: "c3" },
  { id: "p4", policy_number: "PN4", status: "PENDING", doc: null, premium_amount: 0, premium_due_date: null, premium_status: null, client_id: "c4" },
];

// ---- Stub db + auth middleware in require cache ----
function stub(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub(path.join(BACKEND, "src/config/db.js"), {
  prisma: {
    client: { findMany: async () => clients },
    policy: { findMany: async () => policies },
  },
});
stub(path.join(BACKEND, "src/middlewares/auth.middleware.js"), (req, _res, next) => {
  req.user = { id: "agent1", type: "AGENT" };
  next();
});

const express = require(path.join(BACKEND, "node_modules/express"));
const router = require(path.join(BACKEND, "src/routes/dashboard.consolidated.routes.js"));
const app = express();
app.use("/api", router);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
};

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };

  // 1. Default dashboard
  const { status, body } = await get("/dashboard");
  const d = body.data;
  check("http 200", status, 200);
  check("today", d.today, `${TY}-${pad(TM)}-${pad(TD)}`);
  check("portfolioStats", d.portfolioStats, { totalClients: 4, activePortfolio: 2, newThisMonth: 2, birthdaysThisMonth: 2 });
  check("birthdays order", d.birthdays.map(b => b.id), ["c3", "c1"]);
  check("birthday ageTurning", d.birthdays.map(b => b.ageTurning), [TY - 2018, TY - 1990]);
  check("premiumDues (current month)", d.premiumDues.map(x => [x.id, x.name, x.policyNo, x.amount, x.dueDate]), [["p1", "Ram K", "PN1", 5000, `${TY}-${pad(TM)}-20`]]);
  // p2 is unpaid 7 months => LAPSED: excluded from dues/overdue, present in lapsedList
  check("overduePremiums excludes lapsed", d.overduePremiums.map(x => x.id), []);
  check("lapsedList contains p2", (d.lapsedList || []).map(x => x.policyNo), ["PN2"]);
  const expCounts = new Array(12).fill(0); expCounts[1] += 1; expCounts[TM - 1] += 1; // Feb + current month (p1 doc Feb, p3 doc current)
  check("commencementGraph.year", d.commencementGraph.year, TY);
  check("commencementGraph.monthlyCounts", d.commencementGraph.monthlyCounts, expCounts);
  check("availableYears has 2019+current", [d.commencementGraph.availableYears.includes(2019), d.commencementGraph.availableYears.includes(TY)], [true, true]);
  check("clientBreakdown", d.clientBreakdown, { male: 1, female: 1, child: 1, total: 4, adultPercent: 75, childPercent: 25 });

  // 2. Year filter (DOC 2019 => July count 1)
  const y2019 = (await get("/dashboard?year=2019")).body.data;
  const exp2019 = new Array(12).fill(0); exp2019[6] = 1;
  check("year=2019 counts", y2019.commencementGraph.monthlyCounts, exp2019);

  // 3. duesMonth filter (7 months back => p2)
  const dm = `${prev7.y}-${pad(prev7.m)}`;
  const old = (await get(`/dashboard?duesMonth=${dm}`)).body.data;
  check(`duesMonth=${dm} (lapsed excluded from dues)`, old.premiumDues.map(x => x.id), []);
  check("duesMonth echo", old.premiumDuesMonth, dm);

  // 4. Explicit agent id (own) + forbidden (other)
  check("own agentId 200", (await get("/dashboard/agent1")).status, 200);
  check("other agentId 403", (await get("/dashboard/agent2")).status, 403);

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  server.close();
  process.exit(failures === 0 ? 0 : 1);
});
