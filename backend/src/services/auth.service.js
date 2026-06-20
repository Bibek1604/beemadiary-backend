const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const env = require("../config/env");
const adminRepository = require("../repositories/admin.repository");
const sessionRepository = require("../repositories/session.repository");
const auditLogRepository = require("../repositories/audit.repository");
const { prisma } = require("../config/db");
const logger = require("../utils/logger");
const { AccountLockoutManager } = require("../utils/accountLockout");

function parseDurationMs(str, fallbackMs = 15 * 60 * 1000) {
  if (!str) return fallbackMs;
  const n = parseInt(str, 10);
  if (isNaN(n)) return fallbackMs;
  if (str.endsWith("d")) return n * 24 * 60 * 60 * 1000;
  if (str.endsWith("h")) return n * 60 * 60 * 1000;
  if (str.endsWith("m")) return n * 60 * 1000;
  if (str.endsWith("s")) return n * 1000;
  return fallbackMs;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateTokenPair(payload, userType) {
  const isAdmin = userType === "ADMIN";
  const accessSecret  = isAdmin ? env.JWT_ADMIN_SECRET        : env.JWT_SECRET;
  const refreshSecret = isAdmin ? env.JWT_ADMIN_REFRESH_SECRET : env.JWT_REFRESH_SECRET;
  const accessExpiry  = isAdmin ? env.JWT_ADMIN_EXPIRES_IN     : env.JWT_EXPIRES_IN;
  const refreshExpiry = isAdmin ? env.JWT_ADMIN_REFRESH_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;
  const accessToken  = jwt.sign(payload, accessSecret,  { expiresIn: accessExpiry });
  const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiry });
  return { accessToken, refreshToken, accessExpiry, refreshExpiry };
}

class AuthService {
  async adminLogin(email, password, ipAddress, userAgent) {
    const admin = await adminRepository.findOne({ email });
    if (!admin) { const err = new Error("Invalid credentials"); err.statusCode = 401; throw err; }

    if (await AccountLockoutManager.isLocked(admin.id)) {
      const err = new Error("Too many failed login attempts. Please try again later."); err.statusCode = 429; throw err;
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) { await AccountLockoutManager.recordFailedAttempt(admin.id); const err = new Error("Invalid credentials"); err.statusCode = 401; throw err; }
    await AccountLockoutManager.resetAttempts(admin.id);

    if (admin.status !== "ACTIVE") { const err = new Error("Your account has been deactivated"); err.statusCode = 403; throw err; }

    const payload = { id: admin.id, email: admin.email, role: admin.role, type: "ADMIN" };
    const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateTokenPair(payload, "ADMIN");

    await sessionRepository.create({
      user_id: admin.id, user_type: "ADMIN", token: accessToken,
      expires_at: new Date(Date.now() + parseDurationMs(accessExpiry)),
      ip_address: ipAddress || null, user_agent: userAgent || null,
    });

    await prisma.refreshToken.create({ data: {
      id: uuidv4(), user_id: admin.id, user_type: "ADMIN",
      token_hash: hashToken(refreshToken), family_id: uuidv4(),
      expires_at: new Date(Date.now() + parseDurationMs(refreshExpiry)),
      revoked_at: null, ip_address: ipAddress || null, user_agent: userAgent || null, created_at: new Date(),
    }}).catch((e) => logger.error("[auth] admin refresh-token persist failed", e));

    auditLogRepository.create({ user_id: admin.id, user_type: "ADMIN", action: "ADMIN_LOGIN", details: { email: admin.email }, ip_address: ipAddress || null }).catch(() => {});

    return { accessToken, refreshToken, admin: { id: admin.id, email: admin.email, role: admin.role } };
  }

  async agentLogin(email, password, ipAddress, userAgent) {
    const agentRepository = require("../repositories/agent.repository");
    const agent = await agentRepository.findOne({ email });
    if (!agent) { const err = new Error("Invalid email or password"); err.statusCode = 401; throw err; }

    if (await AccountLockoutManager.isLocked(agent.id)) {
      const err = new Error("Too many failed login attempts. Please try again later."); err.statusCode = 429; throw err;
    }

    // Password check BEFORE status check — prevents user enumeration via inactive account detection
    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) { await AccountLockoutManager.recordFailedAttempt(agent.id); const err = new Error("Invalid email or password"); err.statusCode = 401; throw err; }
    await AccountLockoutManager.resetAttempts(agent.id);

