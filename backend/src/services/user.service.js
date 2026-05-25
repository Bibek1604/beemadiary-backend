const { prisma } = require("../config/db");
const { uploadImage, deleteImage } = require("../utils/cloudinary");
const auditLogRepository = require("../repositories/audit.repository");

class UserService {
  async getAgentProfile(agentId) {
    const agent = await prisma.agent.findUnique({
      where: { id: agentId, deleted_at: null },
    });

    if (!agent) {
      const error = new Error("Agent profile not found");
      error.statusCode = 404;
      throw error;
    }

    return this._formatProfileResponse(agent);
  }

  async updateAgentProfile(agentId, data, file) {
    const currentAgent = await prisma.agent.findUnique({
      where: { id: agentId, deleted_at: null },
    });

    if (!currentAgent) {
      const error = new Error("Agent profile not found");
      error.statusCode = 404;
      throw error;
    }

    // Check email uniqueness if changed
    if (data.email && data.email !== currentAgent.email) {
      const existingEmail = await prisma.agent.findUnique({
        where: { email: data.email },
      });
      if (existingEmail && existingEmail.id !== agentId) {
        const error = new Error("Validation failed");
        error.statusCode = 400;
        error.errors = ["Email already in use by another account"];
        throw error;
      }
    }

    // Check phone uniqueness if changed
    if (data.phone_number && data.phone_number !== currentAgent.phone_number) {
      const existingPhone = await prisma.agent.findUnique({
        where: { phone_number: data.phone_number },
      });
      if (existingPhone && existingPhone.id !== agentId) {
        const error = new Error("Validation failed");
        error.statusCode = 400;
        error.errors = ["Phone number already in use by another account"];
        throw error;
      }
    }

    // Check lic_agent_code uniqueness if changed
    if (data.lic_agent_code && data.lic_agent_code !== currentAgent.lic_agent_code) {
      const existingLicCode = await prisma.agent.findUnique({
        where: { lic_agent_code: data.lic_agent_code },
      });
      if (existingLicCode && existingLicCode.id !== agentId) {
        const error = new Error("Validation failed");
        error.statusCode = 400;
        error.errors = ["LIC Agent Code already in use by another account"];
        throw error;
      }
    }

    let profile_picture = currentAgent.profile_picture;
    let profile_picture_public_id = currentAgent.profile_picture_public_id;

    if (file) {
      // Upload new image
      const uploadResult = await uploadImage(file);
      if (uploadResult) {
        profile_picture = uploadResult.url;
        profile_picture_public_id = uploadResult.public_id;

        // Delete old image if it exists and has a public_id
        if (currentAgent.profile_picture_public_id) {
          try {
            await deleteImage(currentAgent.profile_picture_public_id);
          } catch (err) {
            console.error("Error deleting old profile picture:", err);
          }
        }
      }
    }

    // We don't want agent_code to be updated by this route, only generated on create (if not set, we'll keep it as is, or maybe generate one if it's null).
    // The requirement says "Agent code auto generated". We'll assume it's handled on agent creation.
    // However, if agent_code is null, let's generate one just in case? Or leave it to admin logic.
    // Let's generate one if null to satisfy "Agent code auto generated" if they don't have one.
    let agent_code = currentAgent.agent_code;
    if (!agent_code) {
      agent_code = `AGENT${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}`;
    }

    const updatedAgent = await prisma.agent.update({
      where: { id: agentId },
      data: {
        agent_code,
        full_name: data.full_name || currentAgent.full_name,
        email: data.email || currentAgent.email,
        phone_number: data.phone_number || currentAgent.phone_number,
        lic_agent_code: data.lic_agent_code !== undefined ? data.lic_agent_code : currentAgent.lic_agent_code,
        branch_division: data.branch_division !== undefined ? data.branch_division : currentAgent.branch_division,
        qualification: data.qualification !== undefined ? data.qualification : currentAgent.qualification,
        position_designation: data.position_designation !== undefined ? data.position_designation : currentAgent.position_designation,
        short_bio: data.short_bio !== undefined ? data.short_bio : currentAgent.short_bio,
        profile_picture,
        profile_picture_public_id,
      },
    });

    // Audit log
    await auditLogRepository.create({
      user_id: agentId,
      user_type: "AGENT",
      action: "PROFILE_UPDATED",
      details: { email: updatedAgent.email, phone_number: updatedAgent.phone_number },
    }).catch(console.error);

    return this._formatProfileResponse(updatedAgent);
  }

  _formatProfileResponse(agent) {
    return {
      id: agent.id,
      agent_code: agent.agent_code,
      role: "agent",
      email: agent.email,
      platform: "Insurance Portal",
      profile: {
        full_name: agent.full_name,
        phone_number: agent.phone_number,
        lic_agent_code: agent.lic_agent_code,
        branch_division: agent.branch_division,
        qualification: agent.qualification,
        position_designation: agent.position_designation,
        short_bio: agent.short_bio,
        profile_picture: agent.profile_picture,
      },
    };
  }
}

module.exports = new UserService();
