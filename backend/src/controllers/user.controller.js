const userService = require("../services/user.service");
const ApiResponse = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");

const getProfile = asyncHandler(async (req, res) => {
  const agentId = req.user.id; 

  const profile = await userService.getAgentProfile(agentId);

  return res.status(200).json(
    ApiResponse.success("Profile fetched successfully", profile)
  );
});

const updateProfile = asyncHandler(async (req, res) => {
  const agentId = req.user.id;
  const data = req.body;
  const file = req.file;

  const updatedProfile = await userService.updateAgentProfile(agentId, data, file);

  return res.status(200).json(
    ApiResponse.success("Profile updated successfully", updatedProfile)
  );
});

module.exports = {
  getProfile,
  updateProfile,
};
