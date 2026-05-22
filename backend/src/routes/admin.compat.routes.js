const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../config/db");
const authenticate = require("../middlewares/auth.middleware");
const authorize = require("../middlewares/rbac.middleware");
const ApiResponse = require("../utils/apiResponse");

const router = express.Router();

const toIso = (value) => (value ? new Date(value).toISOString() : null);
const normalizeStatus = (value) => String(value || "ACTIVE").toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE";
const normalizeText = (value, fallback = "") => typeof value === "string" ? value.trim() : fallback;
const agentSelect = {
  id: true,
  email: true,
  full_name: true,
  phone_number: true,
  status: true,
  company_id: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  _count: { select: { clients: true } },
};

const serializeAdmin = (admin) => ({
  id: admin.id,
  username: admin.username,
  email: admin.email,
  first_name: admin.username,
  last_name: "",
  role: "ADMIN",
  is_active: admin.status === "ACTIVE",
  phone_number: admin.phone,
  company: null,
  assigned_agent: null,
  created_at: toIso(admin.created_at),
  updated_at: toIso(admin.updated_at),
});

const serializeAgent = (agent) => ({
  id: agent.id,
  username: agent.email ? String(agent.email).split("@")[0] : agent.id,
  email: agent.email,
  first_name: (agent.full_name || "").trim().split(/\s+/)[0] || "",
  last_name: (agent.full_name || "").trim().split(/\s+/).slice(1).join(" "),
  role: "AGENT",
  is_active: agent.status === "ACTIVE",
  phone_number: agent.phone_number,
  company: agent.company_id,
  assigned_agent: null,
  num_clients: agent._count?.clients || 0,
  created_at: toIso(agent.created_at),
  updated_at: toIso(agent.updated_at),
});

const serializeClient = (client) => ({
  id: client.id,
  username: client.email ? String(client.email).split("@")[0] : client.id,
  email: client.email,
  first_name: client.first_name,
  last_name: client.last_name,
  role: "CLIENT",
  is_active: client.status === "ACTIVE",
  phone_number: client.phone,
  company: null,
  assigned_agent: client.agent_id,
  created_at: toIso(client.created_at),
  updated_at: toIso(client.updated_at),
});

const serializeCompany = (company) => ({
  id: company.id,
  name: company.name,
  email: company.email,
  phone_number: company.phone_number,
  image: company.image,
  status: company.status,
  created_at: toIso(company.created_at),
  updated_at: toIso(company.updated_at),
});

const getFirstAgentId = async () => {
  const agent = await prisma.agent.findFirst({
    where: { deleted_at: null },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  return agent?.id || null;
};

router.use(authenticate, authorize(["ADMIN"], ["SUPER_ADMIN", "ADMIN"]));

router.get("/users", async (_req, res) => {
  const [admins, agents, clients] = await Promise.all([
    prisma.admin.findMany({ where: { deleted_at: null }, orderBy: { created_at: "desc" } }),
    prisma.agent.findMany({
      where: { deleted_at: null },
      select: agentSelect,
      orderBy: { created_at: "desc" },
    }),
    prisma.client.findMany({ where: { deleted_at: null }, orderBy: { created_at: "desc" } }),
  ]);

  const users = [...admins.map(serializeAdmin), ...agents.map(serializeAgent), ...clients.map(serializeClient)]
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")));

  return res.status(200).json(ApiResponse.success("Users retrieved successfully", users));
});

router.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (admin && !admin.deleted_at) return res.status(200).json(ApiResponse.success("User retrieved successfully", serializeAdmin(admin)));

  const agent = await prisma.agent.findUnique({ where: { id }, select: agentSelect });
  if (agent && !agent.deleted_at) return res.status(200).json(ApiResponse.success("User retrieved successfully", serializeAgent(agent)));

  const client = await prisma.client.findUnique({ where: { id } });
  if (client && !client.deleted_at) return res.status(200).json(ApiResponse.success("User retrieved successfully", serializeClient(client)));

  return res.status(404).json(ApiResponse.notFound("User not found"));
});

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create a User
 *     description: Create an admin, agent, or client user. Default role is AGENT.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [ADMIN, AGENT, CLIENT]
 *                 default: AGENT
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *                 default: true
 *               company:
 *                 type: string
 *                 description: Company ID (for AGENT role)
 *               agent_id:
 *                 type: string
 *                 description: Agent ID (for CLIENT role)
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/users", async (req, res) => {
  const role = String(req.body.role || "AGENT").toUpperCase();
  const password = normalizeText(req.body.password);
  if (!password) return res.status(400).json(ApiResponse.validationError([{ field: "password", message: "Password is required" }]));

  if (role === "ADMIN") {
    const admin = await prisma.admin.create({
      data: {
        username: normalizeText(req.body.username),
        email: normalizeText(req.body.email),
        phone: normalizeText(req.body.phone_number),
        password_hash: await bcrypt.hash(password, 10),
        status: normalizeStatus(req.body.is_active),
        role: "ADMIN",
      },
    });
    return res.status(201).json(ApiResponse.success("Admin created successfully", serializeAdmin(admin)));
  }

  if (role === "CLIENT") {
    const agentId = req.body.agent_id ? String(req.body.agent_id) : await getFirstAgentId();
    if (!agentId) return res.status(400).json(ApiResponse.validationError([{ field: "agent_id", message: "At least one agent is required" }]));

    const client = await prisma.client.create({
      data: {
        first_name: normalizeText(req.body.first_name),
        last_name: normalizeText(req.body.last_name),
        email: normalizeText(req.body.email),
        phone: normalizeText(req.body.phone_number),
        address: normalizeText(req.body.address, ""),
        password_hash: await bcrypt.hash(password, 10),
        status: normalizeStatus(req.body.is_active),
        agent_id: agentId,
      },
    });
    return res.status(201).json(ApiResponse.success("Client created successfully", serializeClient(client)));
  }

  const agent = await prisma.agent.create({
    select: agentSelect,
    data: {
      full_name: `${normalizeText(req.body.first_name)} ${normalizeText(req.body.last_name)}`.trim(),
      email: normalizeText(req.body.email),
      phone_number: normalizeText(req.body.phone_number),
      password_hash: await bcrypt.hash(password, 10),
      status: normalizeStatus(req.body.is_active),
      company_id: req.body.company ? String(req.body.company) : null,
    },
  });

  return res.status(201).json(ApiResponse.success("Agent created successfully", serializeAgent({ ...agent, _count: { clients: 0 } })));
});

