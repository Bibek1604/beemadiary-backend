/**
 * Runtime verification of audited endpoints using an in-memory DB stub.
 * Run from backend/backend:  node scripts/verify-audit.js
 */
const path = require("path");
const BACKEND = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND, ".env") });
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || "test-admin-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh";
process.env.JWT_ADMIN_REFRESH_SECRET = process.env.JWT_ADMIN_REFRESH_SECRET || "test-admin-refresh";

let failures = 0, passes = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passes++; else failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`}`);
};

// ---------------------------------------------------------------------------
// 1) businessDate unit tests (6-month lapse boundary, TZ-safe parsing)
// ---------------------------------------------------------------------------
const bd = require(path.join(BACKEND, "src/utils/businessDate.js"));

const T = { year: 2026, month: 6, day: 12 }; // fixed "today" for boundary tests
check("lapse: exactly 6 months ago is NOT lapsed", bd.isLapsedDueDate("2025-12-12", 6, T), false);
check("lapse: 6 months + 1 day IS lapsed", bd.isLapsedDueDate("2025-12-11", 6, T), true);
check("lapse: 5 months ago is NOT lapsed", bd.isLapsedDueDate("2026-01-12", 6, T), false);
check("lapse: 1 year ago IS lapsed", bd.isLapsedDueDate("2025-06-12", 6, T), true);
const TAug = { year: 2026, month: 8, day: 31 };
check("lapse: month-end clamp (Aug 31 ⇒ threshold Feb 28)", bd.isLapsedDueDate("2026-02-28", 6, TAug), false);
check("lapse: month-end clamp, Feb 27 lapses", bd.isLapsedDueDate("2026-02-27", 6, TAug), true);
check("parseDateParts rejects Feb 30", bd.parseDateParts("2026-02-30"), null);
check("parseDateParts accepts leap day", bd.parseDateParts("2024-02-29"), { year: 2024, month: 2, day: 29 });
check("monthsOverdue exact-month", bd.monthsOverdue("2025-12-12", T), 6);
check("monthsOverdue day-aware", bd.monthsOverdue("2025-12-13", T), 5);

