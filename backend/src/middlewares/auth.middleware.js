const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { prisma } = require("../config/db");
const ApiResponse = require("../utils/apiResponse");

/**
 * Authentication Middleware
 * Verifies JWT signature and checks for an active session in the database
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json(
        ApiResponse.error("Authentication required", ["Access token is missing or malformed"])
      );
    }

    const token = authHeader.split(" ")[1];

    // Verify JWT signature
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json(
        ApiResponse.error("Invalid token", [err.message || "Failed to authenticate token"])
      );
    }

    // Verify session existence in database
    const session = await prisma.session.findUnique({
      where: { token },
      select: {
        id: true,
        expires_at: true,
      },
    });

    if (!session) {
      return res.status(401).json(
        ApiResponse.error("Session terminated", ["Session is invalid or has been logged out"])
      );
    }

    if (new Date() > session.expires_at) {
      // Clean up expired session in database asynchronously
      prisma.session.delete({ where: { token } }).catch(() => {});
      return res.status(401).json(
        ApiResponse.error("Session expired", ["Your session has expired. Please log in again"])
      );
    }

    // Attach decoded user and token details to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role, // e.g., 'ADMIN', 'SUPER_ADMIN', or null
      type: decoded.type, // 'ADMIN', 'AGENT', 'CLIENT'
    };
    req.token = token;

    next();
  } catch (error) {
    return res.status(500).json(
      ApiResponse.error("Authentication verification failed", [error.message])
    );
  }
};

module.exports = authenticate;