    if (agent.status !== "ACTIVE") { const err = new Error("Account is inactive. Please contact your admin."); err.statusCode = 403; throw err; }

    const payload = { id: agent.id, email: agent.email, role: "AGENT", type: "AGENT", company_id: agent.company_id };
    const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateTokenPair(payload, "AGENT");

    await sessionRepository.create({
      user_id: agent.id, user_type: "AGENT", token: accessToken,
      expires_at: new Date(Date.now() + parseDurationMs(accessExpiry)),
      ip_address: ipAddress || null, user_agent: userAgent || null,
    });

    await prisma.refreshToken.create({ data: {
      id: uuidv4(), user_id: agent.id, user_type: "AGENT",
      token_hash: hashToken(refreshToken), family_id: uuidv4(),
      expires_at: new Date(Date.now() + parseDurationMs(refreshExpiry)),
      revoked_at: null, ip_address: ipAddress || null, user_agent: userAgent || null, created_at: new Date(),
    }}).catch((e) => logger.error("[auth] agent refresh-token persist failed", e));

    auditLogRepository.create({ user_id: agent.id, user_type: "AGENT", action: "AGENT_LOGIN", details: { email: agent.email }, ip_address: ipAddress || null }).catch(() => {});

    return { accessToken, refreshToken, agent: { id: agent.id, full_name: agent.full_name, email: agent.email, status: agent.status.toLowerCase(), company_id: agent.company_id, role: "agent" } };
  }

  async agentRegister({ email, password, full_name, phone_number }, ipAddress, userAgent) {
    const agentRepository = require("../repositories/agent.repository");

    const existing = await agentRepository.findOne({ email });
    if (existing) { const err = new Error("An account with this email already exists"); err.statusCode = 409; throw err; }

    const password_hash = await bcrypt.hash(password, 10);
    const agentCode = `AG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    await prisma.agent.create({
      data: {
        agent_code: agentCode,
        full_name: (full_name || email.split("@")[0] || "Agent").trim(),
        email,
        phone_number: phone_number || null,
        password_hash,
        status: "ACTIVE",
        created_at: new Date(),
        deleted_at: null,
      },
    });

    auditLogRepository.create({ user_id: null, user_type: "AGENT", action: "AGENT_REGISTER", details: { email }, ip_address: ipAddress || null }).catch(() => {});

    // Auto-login the freshly registered agent (creates session + tokens)
    return this.agentLogin(email, password, ipAddress, userAgent);
  }

  async refreshTokens(rawRefreshToken, ipAddress, userAgent) {
    if (!rawRefreshToken) { const err = new Error("Refresh token required"); err.statusCode = 401; throw err; }

    const tokenHash = hashToken(rawRefreshToken);
    const stored = await prisma.refreshToken.findFirst({ where: { token_hash: tokenHash } }).catch(() => null);
    if (!stored) { const err = new Error("Invalid refresh token"); err.statusCode = 401; throw err; }

    if (stored.revoked_at) {
      prisma.refreshToken.updateMany({ where: { family_id: stored.family_id }, data: { revoked_at: new Date() } }).catch(() => {});
      const err = new Error("Refresh token reuse detected — please log in again"); err.statusCode = 401; throw err;
    }

    if (new Date() > new Date(stored.expires_at)) {
      prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked_at: new Date() } }).catch(() => {});
      const err = new Error("Refresh token expired"); err.statusCode = 401; throw err;
    }

    const userType = stored.user_type || "AGENT";
    const isAdmin = userType === "ADMIN";
    const refreshSec = isAdmin ? env.JWT_ADMIN_REFRESH_SECRET : env.JWT_REFRESH_SECRET;

    let decoded;
    try { decoded = jwt.verify(rawRefreshToken, refreshSec); }
    catch { const err = new Error("Invalid refresh token signature"); err.statusCode = 401; throw err; }

    prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked_at: new Date() } }).catch(() => {});

    const payload = { id: decoded.id, email: decoded.email || "", role: decoded.role, type: decoded.type || userType, company_id: decoded.company_id };
    const { accessToken, refreshToken: newRefreshToken, accessExpiry, refreshExpiry } = generateTokenPair(payload, userType);

    await sessionRepository.create({ user_id: decoded.id, user_type: userType, token: accessToken, expires_at: new Date(Date.now() + parseDurationMs(accessExpiry)), ip_address: ipAddress || null, user_agent: userAgent || null }).catch((e) => logger.error("[auth] refresh session persist failed", e));

    await prisma.refreshToken.create({ data: { id: uuidv4(), user_id: decoded.id, user_type: userType, token_hash: hashToken(newRefreshToken), family_id: stored.family_id, expires_at: new Date(Date.now() + parseDurationMs(refreshExpiry)), revoked_at: null, ip_address: ipAddress || null, user_agent: userAgent || null, created_at: new Date() } }).catch((e) => logger.error("[auth] refresh-token rotate persist failed", e));

    return { accessToken, refreshToken: newRefreshToken };
  }

  async changePassword(user, currentPassword, newPassword, currentToken) {
    const isAdmin = ["ADMIN", "SUPER_ADMIN"].includes(String(user.type || user.role || "").toUpperCase());
    const repo = isAdmin
      ? require("../repositories/admin.repository")
      : require("../repositories/agent.repository");

    const account = await repo.findOne({ id: user.id });
    if (!account) { const err = new Error("Account not found"); err.statusCode = 404; throw err; }

    const valid = await bcrypt.compare(currentPassword, account.password_hash);
    if (!valid) { const err = new Error("Current password is incorrect"); err.statusCode = 400; throw err; }

    const password_hash = await bcrypt.hash(newPassword, 10);
    const model = isAdmin ? prisma.admin : prisma.agent;
    await model.update({ where: { id: user.id }, data: { password_hash, updated_at: new Date() } });

    // Invalidate every other session for this account (keep the current one)
    await prisma.session.deleteMany({
      where: { user_id: user.id, token: { not: currentToken } },
    }).catch(() => {});

    auditLogRepository.create({ user_id: user.id, user_type: isAdmin ? "ADMIN" : "AGENT", action: "CHANGE_PASSWORD", details: {}, ip_address: null }).catch(() => {});

    return { message: "Password changed successfully" };
  }

  async logoutAll(userId) {
    await prisma.session.deleteMany({ where: { user_id: userId } }).catch(() => {});
    await prisma.refreshToken.updateMany({ where: { user_id: userId }, data: { revoked_at: new Date() } }).catch(() => {});
    return { message: "Logged out from all devices" };
  }

  /**
   * Admin self-registration is only allowed as a one-time bootstrap when no
   * admin account exists yet. Afterwards admins are created via /api/admin/users.
   */
  async adminBootstrapRegister({ email, password, first_name, last_name }, ipAddress, userAgent) {
    const existingAdmin = await prisma.admin.findFirst({ where: { deleted_at: null } });
    if (existingAdmin) {
      const err = new Error("Admin registration is disabled. Ask a super admin to create your account.");
      err.statusCode = 403; throw err;
    }

    const password_hash = await bcrypt.hash(password, 10);
    await prisma.admin.create({
      data: {
        email,
        full_name: `${first_name || ""} ${last_name || ""}`.trim() || email.split("@")[0],
        password_hash,
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        created_at: new Date(),
        deleted_at: null,
      },
    });

    return this.adminLogin(email, password, ipAddress, userAgent);
  }

  async logout(accessToken, rawRefreshToken) {
    // Delete the session so the access token is rejected immediately
    // (the auth middleware validates tokens by looking up the session row).
    if (accessToken) {
      await prisma.session.deleteMany({ where: { token: accessToken } }).catch(() => {});
    }
    // Revoke the device's refresh token (and its rotation family) so it cannot
    // be used to mint new access tokens after logout.
    if (rawRefreshToken) {
      const stored = await prisma.refreshToken.findFirst({ where: { token_hash: hashToken(rawRefreshToken) } }).catch(() => null);
      if (stored) {
        await prisma.refreshToken.updateMany({ where: { family_id: stored.family_id }, data: { revoked_at: new Date() } }).catch(() => {});
      }
    }
    return { message: "Successfully logged out" };
  }
}

module.exports = new AuthService();