// ---------------------------------------------------------------------------
// In-memory "prisma" supporting the operators used by the routes under test
// ---------------------------------------------------------------------------
const store = {};
const coll = (n) => (store[n] = store[n] || []);
const matchCond = (val, cond) => {
  if (cond === null) return val === null || val === undefined;
  if (cond instanceof Date) return val instanceof Date ? val.getTime() === cond.getTime() : String(val) === String(cond);
  if (typeof cond === "object" && !Array.isArray(cond)) {
    if (cond.OR) return cond.OR.some((c) => matchWhere(val, c));
    for (const [op, cv] of Object.entries(cond)) {
      const t = (x) => (x instanceof Date ? x.getTime() : x);
      if (op === "gte" && !(t(val) >= t(cv))) return false;
      else if (op === "lte" && !(t(val) <= t(cv))) return false;
      else if (op === "lt" && !(t(val) < t(cv))) return false;
      else if (op === "gt" && !(t(val) > t(cv))) return false;
      else if (op === "in" && !cv.includes(val)) return false;
      else if (op === "not" && matchCond(val, cv)) return false;
      else if (op === "contains" && !String(val ?? "").toLowerCase().includes(String(cv).toLowerCase())) return false;
      else if (op === "equals" && t(val) !== t(cv)) return false;
    }
    return true;
  }
  return val === cond;
};
const matchWhere = (row, where = {}) => {
  for (const [k, cond] of Object.entries(where)) {
    if (k === "OR") { if (!cond.some((c) => matchWhere(row, c))) return false; continue; }
    if (k === "AND") { if (!cond.every((c) => matchWhere(row, c))) return false; continue; }
    if (k === "client") { // nested relation filter used by /policy/search
      const client = coll("client").find((c) => c.id === row.client_id);
      if (!client || !matchWhere(client, cond)) return false;
      continue;
    }
    if (!matchCond(row[k], cond)) return false;
  }
  return true;
};
let idSeq = 1;
const makeDelegate = (name) => ({
  findMany: async ({ where, include, orderBy, take } = {}) => {
    let rows = coll(name).filter((r) => matchWhere(r, where || {}));
    if (take) rows = rows.slice(0, take);
    rows = rows.map((r) => ({ ...r }));
    if (include?.client) rows.forEach((r) => { r.client = { ...(coll("client").find((c) => c.id === r.client_id) || null) }; });
    return rows;
  },
  findFirst: async ({ where } = {}) => { const r = coll(name).find((x) => matchWhere(x, where || {})); return r ? { ...r } : null; },
  findUnique: async ({ where } = {}) => { const r = coll(name).find((x) => matchWhere(x, where || {})); return r ? { ...r } : null; },
  count: async ({ where } = {}) => coll(name).filter((r) => matchWhere(r, where || {})).length,
  create: async ({ data }) => { const row = { id: data.id || `${name}_${idSeq++}`, ...data }; coll(name).push(row); return { ...row }; },
  update: async ({ where, data }) => { const r = coll(name).find((x) => matchWhere(x, where)); if (!r) { const e = new Error("not found"); e.code = "P2025"; throw e; } Object.assign(r, data); return { ...r }; },
  updateMany: async ({ where, data }) => { coll(name).filter((x) => matchWhere(x, where)).forEach((r) => Object.assign(r, data)); return { count: 1 }; },
  delete: async ({ where }) => { const i = coll(name).findIndex((x) => matchWhere(x, where)); if (i >= 0) coll(name).splice(i, 1); return {}; },
  deleteMany: async ({ where }) => { store[name] = coll(name).filter((x) => !matchWhere(x, where)); return { count: 1 }; },
  groupBy: async ({ by, where }) => {
    const rows = coll(name).filter((r) => matchWhere(r, where || {}));
    const groups = new Map();
    rows.forEach((r) => { const k = by.map((f) => r[f]).join("|"); if (!groups.has(k)) groups.set(k, { ...Object.fromEntries(by.map((f) => [f, r[f]])), _count: { id: 0 } }); groups.get(k)._count.id++; });
    return [...groups.values()].map((g) => ({ ...g, _count: g._count }));
  },
  aggregate: async ({ where, _sum }) => {
    const rows = coll(name).filter((r) => matchWhere(r, where || {}));
    const out = { _sum: {} };
    if (_sum) for (const f of Object.keys(_sum)) out._sum[f] = rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
    return out;
  },
});
const delegates = new Map();
const fakePrisma = new Proxy({}, { get: (_t, prop) => {
  if (typeof prop !== "string") return undefined;
  if (prop === "$disconnect" || prop === "$connect") return async () => {};
  if (!delegates.has(prop)) delegates.set(prop, makeDelegate(prop));
  return delegates.get(prop);
}});

