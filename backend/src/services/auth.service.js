const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const env = require("../config/env");
const adminRepository = require("../repositories/admin.repository");
const sessionRepository = require("../repositories/session.repository");
const auditLogRepository = require("../repositories/audit.repository");
const { prisma } = require("../config/db");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a JWT duration string (e.g. "15m", "2h", "7d") to milliseconds. */
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

/** SHA-256 hash a token string (for safe DB storage). */
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Issue an access + refresh JWT pair.
 * @param {object} payload   - Claims to embed (id, email, role, type)
 * @param {"ADMIN"|"AGENT"}  userType
 */
function generateTokenPair(payload, userType) {
  const isAdmin = userType === "ADMIN";

  const accessSecret  = isAdmin ? env.JWT_ADMIN_SECRET         : env.JWT_SECRET;
  const refreshSecret = isAdmin ? env.JWT_ADMIN_REFRESH_SECRET  : env.JWT_REFRESH_SECRET;
  const accessExpiry  = isAdmin ? env.JWT_ADMIN_EXPIRES_IN      : env.JWT_EXPIRES_IN;
  const refreshExpiry = isAdmin ? env.JWT_ADMIN_REFRESH_EXPIRES_IN : env.JWT_REFRESH_EXPIRES_IN;

  const accessToken  = jwt.sign(payload, accessSecret,  { expiresIn: accessExpiry });
  const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiry });

  return { accessToken, refreshToken, accessExpiry, refreshExpiry };
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

class AuthService {

  // -------------------------------------------------------------------------
  // Admin login
  // -------------------------------------------------------------------------
  async adminLogin(email, password, ipAddress, userAgent) {
    const admin = await adminRepository.findOne({ email });
    if (!admin) {
      const err = new Error("Invalid credentials"); err.statusCode = 401; throw err;
    }

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) {
      const err = new Error("Invalid credentials"); err.statusCode = 401; throw err;
    }

    if (admin.status !== "ACTIVE") {
      const err = new Error("Your account has been deactivated"); err.statusCode = 403; throw err;
    }

    const payload = {
      id:    admin.id,
      email: admin.email,
      role:  admin.role,   // e.g. "ADMIN" | "SUPER_ADMIN"
      type:  "ADMIN",
    };

    const { accessToken, refreshToken, accessExpiry, refreshExpiry } =
      generateTokenPair(payload, "ADMIN");

