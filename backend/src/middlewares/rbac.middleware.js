const ApiResponse = require("../utils/apiResponse");

/**
 * Role-Based Access Control (RBAC) Middleware
 * Checks if the authenticated user has the necessary type and role to access a resource
 * 
 * @param {Array<string>} allowedTypes - User types allowed to access (e.g. 'ADMIN', 'AGENT', 'CLIENT')
 * @param {Array<string>} allowedRoles - Admin-specific sub-roles allowed (e.g. 'SUPER_ADMIN', 'ADMIN')
 */
const authorize = (allowedTypes = [], allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json(
        ApiResponse.error("Unauthorized access", ["User details missing from request"])
      );
    }

    const { type, role } = req.user;

    // Validate overall UserType (e.g., ADMIN, AGENT, CLIENT)
    if (allowedTypes.length > 0 && !allowedTypes.includes(type)) {
      return res.status(403).json(
        ApiResponse.error("Forbidden access", ["You do not have the required user type to access this resource"])
      );
    }

    // If access is ADMIN-restricted, validate sub-roles (e.g., SUPER_ADMIN, ADMIN)
    if (type === "ADMIN" && allowedRoles.length > 0 && !allowedRoles.includes(role)) {
      return res.status(403).json(
        ApiResponse.error("Forbidden access", ["You do not have the required admin privilege to access this resource"])
      );
    }

    next();
  };
};

module.exports = authorize;
