const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { prisma } = require("../config/db");
const ApiResponse = require("../utils/apiResponse");

async function verifyRequest(req, res, secret, allowedTypes) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json(ApiResponse.error("Unauthorized access", ["Access token is missing or malformed"], 401));
    return null;
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch {
    res.status(401).json(ApiResponse.error("Unauthorized access", ["The access token is invalid or has expired"], 401));
    return null;
  }

  const userType = decoded.type || decoded.role;
  if (allowedTypes && !allowedTypes.includes(userType)) {
    res.status(403).json(ApiResponse.error("Forbidden", ["This token is not authorised for this endpoint"], 403));
    return null;
  }

  const session = await prisma.session.findFirst({
    where: { token },
    select: { id: true, expires_at: true },
  });

  if (!session) {
    res.status(401).json(ApiResponse.error("Session terminated", ["Session is invalid or has been logged out"], 401));
    return null;
  }

  if (new Date() > new Date(session.expires_at)) {
    prisma.session.deleteMany({ where: { token } }).catch(() => {});
    res.status(401).json(ApiResponse.error("Session expired", ["Your session has expired. Please log in again"], 401));
    return null;
  }

  let accountActive = true;
  if (userType === "AGENT") {
    const agent = await prisma.agent.findFirst({ where: { id: decoded.id, deleted_at: null, status: "ACTIVE" }, select: { id: true } });
    accountActive = !!agent;
  } else if (userType === "ADMIN" || userType === "SUPER_ADMIN") {
    const admin = await prisma.admin.findFirst({ where: { id: decoded.id, deleted_at: null, status: "ACTIVE" }, select: { id: true } });
    accountActive = !!admin;
  }

  if (!accountActive) {
    prisma.session.deleteMany({ where: { token } }).catch(() => {});
    res.status(401).json(ApiResponse.error("Account deactivated", ["Your account has been deactivated or deleted. Please contact your administrator."], 401));
    return null;
  }

  return { decoded, token };
}

// ---------------------------------------------------------------------------
// authenticate — for AGENT / user routes
// Verifies with JWT_SECRET; only accepts tokens with type AGENT
// ---------------------------------------------------------------------------
const authenticate = async (req, res, next) => {
  try {
    const result = await verifyRequest(req, res, env.JWT_SECRET, ["AGENT"]);
    if (!result) return;
    req.user = { id: result.decoded.id, email: result.decoded.email, role: result.decoded.role, type: result.decoded.type, company_id: result.decoded.company_id };
    req.token = result.token;
    next();
  } catch {
    res.status(500).json(ApiResponse.error("Something went wrong. Please try again later."));
  }
};

// ---------------------------------------------------------------------------
// authenticateAdmin — for ADMIN routes
// Verifies with JWT_ADMIN_SECRET; only accepts tokens with type ADMIN / SUPER_ADMIN
// ---------------------------------------------------------------------------
const authenticateAdmin = async (req, res, next) => {
  try {
    const result = await verifyRequest(req, res, env.JWT_ADMIN_SECRET, ["ADMIN", "SUPER_ADMIN"]);
    if (!result) return;
    req.user = { id: result.decoded.id, email: result.decoded.email, role: result.decoded.role, type: result.decoded.type };
    req.token = result.token;
    next();
  } catch {
    res.status(500).json(ApiResponse.error("Something went wrong. Please try again later."));
  }
};

// ---------------------------------------------------------------------------
// authenticateAny — accepts BOTH agent and admin tokens (routes shared by
// the user panel and the admin panel, e.g. change-password / logout-all).
// ---------------------------------------------------------------------------
const authenticateAny = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;
    const decoded = token ? jwt.decode(token) : null;
    const type = String(decoded?.type || decoded?.role || "").toUpperCase();
    if (type === "ADMIN" || type === "SUPER_ADMIN") {
      return authenticateAdmin(req, res, next);
    }
    return authenticate(req, res, next);
  } catch {
    res.status(500).json(ApiResponse.error("Something went wrong. Please try again later."));
  }
};

module.exports = authenticate;
module.exports.authenticate      = authenticate;
module.exports.authenticateAdmin = authenticateAdmin;
module.exports.authenticateAny   = authenticateAny;