    const accessExpiresAt  = new Date(Date.now() + parseDurationMs(accessExpiry));
    const refreshExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiry));
    const familyId = uuidv4();

    // Persist access-token session
    await sessionRepository.create({
      user_id:    admin.id,
      user_type:  "ADMIN",
      token:      accessToken,
      expires_at: accessExpiresAt,
      ip_address: ipAddress  || null,
      user_agent: userAgent  || null,
    });

    // Persist refresh token (hashed)
    await prisma.refreshToken.create({
      data: {
        id:         uuidv4(),
        user_id:    admin.id,
        user_type:  "ADMIN",
        token_hash: hashToken(refreshToken),
        family_id:  familyId,
        expires_at: refreshExpiresAt,
        revoked_at: null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        created_at: new Date(),
      },
    }).catch(() => { /* non-critical — token still works without it */ });

    // Audit log (non-blocking)
    auditLogRepository.create({
      user_id:    admin.id,
      user_type:  "ADMIN",
      action:     "ADMIN_LOGIN",
      details:    { email: admin.email },
      ip_address: ipAddress || null,
    }).catch(err => console.error("Audit log failed:", err));

    return {
      accessToken,
      refreshToken,
      admin: {
        id:    admin.id,
        email: admin.email,
        role:  admin.role,
      },
    };
  }

  // -------------------------------------------------------------------------
  // Agent / user login
  // -------------------------------------------------------------------------
  async agentLogin(email, password, ipAddress, userAgent) {
    const agentRepository = require("../repositories/agent.repository");

    const agent = await agentRepository.findOne({ email });
    if (!agent) {
      const err = new Error("Invalid email or password"); err.statusCode = 401; throw err;
    }

    if (agent.status !== "ACTIVE") {
      const err = new Error("Account is inactive. Please contact your admin."); err.statusCode = 403; throw err;
    }

    const valid = await bcrypt.compare(password, agent.password_hash);
    if (!valid) {
      const err = new Error("Invalid email or password"); err.statusCode = 401; throw err;
    }

    const payload = {
      id:         agent.id,
      email:      agent.email,
      role:       "AGENT",
      type:       "AGENT",
      company_id: agent.company_id,
    };

    const { accessToken, refreshToken, accessExpiry, refreshExpiry } =
      generateTokenPair(payload, "AGENT");

    const accessExpiresAt  = new Date(Date.now() + parseDurationMs(accessExpiry));
    const refreshExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiry));
    const familyId = uuidv4();

    // Persist access-token session
    await sessionRepository.create({
      user_id:    agent.id,
      user_type:  "AGENT",
      token:      accessToken,
      expires_at: accessExpiresAt,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

    // Persist refresh token (hashed)
    await prisma.refreshToken.create({
      data: {
        id:         uuidv4(),
        user_id:    agent.id,
        user_type:  "AGENT",
        token_hash: hashToken(refreshToken),
        family_id:  familyId,
        expires_at: refreshExpiresAt,
        revoked_at: null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        created_at: new Date(),
      },
    }).catch(() => {});

    // Audit log (non-blocking)
    auditLogRepository.create({
      user_id:    agent.id,
      user_type:  "AGENT",
      action:     "AGENT_LOGIN",
      details:    { email: agent.email },
      ip_address: ipAddress || null,
    }).catch(err => console.error("Audit log failed:", err));

    return {
      accessToken,
      refreshToken,
      agent: {
        id:         agent.id,
        full_name:  agent.full_name,
        email:      agent.email,
        status:     agent.status.toLowerCase(),
        company_id: agent.company_id,
        role:       "agent",
      },
    };
  }

  // -------------------------------------------------------------------------
  // Refresh token rotation
  // Accepts a raw refresh token, validates it, revokes it, issues a new pair.
  // If a revoked token is replayed the whole family is revoked (reuse attack).
  // -------------------------------------------------------------------------
  async refreshTokens(rawRefreshToken, ipAddress, userAgent) {
    if (!rawRefreshToken) {
      const err = new Error("Refresh token required"); err.statusCode = 401; throw err;
    }

    const tokenHash = hashToken(rawRefreshToken);

    // Look up by hash
    const stored = await prisma.refreshToken.findFirst({
      where: { token_hash: tokenHash },
    }).catch(() => null);

    if (!stored) {
      const err = new Error("Invalid refresh token"); err.statusCode = 401; throw err;
    }

    // Detect reuse: if already revoked, kill the whole family
    if (stored.revoked_at) {
      await prisma.refreshToken.updateMany({
        where: { family_id: stored.family_id },
        data:  { revoked_at: new Date() },
      }).catch(() => {});
      const err = new Error("Refresh token reuse detected — please log in again");
      err.statusCode = 401;
      throw err;
    }

    // Check expiry
    if (new Date() > new Date(stored.expires_at)) {
      await prisma.refreshToken.update({
        where: { id: stored.id },
        data:  { revoked_at: new Date() },
      }).catch(() => {});
      const err = new Error("Refresh token expired"); err.statusCode = 401; throw err;
    }

    // Determine type and verify JWT signature with the correct secret
    const userType    = stored.user_type || "AGENT";
    const isAdmin     = userType === "ADMIN";
    const refreshSec  = isAdmin ? env.JWT_ADMIN_REFRESH_SECRET : env.JWT_REFRESH_SECRET;

    let decoded;
    try {
      decoded = jwt.verify(rawRefreshToken, refreshSec);
    } catch {
      const err = new Error("Invalid refresh token signature"); err.statusCode = 401; throw err;
    }

    // Revoke old refresh token
    await prisma.refreshToken.update({
      where: { id: stored.id },
      data:  { revoked_at: new Date() },
    }).catch(() => {});

    // Build new payload from decoded claims
    const payload = {
      id:         decoded.id,
      email:      decoded.email || "",
      role:       decoded.role,
      type:       decoded.type || userType,
      company_id: decoded.company_id,
    };

    const { accessToken, refreshToken: newRefreshToken, accessExpiry, refreshExpiry } =
      generateTokenPair(payload, userType);

    const accessExpiresAt  = new Date(Date.now() + parseDurationMs(accessExpiry));
    const refreshExpiresAt = new Date(Date.now() + parseDurationMs(refreshExpiry));

    // Persist new access session
    await sessionRepository.create({
      user_id:    decoded.id,
      user_type:  userType,
      token:      accessToken,
      expires_at: accessExpiresAt,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    }).catch(() => {});

    // Persist new refresh token (same family)
    await prisma.refreshToken.create({
      data: {
        id:         uuidv4(),
        user_id:    decoded.id,
        user_type:  userType,
        token_hash: hashToken(newRefreshToken),
        family_id:  stored.family_id,
        expires_at: refreshExpiresAt,
        revoked_at: null,
        ip_address: ipAddress || null,
        user_agent: userAgent || null,
        created_at: new Date(),
      },
    }).catch(() => {});

    return { accessToken, refreshToken: newRefreshToken };
  }

  // -------------------------------------------------------------------------
  // Logout — revoke the current session and refresh token family
  // -------------------------------------------------------------------------
  async logout(userId, accessToken) {
    // Invalidate session
    await prisma.session.updateMany({
      where:  { user_id: userId, token: accessToken },
      data:   { is_active: false },
    }).catch(() => {});

    return { message: "Successfully logged out" };
  }
}

module.exports = new AuthService();
