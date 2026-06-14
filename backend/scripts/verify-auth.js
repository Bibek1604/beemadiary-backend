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

// minimal in-memory prisma
const store = {}; const coll = (n) => (store[n] = store[n] || []);
let seq = 1;
const match = (row, where = {}) => Object.entries(where).every(([k, v]) => (v && typeof v === "object" && !(v instanceof Date)) ? true : (v === null ? (row[k] === null || row[k] === undefined) : row[k] === v));
const delegate = (name) => ({
  findFirst: async ({ where } = {}) => coll(name).find(r => match(r, where)) || null,
  findUnique: async ({ where } = {}) => coll(name).find(r => match(r, where)) || null,
  findMany: async ({ where } = {}) => coll(name).filter(r => match(r, where)),
  create: async ({ data }) => { const row = { id: data.id || `${name}_${seq++}`, ...data }; coll(name).push(row); return { ...row }; },
  update: async ({ where, data }) => { const r = coll(name).find(x => match(x, where)); Object.assign(r, data); return { ...r }; },
  updateMany: async () => ({ count: 0 }),
  deleteMany: async ({ where }) => { store[name] = coll(name).filter(x => !match(x, where)); return { count: 1 }; },
  count: async () => coll(name).length,
});
const dmap = new Map();
const fakePrisma = new Proxy({}, { get: (_t, p) => { if (typeof p !== "string") return; if (p.startsWith("$")) return async () => {}; if (!dmap.has(p)) dmap.set(p, delegate(p)); return dmap.get(p); } });

function stub(modulePath, exports) {
  const filename = require.resolve(modulePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub(path.join(BACKEND, "src/config/db.js"), { prisma: fakePrisma, MongoConnectionManager: {} });

const express = require(path.join(BACKEND, "node_modules/express"));
const authRoutes = require(path.join(BACKEND, "src/routes/auth.routes.js"));
const app = express();
app.use(express.json());
app.use("/api", authRoutes);
app.use((err, _req, res, _next) => { console.error('ERR:', err && err.stack ? err.stack.split('\n').slice(0,4).join('\n') : err); res.status(err.statusCode || 500).json({ status:false, message: err.message }); });

const server = app.listen(0, async () => {
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = async (p, data) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }); const txt = await r.text(); let body; try { body = JSON.parse(txt); } catch { console.error('NON-JSON:', txt.slice(0,300)); body = {}; } return { status: r.status, body }; };

  // Agent self-registration is disabled by policy (accounts created by admin)
  const reg = await post("/agent/register", { email: "new@agent.com", password: "secret123" });
  check("self-register disabled -> 403", reg.status, 403);
  check("self-register: clear message", String(reg.body?.message || "").toLowerCase().includes("disabled"), true);

  // Seed an admin-created agent directly (as the admin panel would)
  const bcrypt = require(path.join(BACKEND, "node_modules/bcryptjs"));
  coll("agent").push({
    id: "agent_seeded", agent_code: "AG-1", full_name: "New Agent",
    email: "new@agent.com", password_hash: bcrypt.hashSync("secret123", 10),
    status: "ACTIVE", company_id: "comp1", created_at: new Date(), deleted_at: null,
  });

  const login = await post("/agent/login", { email: "new@agent.com", password: "secret123" });
  check("admin-created agent login: 200 + token", [login.status, !!login.body.accessToken], [200, true]);

  const wrongPw = await post("/agent/login", { email: "new@agent.com", password: "wrong" });
  check("login wrong password -> 401", wrongPw.status, 401);

  const noBody = await post("/agent/login", {});
  check("login missing fields -> 400", noBody.status, 400);

  // ---- change-password (shared by user + admin side) ----
  const postAuth = async (p, data, token) => { const r = await fetch(base + p, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(data) }); const txt = await r.text(); let body; try { body = JSON.parse(txt); } catch { body = {}; } return { status: r.status, body }; };
  const tok = login.body.accessToken;

  const wrongCur = await postAuth("/change-password", { old_password: "nope", new_password: "newpass1" }, tok);
  check("change-password: wrong current -> 400", wrongCur.status, 400);

  const mismatch = await postAuth("/change-password", { old_password: "secret123", new_password: "newpass1", confirm_password: "different" }, tok);
  check("change-password: confirm mismatch -> 400", mismatch.status, 400);

  const ok = await postAuth("/change-password", { old_password: "secret123", new_password: "newpass1", confirm_password: "newpass1" }, tok);
  check("change-password: 200", ok.status, 200);

  const oldLogin = await post("/agent/login", { email: "new@agent.com", password: "secret123" });
  check("old password rejected after change", oldLogin.status, 401);
  const newLogin = await post("/agent/login", { email: "new@agent.com", password: "newpass1" });
  check("new password accepted", newLogin.status, 200);

  // ---- logout-all kills sessions ----
  const tok2 = newLogin.body.accessToken;
  const la = await postAuth("/auth/logout-all", {}, tok2);
  check("logout-all: 200", la.status, 200);
  const afterLogoutAll = await postAuth("/change-password", { old_password: "newpass1", new_password: "x12345" }, tok2);
  check("token dead after logout-all -> 401", afterLogoutAll.status, 401);

  // ---- admin bootstrap register ----
  const boot = await post("/register", { email: "root@admin.com", password: "rootpass1", full_name: "Root" });
  check("admin bootstrap register: 201 + token", [boot.status, !!boot.body.accessToken], [201, true]);
  const boot2 = await post("/register", { email: "second@admin.com", password: "rootpass1" });
  check("admin register disabled once admin exists -> 403", boot2.status, 403);

  // ---- forgot-password gives a clear 501 ----
  const fp = await post("/forgot-password", { email: "a@b.com" });
  check("forgot-password -> 501 with message", [fp.status, typeof fp.body.message], [501, "string"]);

  console.log(`\n${passes} passed, ${failures} failed`);
  server.close();
  process.exit(failures ? 1 : 0);
});
