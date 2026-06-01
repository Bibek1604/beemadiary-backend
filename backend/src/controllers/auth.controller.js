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

const logout = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const userId = req.user?.id;
  if (userId && accessToken) {
    await authService.logout(userId, accessToken).catch(() => {});
  }
  return res.status(200).json({ status: true, message: "Logged out successfully" });
});

module.exports = { adminLogin, agentLogin, refreshToken, logout };
