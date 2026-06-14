/** Verifies: admin-created agent (name + company required) -> agent login; self-register disabled. */
const path = require("path");
const BACKEND = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(BACKEND, ".env") });
process.env.JWT_SECRET = process.env.JWT_SECRET || "s1";
process.env.JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || "s2";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "s3";
process.env.JWT_ADMIN_REFRESH_SECRET = process.env.JWT_ADMIN_REFRESH_SECRET || "s4";

let failures = 0, passes = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passes++ : failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`}`);
};

// ---- shared in-memory prisma ----
const store = {}; const coll = (n) => (store[n] = store[n] || []);
let seq = 1;
const matchCond = (val, cond) => {
  if (cond === null) return val === null || val === undefined;
  if (cond && typeof cond === "object" && !(cond instanceof Date)) {
    if ("not" in cond) return !matchCond(val, cond.not);
    if ("contains" in cond) return String(val ?? "").toLowerCase().includes(String(cond.contains).toLowerCase());
    return true;
  }
  return val === cond;
};
const match = (row, where = {}) => Object.entries(where).every(([k, v]) => {
  if (k === "OR") return v.some((c) => match(row, c));
  return matchCond(row[k], v);
});
const delegate = (name) => ({
  findFirst: async ({ where } = {}) => coll(name).find(r => match(r, where || {})) || null,
  findUnique: async ({ where } = {}) => coll(name).find(r => match(r, where || {})) || null,
  findMany: async ({ where } = {}) => coll(name).filter(r => match(r, where || {})),
  count: async ({ where } = {}) => coll(name).filter(r => match(r, where || {})).length,
  create: async ({ data }) => { const row = { id: data.id || `${name}_${seq++}`, ...data }; coll(name).push(row); return { ...row }; },
  update: async ({ where, data }) => { const r = coll(name).find(x => match(x, where)); Object.assign(r, data); return { ...r }; },
  updateMany: async () => ({ count: 0 }),
  deleteMany: async ({ where }) => { store[name] = coll(name).filter(x => !match(x, where)); return { count: 1 }; },
});
const dmap = new Map();
const fakePrisma = new Proxy({}, { get: (_t, p) => { if (typeof p !== "string") return; if (p.startsWith("$")) return async () => {}; if (!dmap.has(p)) dmap.set(p, delegate(p)); return dmap.get(p); } });

function stub(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
// src-side stubs (auth routes)
stub(path.join(BACKEND, "src/config/db.js"), { prisma: fakePrisma, MongoConnectionManager: {} });
// dist-side stubs (admin routes are TypeScript -> test compiled output)
stub(path.join(BACKEND, "dist/config/database.js"), { __esModule: true, default: fakePrisma, MongoConnectionManager: {} });
const adminPass = (req, _res, next) => { req.user = { id: "admin1", type: "ADMIN", role: "ADMIN" }; next(); };
stub(path.join(BACKEND, "dist/middleware/auth.js"), { __esModule: true, verifyAdminToken: adminPass, verifyToken: adminPass, verifyAnyToken: adminPass });
stub(path.join(BACKEND, "dist/middleware/rbac.js"), { __esModule: true, requireAdmin: (_q, _s, n) => n(), requireRole: () => (_q, _s, n) => n() });
stub(path.join(BACKEND, "dist/utils/imageHandler.js"), { __esModule: true, default: {
  createUploadMiddleware: () => ({ single: () => (_q, _s, n) => n() }),
  uploadImage: async () => ({ url: "" }),
  ensureUploadDirs: () => {},
}});

// seed one company
store.company = [{ id: "comp1", name: "LIC Nepal", status: "ACTIVE", deleted_at: null }];

const express = require(path.join(BACKEND, "node_modules/express"));
const adminRoutes = require(path.join(BACKEND, "dist/routes/admin.routes.js"));
const authRoutes = require(path.join(BACKEND, "src/routes/auth.routes.js"));
const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes.default || adminRoutes);
app.use("/api", authRoutes);

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async (p, data) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); const t = await r.text(); let body; try { body = JSON.parse(t); } catch { body = { raw: t.slice(0, 120) }; } return { status: r.status, body }; };

  // 1) missing company -> field-level 400
  const noCompany = await post("/admin/agents", { full_name: "Hari Agent", email: "hari@lic.com", password: "secret1" });
  check("create agent without company -> 400 field error", [noCompany.status, noCompany.body?.error?.details?.[0]?.field ?? noCompany.body?.errors?.[0]?.field ?? "company-mentioned:" + JSON.stringify(noCompany.body).includes("company")], [400, "company"]);

  // 2) missing name -> 400
  const noName = await post("/admin/agents", { email: "x@lic.com", password: "secret1", company: "comp1" });
  check("create agent without name -> 400", noName.status, 400);

  // 3) bad company -> 400
  const badCompany = await post("/admin/agents", { full_name: "Hari Agent", email: "hari@lic.com", password: "secret1", company: "nope" });
  check("create agent with unknown company -> 400", badCompany.status, 400);

  // 4) valid create -> 201 with company bound
  const created = await post("/admin/agents", { full_name: "Hari Agent", email: "Hari@lic.com", password: "secret1", company: "comp1", phone_number: "9800000000" });
  check("admin creates agent -> 201", created.status, 201);
  check("agent bound to company", coll("agent")[0]?.company_id, "comp1");
  check("agent stored ACTIVE with name", [coll("agent")[0]?.status, coll("agent")[0]?.full_name], ["ACTIVE", "Hari Agent"]);

  // 5) duplicate email -> 409
  const dup = await post("/admin/agents", { full_name: "Hari 2", email: "hari@lic.com", password: "secret1", company: "comp1" });
  check("duplicate agent email -> 409", dup.status, 409);

  // 6) the created agent can log in on the user side
  const login = await post("/agent/login", { email: "hari@lic.com", password: "secret1" });
  check("admin-created agent can log in", [login.status, !!login.body.accessToken, login.body.data?.company_id], [200, true, "comp1"]);

  // 7) self-registration is disabled
  const selfReg = await post("/agent/register", { email: "rogue@lic.com", password: "secret1" });
  check("agent self-register -> 403 disabled", selfReg.status, 403);

  console.log(`\n${passes} passed, ${failures} failed`);
  server.close();
  process.exit(failures ? 1 : 0);
});
