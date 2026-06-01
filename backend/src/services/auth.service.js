const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const env = require("../config/env");
const adminRepository = require("../repositories/admin.repository");
const sessionRepository = require("../repositories/session.repository");
const auditLogRepository = require("../repositories/audit.repository");
const { prisma } = require("../config/db");

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

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) { const err = new Error("Invalid credentials"); err.statusCode = 401; throw err; }

    if (admin.status !== "ACTIVE") { const err = new Error("Your account has been deactivated"); err.statusCode = 403; throw err; }

    const payload = { id: admin.id, email: admin.email, role: admin.role, type: "ADMIN" };
    const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateTokenPair(payload, "ADMIN");

    await sessionRepository.create({
      user_id: admin.id, user_type: "ADMIN", token: accessToken,
      expires_at: new Date(Date.now() + parseDurationMs(accessExpiry)),
      ip_address: ipAddress || null, user_agent: userAgent || null,
    });

    prisma.refreshToken.create({ data: {
      id: uuidv4(), user_id: admin.id, user_type: "ADMIN",
      token_hash: hashToken(refreshToken), family_id: uuidv4(),
      expires_at: new Date(Date.now() + parseDurationMs(refreshExpiry)),
      revoked_at: null, ip_address: ipAddress || null, user_agent: userAgent || null, created_at: new Date(),
    }}).catch(() => {});

    auditLogRepository.create({ user_id: admin.id, user_type: "ADMIN", action: "ADMIN_LOGIN", details: { email: admin.email }, ip_address: ipAddress || null }).catch(() => {});

    return { accessToken, refreshToken, admin: { id: admin.id, email: admin.email, role: admin.role } };
  }

  async agentLogin(email, password, ipAddress, userAgent) {
    const agentRepository = require("../repositories/agent.repository");
    const agent = await agentRepository.findOne({ email });
    if (!agent) { const err = new Error("Invalid email or password"); err.statusCode = 401; throw err; }

    if (agent.status !== "ACTIVE") { const err = new Error("Account is inactive. Please contact your admin."); err.statusCode = 403; throw err; }

    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) { const err = new Error("Invalid email or password"); err.statusCode = 401; throw err; }

    const payload = { id: agent.id, email: agent.email, role: "AGENT", type: "AGENT", company_id: agent.company_id };
    const { accessToken, refreshToken, accessExpiry, refreshExpiry } = generateTokenPair(payload, "AGENT");

    await sessionRepository.create({
      user_id: agent.id, user_type: "AGENT", token: accessToken,
      expires_at: new Date(Date.now() + parseDurationMs(accessExpiry)),
      ip_address: ipAddress || null, user_agent: userAgent || null,
    });

    prisma.refreshToken.create({ data: {
      id: uuidv4(), user_id: agent.id, user_type: "AGENT",
      token_hash: hashToken(refreshToken), family_id: uuidv4(),
      expires_at: new Date(Date.now() + parseDurationMs(refreshExpiry)),
      revoked_at: null, ip_address: ipAddress || null, user_agent: userAgent || null, created_at: new Date(),
    }}).catch(() => {});

    auditLogRepository.create({ user_id: agent.id, user_type: "AGENT", action: "AGENT_LOGIN", details: { email: agent.email }, ip_address: ipAddress || null }).catch(() => {});

    return { accessToken, refreshToken, agent: { id: agent.id, full_name: agent.full_name, email: agent.email, status: agent.status.toLowerCase(), company_id: agent.company_id, role: "agent" } };
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

    sessionRepository.create({ user_id: decoded.id, user_type: userType, token: accessToken, expires_at: new Date(Date.now() + parseDurationMs(accessExpiry)), ip_address: ipAddress || null, user_agent: userAgent || null }).catch(() => {});

    prisma.refreshToken.create({ data: { id: uuidv4(), user_id: decoded.id, user_type: userType, token_hash: hashToken(newRefreshToken), family_id: stored.family_id, expires_at: new Date(Date.now() + parseDurationMs(refreshExpiry)), revoked_at: null, ip_address: ipAddress || null, user_agent: userAgent || null, created_at: new Date() } }).catch(() => {});

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId, accessToken) {
    prisma.session.updateMany({ where: { user_id: userId, token: accessToken }, data: { is_active: false } }).catch(() => {});
    return { message: "Successfully logged out" };
  }
}

module.exports = new AuthService();
