const authService = require("../services/auth.service.js");
const asyncHandler = require("../utils/asyncHandler");

const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const result = await authService.adminLogin(email, password, ipAddress, userAgent);
  return res.status(200).json({
    status:       true,
    message:      "Login successful",
    accessToken:  result.accessToken,
    refreshToken: result.refreshToken,
    data:         result.admin,
  });
});

const agentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const result = await authService.agentLogin(email, password, ipAddress, userAgent);
  return res.status(200).json({
    status:       true,
    message:      "Login successful",
    accessToken:  result.accessToken,
    refreshToken: result.refreshToken,
    token:        result.accessToken,
    data:         result.agent,
  });
});

const agentRegister = asyncHandler(async (req, res) => {
  const { email, password, full_name, phone_number } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const result = await authService.agentRegister({ email, password, full_name, phone_number }, ipAddress, userAgent);
  return res.status(201).json({
    status:       true,
    message:      "Registration successful",
    accessToken:  result.accessToken,
    refreshToken: result.refreshToken,
    token:        result.accessToken,
    data:         result.agent,
  });
});

const refreshToken = asyncHandler(async (req, res) => {
  const raw = req.body.refreshToken || req.headers["x-refresh-token"];
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  if (!raw) {
    return res.status(401).json({ status: false, message: "Refresh token is required" });
  }
  const tokens = await authService.refreshTokens(raw, ipAddress, userAgent);
  return res.status(200).json({
    status:       true,
    message:      "Token refreshed successfully",
    accessToken:  tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const currentPassword = req.body.current_password ?? req.body.old_password;
  const newPassword = req.body.new_password;
  const confirmPassword = req.body.confirm_password;

  const errors = [];
  if (!currentPassword) errors.push("Current password is required");
  if (!newPassword) errors.push("New password is required");
  else if (String(newPassword).length < 6) errors.push("New password must be at least 6 characters");
  if (confirmPassword !== undefined && confirmPassword !== newPassword) {
    errors.push("New password and confirmation do not match");
  }
  if (errors.length > 0) {
    return res.status(400).json({ status: false, message: "Validation failed", errors });
  }

  const authHeader = req.headers.authorization || "";
  const currentToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const result = await authService.changePassword(req.user, String(currentPassword), String(newPassword), currentToken);
  return res.status(200).json({ status: true, message: result.message });
});

const logoutAll = asyncHandler(async (req, res) => {
  const result = await authService.logoutAll(req.user.id);
  return res.status(200).json({ status: true, message: result.message });
});

const adminRegister = asyncHandler(async (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];
  const result = await authService.adminBootstrapRegister({ email, password, first_name, last_name }, ipAddress, userAgent);
  return res.status(201).json({
    status: true,
    message: "Admin account created",
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    data: result.admin,
  });
});

const forgotPassword = asyncHandler(async (_req, res) => {
  // No outbound email infrastructure is configured for this deployment.
  return res.status(501).json({
    status: false,
    message: "Password reset by email is not available. Please contact your administrator to reset your password.",
  });
});

const logout = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userId = req.user?.id;
  if (userId && accessToken) {
    await authService.logout(userId, accessToken).catch(() => {});
  }
  return res.status(200).json({ status: true, message: "Logged out successfully" });
});

module.exports = { adminLogin, agentLogin, agentRegister, adminRegister, changePassword, logoutAll, forgotPassword, refreshToken, logout };