router.patch("/users/:id", async (req, res) => {
  const { id } = req.params;
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (admin && !admin.deleted_at) {
    const updated = await prisma.admin.update({
      where: { id },
      data: {
        username: req.body.username ?? undefined,
        email: req.body.email ?? undefined,
        phone: req.body.phone_number ?? undefined,
        status: req.body.is_active === undefined ? undefined : normalizeStatus(req.body.is_active),
      },
    });
    return res.status(200).json(ApiResponse.success("User updated successfully", serializeAdmin(updated)));
  }

  const agent = await prisma.agent.findUnique({ where: { id }, select: agentSelect });
  if (agent && !agent.deleted_at) {
    const updated = await prisma.agent.update({
      where: { id },
      select: agentSelect,
      data: {
        full_name: req.body.first_name || req.body.last_name ? `${normalizeText(req.body.first_name || agent.full_name)} ${normalizeText(req.body.last_name || "")}`.trim() : undefined,
        email: req.body.email ?? undefined,
        phone_number: req.body.phone_number ?? undefined,
        status: req.body.is_active === undefined ? undefined : normalizeStatus(req.body.is_active),
        company_id: req.body.company ? String(req.body.company) : undefined,
      },
    });
    return res.status(200).json(ApiResponse.success("User updated successfully", serializeAgent(updated)));
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (client && !client.deleted_at) {
    const updated = await prisma.client.update({
      where: { id },
      data: {
        first_name: req.body.first_name ?? undefined,
        last_name: req.body.last_name ?? undefined,
        email: req.body.email ?? undefined,
        phone: req.body.phone_number ?? undefined,
        address: req.body.address ?? undefined,
        status: req.body.is_active === undefined ? undefined : normalizeStatus(req.body.is_active),
      },
    });
    return res.status(200).json(ApiResponse.success("User updated successfully", serializeClient(updated)));
  }

  return res.status(404).json(ApiResponse.notFound("User not found"));
});

router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (admin && !admin.deleted_at) {
    await prisma.admin.update({ where: { id }, data: { deleted_at: new Date(), status: "INACTIVE" } });
    return res.status(200).json(ApiResponse.success("User deleted successfully", { id }));
  }

  const agent = await prisma.agent.findUnique({ where: { id }, select: { id: true, deleted_at: true } });
  if (agent && !agent.deleted_at) {
    await prisma.agent.update({ where: { id }, data: { deleted_at: new Date(), status: "INACTIVE" } });
    return res.status(200).json(ApiResponse.success("User deleted successfully", { id }));
  }

  const client = await prisma.client.findUnique({ where: { id } });
  if (client && !client.deleted_at) {
    await prisma.client.update({ where: { id }, data: { deleted_at: new Date(), status: "INACTIVE" } });
    return res.status(200).json(ApiResponse.success("User deleted successfully", { id }));
  }

  return res.status(404).json(ApiResponse.notFound("User not found"));
});

router.get("/companies", async (_req, res) => {
  const companies = await prisma.company.findMany({ where: { deleted_at: null }, orderBy: { created_at: "desc" } });
  return res.status(200).json(ApiResponse.success("Companies retrieved successfully", companies.map(serializeCompany)));
});

router.get("/companies/:id", async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company || company.deleted_at) return res.status(404).json(ApiResponse.notFound("Company not found"));
  return res.status(200).json(ApiResponse.success("Company retrieved successfully", serializeCompany(company)));
});

router.patch("/companies/:id", async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company || company.deleted_at) return res.status(404).json(ApiResponse.notFound("Company not found"));

  const updated = await prisma.company.update({
    where: { id: req.params.id },
    data: {
      name: req.body.name ?? undefined,
      email: req.body.email ?? undefined,
      phone_number: req.body.phone_number ?? undefined,
      image: req.body.image ?? undefined,
      status: req.body.status === undefined ? undefined : normalizeStatus(req.body.status),
    },
  });

  return res.status(200).json(ApiResponse.success("Company updated successfully", serializeCompany(updated)));
});

router.delete("/companies/:id", async (req, res) => {
  const company = await prisma.company.findUnique({ where: { id: req.params.id } });
  if (!company || company.deleted_at) return res.status(404).json(ApiResponse.notFound("Company not found"));

  await prisma.company.update({ where: { id: req.params.id }, data: { deleted_at: new Date(), status: "INACTIVE" } });
  return res.status(200).json(ApiResponse.success("Company deleted successfully", { id: req.params.id }));
});

module.exports = router;