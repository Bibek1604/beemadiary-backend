const authService = require("../services/auth.service");
const asyncHandler = require("../utils/asyncHandler");

/**
 * Authentication Controllers
 */
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const ipAddress = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const userAgent = req.headers["user-agent"];

  const result = await authService.adminLogin(email, password, ipAddress, userAgent);

  return res.status(200).json({
    status: true,
    message: "Login successful",
    token: result.token,
    data: {
      id: result.admin.id,
      email: result.admin.email,
    },
  });
});

module.exports = {
  adminLogin,
};
