const authService = require("../services/auth.service.js");
const asyncHandler = require("../utils/asyncHandler");
const env = require("../config/env");

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE || 'strict',
  domain: env.COOKIE_DOMAIN || undefined,
  path: '/',
};

/**
 * Authentication Controllers
 */
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  const result = await authService.adminLogin(email, password, ipAddress, userAgent);

  res.cookie('accessToken', result.token, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000,
  });

  return res.status(200).json({
    status: true,
    message: "Login successful",
    token: result.token,
    data: result.admin,
  });
});

const agentLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  const result = await authService.agentLogin(email, password, ipAddress, userAgent);

  res.cookie('accessToken', result.token, {
    ...cookieOptions,
    maxAge: 24 * 60 * 60 * 1000, // Match JWT_EXPIRES_IN (24h)
  });

  return res.status(200).json({
    status: true,
    message: "Login successful",
    token: result.token,
    data: result.agent,
  });
});

module.exports = {
  adminLogin,
  agentLogin,
};