// ---------------------------------------------------------------------------
// stub modules in require cache
// ---------------------------------------------------------------------------
function stub(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub(path.join(BACKEND, "src/config/db.js"), { prisma: fakePrisma, MongoConnectionManager: { getInstance: () => ({}) } });
const authStub = (req, _res, next) => { req.user = { id: "agent1", type: "AGENT", role: "AGENT" }; next(); };
authStub.authenticate = authStub;
authStub.authenticateAdmin = (req, _res, next) => { req.user = { id: "admin1", type: "ADMIN", role: "ADMIN" }; next(); };
stub(path.join(BACKEND, "src/middlewares/auth.middleware.js"), authStub);

// ---------------------------------------------------------------------------
// Seed data — today comes from the real clock (Asia/Kathmandu)
// ---------------------------------------------------------------------------
const today = bd.getTodayParts();
const pad = (n) => String(n).padStart(2, "0");
const ymShift = (delta) => { const d = new Date(Date.UTC(today.year, today.month - 1 + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; };
const back7 = ymShift(-7), back4 = ymShift(-4), exact6 = ymShift(-6);

store.client = [
  { id: "c1", first_name: "Ram", last_name: "K", phone: "9811111111", gender: "MALE", member_group: "ADULT", dob: `1990-${pad(today.month)}-15`, created_at: new Date(), profile_picture: null, agent_id: "agent1", deleted_at: null },
  { id: "c2", first_name: "Sita", last_name: "S", phone: "9822222222", gender: "female", member_group: "ADULT", dob: "1985-01-20", created_at: new Date("2025-03-10"), profile_picture: "p.jpg", agent_id: "agent1", deleted_at: null },
  { id: "c3", first_name: "Babu", last_name: "T", phone: "9833333333", gender: "MALE", member_group: "CHILD", dob: `2018-${pad(today.month)}-02`, created_at: new Date(), profile_picture: null, agent_id: "agent1", deleted_at: null },
  { id: "cX", first_name: "Other", last_name: "Agent", phone: "9844444444", gender: "FEMALE", member_group: "ADULT", dob: `1992-${pad(today.month)}-09`, created_at: new Date(), profile_picture: null, agent_id: "agent2", deleted_at: null },
];
store.policy = [
  // current-month due, unpaid
  { id: "p1", policy_number: "PN1", status: "ACTIVE", doc: `${today.year}-02-10`, premium_amount: 5000, premium_due_date: `${today.year}-${pad(today.month)}-20`, premium_status: "DUE", client_id: "c1", agent_id: "agent1", deleted_at: null, created_at: new Date() },
  // 7 months unpaid -> LAPSED by rule
  { id: "p2", policy_number: "PN2", status: "ACTIVE", doc: "2019-07-01", premium_amount: 2000, premium_due_date: `${back7.y}-${pad(back7.m)}-15`, premium_status: "DUE", client_id: "c2", agent_id: "agent1", deleted_at: null, created_at: new Date() },
  // paid -> never in dues
  { id: "p3", policy_number: "PN3", status: "LAPSED", doc: `${today.year}-${pad(today.month)}-05`, premium_amount: 1500, premium_due_date: `${today.year}-${pad(today.month)}-05`, premium_status: "PAID", client_id: "c3", agent_id: "agent1", deleted_at: null, created_at: new Date() },
  // 4 months unpaid -> overdue warning zone, NOT lapsed
  { id: "p5", policy_number: "PN5", status: "ACTIVE", doc: `${today.year}-01-01`, premium_amount: 3000, premium_due_date: `${back4.y}-${pad(back4.m)}-10`, premium_status: "DUE", client_id: "c1", agent_id: "agent1", deleted_at: null, created_at: new Date() },
  // EXACTLY 6 months unpaid (same day) -> boundary: NOT lapsed
  { id: "p6", policy_number: "PN6", status: "ACTIVE", doc: `${today.year}-03-01`, premium_amount: 1000, premium_due_date: `${exact6.y}-${pad(exact6.m)}-${pad(Math.min(today.day, 28))}`, premium_status: "DUE", client_id: "c2", agent_id: "agent1", deleted_at: null, created_at: new Date() },
  // other agent's policy — must never leak
  { id: "pX", policy_number: "PNX", status: "ACTIVE", doc: `${today.year}-04-01`, premium_amount: 9000, premium_due_date: `${today.year}-${pad(today.month)}-25`, premium_status: "DUE", client_id: "cX", agent_id: "agent2", deleted_at: null, created_at: new Date() },
];
// boundary policy p6: only "not lapsed" when today.day <= 28; otherwise clamping shifts — tolerate
const p6Boundary = today.day <= 28;

const express = require(path.join(BACKEND, "node_modules/express"));
const dashRouter = require(path.join(BACKEND, "src/routes/dashboard.consolidated.routes.js"));
const policyRouter = require(path.join(BACKEND, "src/routes/policy.routes.js"));
const app = express();
app.use(express.json());
app.use("/api", dashRouter);
app.use("/api", policyRouter);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const get = async (p) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
  const put = async (p, data) => { const r = await fetch(base + p, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); return { status: r.status, body: await r.json() }; };

  // ---- 2) consolidated dashboard ----
  const d = (await get("/dashboard")).body.data;
  check("dash: totalClients (agent-scoped)", d.portfolioStats.totalClients, 3);
  check("dash: birthdaysThisMonth", d.portfolioStats.birthdaysThisMonth, 2);
  check("dash: lapsedList = only p2 (7mo) " + (p6Boundary ? "(p6 exact-6 excluded)" : ""), d.lapsedList.map(x => x.policyNo).sort(), p6Boundary ? ["PN2"] : ["PN2", "PN6"]);
  check("dash: premiumDues excludes lapsed + other agents", d.premiumDues.map(x => x.policyNo), ["PN1"]);
  check("dash: overduePremiums = warning zone (3-6mo)", d.overduePremiums.map(x => x.policyNo).sort(), p6Boundary ? ["PN5", "PN6"] : ["PN5"]);
  check("dash: notifications unique ids", new Set(d.notifications.items.map(n => n.id)).size, d.notifications.items.length);
  check("dash: clientBreakdown", [d.clientBreakdown.male, d.clientBreakdown.female, d.clientBreakdown.child, d.clientBreakdown.adultPercent, d.clientBreakdown.childPercent], [1, 1, 1, 67, 33]);
  check("dash: calendarEvents present", d.calendarEvents.length > 0, true);
  check("dash: cross-agent 403", (await get("/dashboard/agent2")).status, 403);

  // ---- 3) empty agent: no NaN / no crash ----
  store.client = store.client.filter(c => c.agent_id !== "agent1");
  store.policy = store.policy.filter(p => p.agent_id !== "agent1");
  const e = (await get("/dashboard")).body.data;
  check("empty agent: zeros not NaN", [e.portfolioStats.totalClients, e.clientBreakdown.adultPercent, e.clientBreakdown.childPercent, e.premiumDues.length, e.lapsedList.length], [0, 0, 0, 0, 0]);
  check("empty agent: graph all zeros", e.commencementGraph.monthlyCounts.every(n => n === 0), true);
  // restore seed
  delete store.__x;
  store.client.push(
    { id: "c1", first_name: "Ram", last_name: "K", phone: "9811111111", gender: "MALE", member_group: "ADULT", dob: `1990-${pad(today.month)}-15`, created_at: new Date(), profile_picture: null, agent_id: "agent1", deleted_at: null },
    { id: "c2", first_name: "Sita", last_name: "S", phone: "9822222222", gender: "female", member_group: "ADULT", dob: "1985-01-20", created_at: new Date("2025-03-10"), profile_picture: "p.jpg", agent_id: "agent1", deleted_at: null },
  );
  store.policy.push(
    { id: "p1", policy_number: "PN1", status: "ACTIVE", doc: `${today.year}-02-10`, premium_amount: 5000, premium_due_date: `${today.year}-${pad(today.month)}-20`, premium_status: "DUE", client_id: "c1", agent_id: "agent1", deleted_at: null, created_at: new Date() },
    { id: "p2", policy_number: "PN2", status: "ACTIVE", doc: "2019-07-01", premium_amount: 2000, premium_due_date: `${back7.y}-${pad(back7.m)}-15`, premium_status: "DUE", client_id: "c2", agent_id: "agent1", deleted_at: null, created_at: new Date() },
  );

  // ---- 4) /policy/search enrichment + filters ----
  const all = (await get("/policy/search?query=*")).body.data;
  check("search: agent scoping (no pX)", all.every(r => r.agent_id === "agent1"), true);
  const p1row = all.find(r => r.id === "p1");
  check("search: enriched fields", [p1row.client_name, typeof p1row.premium_due_date_ad, typeof p1row.months_overdue, p1row.policy_status], ["Ram K", "string", "number", "ACTIVE"]);
  const unpaid = (await get("/policy/search?query=*&status=UNPAID")).body.data;
  check("search: UNPAID excludes lapsed", unpaid.map(r => r.id), ["p1"]);
  const lapsed = (await get("/policy/search?query=*&status=LAPSED")).body.data;
  check("search: LAPSED filter (rule-based)", lapsed.map(r => r.id), ["p2"]);
  const byClient = (await get("/policy/search?query=*&client_id=c2")).body.data;
  check("search: client_id filter", byClient.map(r => r.id), ["p2"]);

  // ---- 5) GET /policy/:id (was always-500) ----
  const one = await get("/policy/p1");
  check("GET /policy/:id returns 200 with data", [one.status, one.body.data.policy_number], [200, "PN1"]);

  // ---- 6) mark premium paid persists + leaves dues ----
  const upd = await put("/policy/p1", { premium_status: "PAID" });
  check("PUT premium_status=PAID accepted", upd.status, 200);
  const unpaidAfter = (await get("/policy/search?query=*&status=UNPAID")).body.data;
  check("after mark-paid: dues empty", unpaidAfter.map(r => r.id), []);
  const dashAfter = (await get("/dashboard")).body.data;
  check("after mark-paid: dashboard dues empty", dashAfter.premiumDues.length, 0);

  // ---- 7) /policy/outdated & lapsed boundary consistency ----
  const outdated = (await get("/policy/outdated")).body.data;
  check("outdated: only >6mo unpaid (p2)", outdated.map(r => r.id), ["p2"]);

  console.log(`\n${passes} passed, ${failures} failed`);
  server.close();
  process.exit(failures ? 1 : 0);
});
