const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const adminRepository = require("../repositories/admin.repository");
const sessionRepository = require("../repositories/session.repository");
const auditLogRepository = require("../repositories/audit.repository");

/**
 * Authentication Business Logic Service
 */
class AuthService {
  /**
   * Log in an admin user and return a JWT token and session
   * @param {string} email - Admin email
   * @param {string} password - Admin raw password
   * @param {string} ipAddress - Client IP address
   * @param {string} userAgent - Client User Agent header
   */
  async adminLogin(email, password, ipAddress, userAgent) {
    // Find admin by email
    const admin = await adminRepository.findOne({ email });
    if (!admin) {
      const error = new Error("Invalid credentials");
      error.statusCode = 400;
      throw error;
    }

    // Verify hashed password
    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      const error = new Error("Invalid credentials");
      error.statusCode = 400;
      throw error;
    }

    // Check account status
    if (admin.status !== "ACTIVE") {
      const error = new Error("Your account has been deactivated");
      error.statusCode = 403;
      throw error;
    }

    // Generate JWT Auth Token
    const token = jwt.sign(
      {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        type: "ADMIN",
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    // Parse token duration for DB session expiration
    let expiresMs = 24 * 60 * 60 * 1000; // Default 24 hours
    try {
      const durationStr = env.JWT_EXPIRES_IN;
      if (durationStr.endsWith("h")) {
        expiresMs = parseInt(durationStr, 10) * 60 * 60 * 1000;
      } else if (durationStr.endsWith("d")) {
        expiresMs = parseInt(durationStr, 10) * 24 * 60 * 60 * 1000;
      } else if (durationStr.endsWith("m")) {
        expiresMs = parseInt(durationStr, 10) * 60 * 1000;
      }
    } catch (parseError) {
      // Keep default if parsing fails
    }
    const expiresAt = new Date(Date.now() + expiresMs);

    // Save active session to PostgreSQL database
    await sessionRepository.create({
      user_id: admin.id,
      user_type: "ADMIN",
      token,
      expires_at: expiresAt,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
    });

    // Save login audit log
    await auditLogRepository.create({
      user_id: admin.id,
      user_type: "ADMIN",
      action: "ADMIN_LOGIN",
      details: { email: admin.email },
      ip_address: ipAddress || null,
    }).catch(err => {
      // Non-blocking catch to prevent login failure due to logging glitches
      console.error("Audit log creation failed during login:", err);
    });

    return {
      token,
      admin: {
        id: admin.id,
        email: admin.email,
      },
    };
  }
}

module.exports = new AuthService();
