import { Router, Response } from 'express';
import prisma from '../config/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { verifyAdminToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { ResponseHandler } from '../utils/errorResponse';
import imageHandler from '../utils/imageHandler';
import { PasswordUtils } from '../utils/passwordUtils';
const logger = require('../utils/logger');
const { boundaryGuard } = require('../middleware/boundaryGuard');

type Company = any;
type Status = 'ACTIVE' | 'INACTIVE';
const Status = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;
type UserType = 'ADMIN' | 'AGENT' | 'CLIENT';
const UserType = { ADMIN: 'ADMIN', AGENT: 'AGENT', CLIENT: 'CLIENT' } as const;
type NotificationTargetType = 'SINGLE' | 'ALL';
const NotificationTargetType = { SINGLE: 'SINGLE', ALL: 'ALL' } as const;
type PolicyStatus = 'ACTIVE' | 'LAPSED' | 'EXPIRED' | 'PENDING';
const PolicyStatus = { ACTIVE: 'ACTIVE', LAPSED: 'LAPSED', EXPIRED: 'EXPIRED', PENDING: 'PENDING' } as const;

// ── Policy validation constants ───────────────────────────────────────────────
const VALID_POLICY_TYPES = ['GENERAL', 'LIFE', 'HEALTH', 'VEHICLE', 'PROPERTY', 'ENDOWMENT', 'TERM'];
const VALID_POLICY_STATUSES = Object.values(PolicyStatus);
const POLICY_NAME_MIN = 3;
const POLICY_NAME_MAX = 100;

/**
 * Validate policy body fields. Returns array of {field, message} errors.
 * @param body        Request body
 * @param requireName Whether `name` is required (true on create, false on patch)
 */
const validatePolicyBody = (body: any, requireName = true): Array<{ field: string; message: string }> => {
  const errors: Array<{ field: string; message: string }> = [];

  const rawName = typeof body.name === 'string' ? body.name.trim() : null;

  if (requireName) {
    if (!rawName) {
      errors.push({ field: 'name', message: 'Policy name is required' });
    } else if (rawName.length < POLICY_NAME_MIN) {
      errors.push({ field: 'name', message: `Policy name must be at least ${POLICY_NAME_MIN} characters` });
    } else if (rawName.length > POLICY_NAME_MAX) {
      errors.push({ field: 'name', message: `Policy name must not exceed ${POLICY_NAME_MAX} characters` });
    }
  } else if (rawName !== null) {
    // Field was provided but may be empty / too short / too long
    if (!rawName) {
      errors.push({ field: 'name', message: 'Policy name cannot be empty' });
    } else if (rawName.length < POLICY_NAME_MIN) {
      errors.push({ field: 'name', message: `Policy name must be at least ${POLICY_NAME_MIN} characters` });
    } else if (rawName.length > POLICY_NAME_MAX) {
      errors.push({ field: 'name', message: `Policy name must not exceed ${POLICY_NAME_MAX} characters` });
    }
  }

  if (body.type !== undefined && body.type !== null && body.type !== '') {
    const typeUpper = String(body.type).trim().toUpperCase();
    if (!VALID_POLICY_TYPES.includes(typeUpper)) {
      errors.push({ field: 'type', message: `Policy type must be one of: ${VALID_POLICY_TYPES.join(', ')}` });
    }
  }

  if (body.status !== undefined && body.status !== null && body.status !== '') {
    const statusUpper = String(body.status).trim().toUpperCase() as PolicyStatus;
    if (!VALID_POLICY_STATUSES.includes(statusUpper)) {
      errors.push({ field: 'status', message: `Policy status must be one of: ${VALID_POLICY_STATUSES.join(', ')}` });
    }
  }

  if (body.coverage_amount !== undefined && body.coverage_amount !== null && body.coverage_amount !== '') {
    const num = Number(body.coverage_amount);
    if (isNaN(num) || num < 0) {
      errors.push({ field: 'coverage_amount', message: 'Coverage amount must be a non-negative number' });
    }
  }

  if (body.premium_amount !== undefined && body.premium_amount !== null && body.premium_amount !== '') {
    const num = Number(body.premium_amount);
    if (isNaN(num) || num < 0) {
      errors.push({ field: 'premium_amount', message: 'Premium amount must be a non-negative number' });
    }
  }

  return errors;
};

type TransactionStatus = 'PENDING' | 'SUCCESSFUL' | 'FAILED';
const TransactionStatus = { PENDING: 'PENDING', SUCCESSFUL: 'SUCCESSFUL', FAILED: 'FAILED' } as const;
type TransactionType = 'PREMIUM_PAYMENT' | 'CLAIM_PAYOUT' | 'COMMISSION';
const TransactionType = { PREMIUM_PAYMENT: 'PREMIUM_PAYMENT', CLAIM_PAYOUT: 'CLAIM_PAYOUT', COMMISSION: 'COMMISSION' } as const;

const router = Router();

// verifyAdminToken uses JWT_ADMIN_SECRET — admin tokens only, never interchangeable with user tokens
router.use(verifyAdminToken, requireAdmin);

const toIso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

const normalizeStatus = (value: unknown): Status =>
  String(value || '').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

const normalizeText = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback;

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

// System-managed fields that must never be set from a client payload.
const RESERVED_WRITE_KEYS = new Set(['_id', 'id', 'created_at', 'updated_at', 'deleted_at']);

/**
 * Security: sanitize an untrusted object before it is written to the database.
 *
 * Used for generic "pass-through" writes (e.g. reports) where the body is spread
 * directly into a create/update. It strips:
 *   - system-managed keys (id, _id, created_at, updated_at, deleted_at), so the
 *     server stays the single source of truth for identity/timestamps/soft-delete;
 *   - MongoDB operator and dotted keys ($-prefixed or containing ".") to prevent
 *     operator/path injection into the stored document.
 *
 * Legitimate content fields are preserved unchanged, so request/response behaviour
 * is unaffected for normal clients.
 */
const sanitizeWriteData = (input: unknown): Record<string, any> => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(input as Record<string, any>)) {
    if (RESERVED_WRITE_KEYS.has(key)) continue;
    if (key.startsWith('$') || key.includes('.')) continue;
    clean[key] = value;
  }
  return clean;
};

/**
 * Opt-in pagination parser. Returns null when the client did NOT supply any
 * pagination params, so existing (non-paginated) array responses stay
 * byte-identical and 100% backward compatible. When ?page or ?limit is present,
 * returns normalized { page, limit }.
 */
const getPagination = (query: any): { page: number; limit: number } | null => {
  const hasPage = query?.page !== undefined && String(query.page).trim() !== '';
  const hasLimit = query?.limit !== undefined && String(query.limit).trim() !== '';
  if (!hasPage && !hasLimit) return null;
  const page = Math.min(100000, Math.max(1, parseInt(String(query.page || '1'), 10) || 1)); // cap depth: bounds MongoDB skip
  const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || '20'), 10) || 20));
  return { page, limit };
};

/** Wrap an already-materialized array in the standard pagination envelope. */
const paginateArray = (items: any[], pg: { page: number; limit: number }) => {
  const start = (pg.page - 1) * pg.limit;
  const results = items.slice(start, start + pg.limit);
  return {
    results,
    page: pg.page,
    limit: pg.limit,
    total: items.length,
    totalPages: Math.ceil(items.length / pg.limit) || 0,
    count: results.length,
  };
};

/**
 * Backward-compatible list response helper: returns the plain array unless the
 * request opted into pagination via ?page/?limit, in which case it returns the
 * paginated envelope. Default behaviour is unchanged.
 */
const maybePaginate = (req: any, items: any[]) => {
  const pg = getPagination(req.query);
  return pg ? paginateArray(items, pg) : items;
};

/**
 * DB-side opt-in pagination. Identical response contract to maybePaginate:
 * returns the full mapped array unless the request sent ?page/?limit, in which
 * case it runs a DB-level count + skip/take and returns the standard envelope
 * ({ results, page, limit, total, totalPages, count }). This avoids loading the
 * entire table into memory just to slice it.
 */
const listMaybePaginate = async (
  req: any,
  model: { count: (args: any) => Promise<number>; findMany: (args: any) => Promise<any[]> },
  query: any,
  map: (row: any) => any = (row: any) => row,
) => {
  const pg = getPagination(req.query);
  if (!pg) {
    const rows = await model.findMany(query);
    return Promise.all(rows.map((row: any) => map(row)));
  }
  const [total, rows] = await Promise.all([
    model.count({ where: query.where }),
    model.findMany({ ...query, skip: (pg.page - 1) * pg.limit, take: pg.limit }),
  ]);
  const results = await Promise.all(rows.map((row: any) => map(row)));
  return { results, page: pg.page, limit: pg.limit, total, totalPages: Math.ceil(total / pg.limit) || 0, count: results.length };
};

const splitName = (fullName: string) => {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/);
  return {
    first_name: firstName,
    last_name: rest.join(' '),
  };
};

const getCurrentAdminId = (req: any) => String(req.user?.id || '');

const serializeCompany = (company: Company) => ({
  id: company.id,
  name: company.name,
  email: company.email,
  phone_number: company.phone_number,
  image: company.image,
  status: company.status,
  created_at: toIso(company.created_at),
  updated_at: toIso(company.updated_at),
});

const serializeAgent = (agent: any) => {
  const name = splitName(agent.full_name || '');
  return {
    id: agent.id,
    username: agent.agent_code || (agent.email ? String(agent.email).split('@')[0] : agent.id),
    email: agent.email,
    first_name: name.first_name,
    last_name: name.last_name,
    role: 'AGENT',
    is_active: agent.status === 'ACTIVE',
    phone_number: agent.phone_number,
    company: agent.company_id,
    assigned_agent: null,
    agent_profile: {
      agent_id: agent.agent_code || agent.id,
      performance_score: 0,
      license_number: agent.lic_agent_code || '',
      specialization: agent.position_designation || '',
      dob: null,
      docs_image: null,
    },
    num_clients: agent._count?.clients ?? 0,
    created_at: toIso(agent.created_at),
    updated_at: toIso(agent.updated_at),
  };
};

const serializeAdmin = (admin: any) => ({
  id: admin.id,
  username: admin.username,
  email: admin.email,
  first_name: admin.username,
  last_name: '',
  role: 'ADMIN',
  is_active: admin.status === 'ACTIVE',
  phone_number: admin.phone,
  company: null,
  assigned_agent: null,
  created_at: toIso(admin.created_at),
  updated_at: toIso(admin.updated_at),
});

const serializeClient = (client: any) => ({
  id: client.id,
  username: client.email ? String(client.email).split('@')[0] : client.id,
  email: client.email,
  first_name: client.first_name,
  last_name: client.last_name,
  role: 'CLIENT',
  is_active: client.status === 'ACTIVE',
  phone_number: client.phone,
  company: null,
  assigned_agent: client.agent_id,
  created_at: toIso(client.created_at),
  updated_at: toIso(client.updated_at),
});

const serializePolicy = (policy: any) => ({
  id: policy.id,
  name: policy.name,
  company: policy.company_id,
  company_name: policy.company?.name || null,
  client: policy.client_id,
  agent: policy.agent_id,
  policy_number: policy.policy_number,
  type: policy.type,
  coverage_amount: policy.coverage_amount,
  premium_amount: policy.premium_amount,
  status: policy.status,
  start_date: toIso(policy.start_date),
  end_date: toIso(policy.end_date),
  created_at: toIso(policy.created_at),
  updated_at: toIso(policy.updated_at),
});

const serializeTransaction = (transaction: any) => ({
  id: transaction.id,
  client: transaction.policy?.client_id || null,
  client_username: transaction.policy?.client
    ? `${transaction.policy.client.first_name} ${transaction.policy.client.last_name}`.trim()
    : null,
  amount: String(transaction.amount),
  due_date: toIso(transaction.policy?.end_date || transaction.transaction_date),
  paid_upto: toIso(transaction.transaction_date),
  status:
    transaction.status === 'SUCCESSFUL'
      ? 'COMPLETED'
      : transaction.status === 'FAILED'
      ? 'FAILED'
      : transaction.status === 'PENDING'
      ? 'PENDING'
      : 'OVERDUE',
  computed_status:
    transaction.status === 'SUCCESSFUL'
      ? 'Paid'
      : transaction.status === 'PENDING'
      ? 'Pending'
      : 'Due',
  remaining_days: null,
  overdue_days: null,
  transaction_id: transaction.reference_number,
  created_at: toIso(transaction.created_at),
  updated_at: toIso(transaction.updated_at),
});

const resolveNotificationRecipient = async (notification: any) => {
  if (notification.recipient_type === 'ADMIN') {
    const admin = await prisma.admin.findUnique({ where: { id: notification.recipient_id } });
    return admin?.username || null;
  }

  if (notification.recipient_type === 'AGENT') {
    const agent = await prisma.agent.findUnique({ where: { id: notification.recipient_id } });
    return agent?.full_name || null;
  }

  const client = await prisma.client.findUnique({ where: { id: notification.recipient_id } });
  return client ? `${client.first_name} ${client.last_name}`.trim() : null;
};

const serializeNotification = async (notification: any) => {
  const payload = parseJson<any>(notification.message, {});
  const recipientUsername = await resolveNotificationRecipient(notification);

  return {
    id: notification.id,
    recipient: notification.recipient_id,
    recipient_username: recipientUsername,
    title: notification.title,
    content: payload.content || notification.message,
    status: notification.is_read ? 'READ' : 'SENT',
    scheduled_time: payload.scheduled_time || null,
    sent_at: notification.is_read ? toIso(notification.updated_at) : null,
    type: payload.type || 'info',
    image: payload.image || null,
    file: payload.file || null,
    link: payload.link || null,
    description: payload.description || null,
    created_at: toIso(notification.created_at),
    updated_at: toIso(notification.updated_at),
  };
};

const serializeBulkNotification = (notification: any) => {
  const payload = parseJson<any>(notification.content, {});
  return {
    id: notification.id,
    title: notification.title,
    content: payload.description || notification.content,
    target_type: notification.target_type,
    target_agent_id: notification.target_agent_id,
    target_agent: notification.target_agent
      ? {
          id: notification.target_agent.id,
          full_name: notification.target_agent.full_name,
          email: notification.target_agent.email,
        }
      : null,
    created_by: notification.created_by,
    creator: notification.creator
      ? {
          id: notification.creator.id,
          username: notification.creator.username,
          email: notification.creator.email,
        }
      : null,
    description: payload.description || '',
    icon: payload.icon || null,
    required_xp: payload.required_xp || 0,
    created_at: toIso(notification.created_at),
    updated_at: toIso(notification.updated_at),
  };
};

const serializeUserAchievement = (read: any) => {
  const payload = parseJson<any>(read.notification?.content, {});
  return {
    id: read.id,
    user: read.agent_id,
    username: read.agent?.email ? String(read.agent.email).split('@')[0] : read.agent?.full_name || null,
    achievement: read.notification_id,
    achievement_title: read.notification?.title,
    achievement_icon: payload.icon || null,
    unlocked_at: toIso(read.read_at || read.created_at),
  };
};

const buildContentMessage = (kind: string, fields: Record<string, unknown>) =>
  JSON.stringify({ kind, ...fields });

const findPrimaryAgentId = async (companyId?: string | null) => {
  const agent = await prisma.agent.findFirst({
    where: {
      deleted_at: null,
      ...(companyId ? { company_id: companyId } : {}),
    },
    orderBy: { created_at: 'asc' },
  });

  return agent?.id || null;
};

const findPrimaryClientId = async (agentId?: string | null) => {
  const client = await prisma.client.findFirst({
    where: {
      deleted_at: null,
      ...(agentId ? { agent_id: agentId } : {}),
    },
    orderBy: { created_at: 'asc' },
  });

  return client?.id || null;
};

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List all users (admins, agents, clients)
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: Search by name/email/phone }
 *       - { in: query, name: page, schema: { type: integer }, description: 'Opt-in pagination; omit for full list' }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: Users retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/users',
  asyncHandler(async (req: any, res: Response) => {
    const search = normalizeText(req.query.search);
    const [admins, agents, clients] = await Promise.all([
      prisma.admin.findMany({
        where: {
          deleted_at: null,
          ...(search
            ? {
                OR: [
                  { username: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.agent.findMany({
        where: {
          deleted_at: null,
          ...(search
            ? {
                OR: [
                  { full_name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone_number: { contains: search, mode: 'insensitive' } },
                  { agent_code: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        include: { _count: { select: { clients: true } } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.client.findMany({
        where: {
          deleted_at: null,
          ...(search
            ? {
                OR: [
                  { first_name: { contains: search, mode: 'insensitive' } },
                  { last_name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const users = [...admins.map(serializeAdmin), ...agents.map(serializeAgent), ...clients.map(serializeClient)]
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));

    return res.status(200).json(ResponseHandler.success('Users retrieved successfully', maybePaginate(req, users)));
  })
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     summary: Get a single user by ID
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: User retrieved successfully }
 *       404: { description: User not found }
 *       401: { description: Unauthorized }
 */
router.get(
  '/users/:id',
  asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;

    const admin = await prisma.admin.findUnique({ where: { id } });
    if (admin && !admin.deleted_at) {
      return res.status(200).json(ResponseHandler.success('User retrieved successfully', serializeAdmin(admin)));
    }

    const agent = await prisma.agent.findUnique({
      where: { id },
      include: { _count: { select: { clients: true } } },
    });
    if (agent && !agent.deleted_at) {
      return res.status(200).json(ResponseHandler.success('User retrieved successfully', serializeAgent(agent)));
    }

    const client = await prisma.client.findUnique({ where: { id } });
    if (client && !client.deleted_at) {
      return res.status(200).json(ResponseHandler.success('User retrieved successfully', serializeClient(client)));
    }

    return res.status(404).json(ResponseHandler.notFound('User not found'));
  })
);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create a user (admin, agent, or client by role)
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               role: { type: string, enum: [ADMIN, AGENT, CLIENT], default: AGENT }
 *               username: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               phone_number: { type: string }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               address: { type: string }
 *               company: { type: string, description: Company ID }
 *               is_active: { type: boolean }
 *     responses:
 *       201: { description: User created successfully }
 *       400: { description: Validation failed }
 *       401: { description: Unauthorized }
 */
router.post(
  '/users',
  asyncHandler(async (req: any, res: Response) => {
    const role = String(req.body.role || 'AGENT').toUpperCase();
    const password = normalizeText(req.body.password);

    if (!password) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'password', message: 'Password is required' }]));
    }

    if (role === 'ADMIN') {
      const admin = await prisma.admin.create({
        data: {
          username: normalizeText(req.body.username),
          email: normalizeText(req.body.email),
          phone: normalizeText(req.body.phone_number),
          password_hash: PasswordUtils.hashPassword(password),
          status: normalizeStatus(req.body.is_active),
          role: 'ADMIN',
        },
      });

      return res.status(201).json(ResponseHandler.success('Admin created successfully', serializeAdmin(admin)));
    }

    if (role === 'CLIENT') {
      const agentId = (await findPrimaryAgentId(req.body.company ? String(req.body.company) : null)) || (await findPrimaryAgentId());

      if (!agentId) {
        return res.status(400).json(ResponseHandler.validationError([{ field: 'agent_id', message: 'At least one agent is required to create a client' }]));
      }

      const client = await prisma.client.create({
        data: {
          first_name: normalizeText(req.body.first_name),
          last_name: normalizeText(req.body.last_name),
          email: normalizeText(req.body.email),
          phone: normalizeText(req.body.phone_number),
          address: normalizeText(req.body.address, ''),
          password_hash: PasswordUtils.hashPassword(password),
          status: normalizeStatus(req.body.is_active),
          agent_id: agentId,
        },
      });

      return res.status(201).json(ResponseHandler.success('Client created successfully', serializeClient(client)));
    }

    const companyId = req.body.company ? String(req.body.company) : null;
    const fullName = `${normalizeText(req.body.first_name)} ${normalizeText(req.body.last_name)}`.trim();

    const agent = await prisma.agent.create({
      data: {
        agent_code: normalizeText(req.body.username),
        full_name: fullName,
        email: normalizeText(req.body.email),
        phone_number: normalizeText(req.body.phone_number),
        password_hash: PasswordUtils.hashPassword(password),
        status: normalizeStatus(req.body.is_active),
        company_id: companyId,
      },
    });

    return res.status(201).json(ResponseHandler.success('Agent created successfully', serializeAgent({ ...agent, _count: { clients: 0 } })));
  })
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   patch:
 *     summary: Update a user
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               email: { type: string, format: email }
 *               phone_number: { type: string }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               address: { type: string }
 *               company: { type: string }
 *               password: { type: string }
 *               is_active: { type: boolean }
 *     responses:
 *       200: { description: User updated successfully }
 *       404: { description: User not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/users/:id',
  asyncHandler(async (req: any, res: Response) => {
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
          ...(normalizeText(req.body.password) ? { password_hash: PasswordUtils.hashPassword(normalizeText(req.body.password)) } : {}),
        },
      });

      return res.status(200).json(ResponseHandler.success('User updated successfully', serializeAdmin(updated)));
    }

    const agent = await prisma.agent.findUnique({ where: { id }, include: { _count: { select: { clients: true } } } });
    if (agent && !agent.deleted_at) {
      const updated = await prisma.agent.update({
        where: { id },
        data: {
          agent_code: req.body.username ?? undefined,
          full_name:
            req.body.first_name || req.body.last_name
              ? `${normalizeText(req.body.first_name || agent.full_name)} ${normalizeText(req.body.last_name || '')}`.trim()
              : undefined,
          email: req.body.email ?? undefined,
          phone_number: req.body.phone_number ?? undefined,
          status: req.body.is_active === undefined ? undefined : normalizeStatus(req.body.is_active),
          company_id: req.body.company ? String(req.body.company) : undefined,
          ...(normalizeText(req.body.password) ? { password_hash: PasswordUtils.hashPassword(normalizeText(req.body.password)) } : {}),
        },
      });

      return res.status(200).json(ResponseHandler.success('User updated successfully', serializeAgent(updated)));
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
          ...(normalizeText(req.body.password) ? { password_hash: PasswordUtils.hashPassword(normalizeText(req.body.password)) } : {}),
        },
      });

      return res.status(200).json(ResponseHandler.success('User updated successfully', serializeClient(updated)));
    }

    return res.status(404).json(ResponseHandler.notFound('User not found'));
  })
);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Soft-delete a user
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: User deleted successfully }
 *       404: { description: User not found }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/users/:id',
  asyncHandler(async (req: any, res: Response) => {
    const { id } = req.params;

    const admin = await prisma.admin.findUnique({ where: { id } });
    if (admin && !admin.deleted_at) {
      await prisma.admin.update({
        where: { id },
        data: { deleted_at: new Date(), status: 'INACTIVE' },
      });
      return res.status(200).json(ResponseHandler.success('User deleted successfully', { id }));
    }

    const agent = await prisma.agent.findUnique({ where: { id } });
    if (agent && !agent.deleted_at) {
      await prisma.agent.update({
        where: { id },
        data: { deleted_at: new Date(), status: 'INACTIVE' },
      });
      return res.status(200).json(ResponseHandler.success('User deleted successfully', { id }));
    }

    const client = await prisma.client.findUnique({ where: { id } });
    if (client && !client.deleted_at) {
      await prisma.client.update({
        where: { id },
        data: { deleted_at: new Date(), status: 'INACTIVE' },
      });
      return res.status(200).json(ResponseHandler.success('User deleted successfully', { id }));
    }

    return res.status(404).json(ResponseHandler.notFound('User not found'));
  })
);

/**
 * @swagger
 * /api/admin/users/bulk_activate_deactivate:
 *   post:
 *     summary: Bulk activate or deactivate users
 *     tags: [Admin - Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_ids, is_active]
 *             properties:
 *               user_ids: { type: array, items: { type: string } }
 *               is_active: { type: boolean }
 *     responses:
 *       200: { description: Users updated successfully }
 *       400: { description: Validation failed }
 *       401: { description: Unauthorized }
 */
router.post(
  '/users/bulk_activate_deactivate',
  asyncHandler(async (req: any, res: Response) => {
    const ids = Array.isArray(req.body.user_ids) ? req.body.user_ids.map(String) : [];
    const isActive = Boolean(req.body.is_active);

    if (ids.length === 0) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'user_ids', message: 'At least one user id is required' }]));
    }

    await Promise.all([
      prisma.admin.updateMany({
        where: { id: { in: ids } },
        data: { status: isActive ? 'ACTIVE' : 'INACTIVE' },
      }),
      prisma.agent.updateMany({
        where: { id: { in: ids } },
        data: { status: isActive ? 'ACTIVE' : 'INACTIVE' },
      }),
      prisma.client.updateMany({
        where: { id: { in: ids } },
        data: { status: isActive ? 'ACTIVE' : 'INACTIVE' },
      }),
    ]);

    // If deactivating, purge all sessions for those users immediately
    if (!isActive) {
      prisma.session.deleteMany({ where: { user_id: { in: ids } } }).catch(() => {});
    }

    return res.status(200).json(ResponseHandler.success('Users updated successfully', { ids, is_active: isActive }));
  })
);

// ── Company validation constants ──────────────────────────────────────────────
const COMPANY_NAME_MIN = 2;
const COMPANY_NAME_MAX = 100;
const COMPANY_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMPANY_PHONE_REGEX = /^\+?[1-9]\d{1,14}$|^[0-9\-\s()+]{7,20}$/;
const COMPANY_VALID_STATUSES = ['ACTIVE', 'INACTIVE'];
const COMPANY_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const validateCompanyBody = (
  body: any,
  requireName = true,
): Array<{ field: string; message: string }> => {
  const errors: Array<{ field: string; message: string }> = [];

  const rawName = typeof body.name === 'string' ? body.name.trim() : null;
  if (requireName) {
    if (!rawName) errors.push({ field: 'name', message: 'Company name is required.' });
    else if (rawName.length < COMPANY_NAME_MIN) errors.push({ field: 'name', message: `Company name must be at least ${COMPANY_NAME_MIN} characters.` });
    else if (rawName.length > COMPANY_NAME_MAX) errors.push({ field: 'name', message: `Company name must not exceed ${COMPANY_NAME_MAX} characters.` });
  } else if (rawName !== null) {
    if (!rawName) errors.push({ field: 'name', message: 'Company name cannot be empty.' });
    else if (rawName.length < COMPANY_NAME_MIN) errors.push({ field: 'name', message: `Company name must be at least ${COMPANY_NAME_MIN} characters.` });
    else if (rawName.length > COMPANY_NAME_MAX) errors.push({ field: 'name', message: `Company name must not exceed ${COMPANY_NAME_MAX} characters.` });
  }

  const rawEmail = typeof body.email === 'string' ? body.email.trim() : null;
  if (requireName) {
    if (!rawEmail) errors.push({ field: 'email', message: 'Email address is required.' });
    else if (!COMPANY_EMAIL_REGEX.test(rawEmail)) errors.push({ field: 'email', message: 'Email address is invalid.' });
  } else if (rawEmail !== null) {
    if (!rawEmail) errors.push({ field: 'email', message: 'Email address cannot be empty.' });
    else if (!COMPANY_EMAIL_REGEX.test(rawEmail)) errors.push({ field: 'email', message: 'Email address is invalid.' });
  }

  const rawPhone = typeof body.phone_number === 'string' ? body.phone_number.trim() : null;
  if (rawPhone !== null && rawPhone !== '') {
    if (!COMPANY_PHONE_REGEX.test(rawPhone)) errors.push({ field: 'phone_number', message: 'Please enter a valid phone number.' });
  }

  const rawStatus = typeof body.status === 'string' ? body.status.trim().toUpperCase() : null;
  if (rawStatus !== null && rawStatus !== '' && !COMPANY_VALID_STATUSES.includes(rawStatus)) {
    errors.push({ field: 'status', message: `Status must be one of: ${COMPANY_VALID_STATUSES.join(', ')}.` });
  }

  return errors;
};

/**
 * @swagger
 * /api/admin/companies:
 *   get:
 *     summary: List companies (paginated)
 *     description: Returns paginated, searchable, filterable list of companies. Supports ?page, ?limit, ?search, ?status, ?sortBy, ?sortOrder.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number (1-based)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *         description: Results per page
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by company name, email, or phone
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [ACTIVE, INACTIVE] }
 *         description: Filter by status
 *       - in: query
 *         name: sortBy
 *         schema: { type: string, enum: [name, created_at, status], default: created_at }
 *       - in: query
 *         name: sortOrder
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Companies retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Company' }
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 42 }
 *                     totalPages: { type: integer, example: 3 }
 */
router.get(
  '/companies',
  asyncHandler(async (req: any, res: Response) => {
    const adminId = getCurrentAdminId(req) || 'unknown';
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'),  10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip  = (page - 1) * limit;
    const search      = normalizeText(req.query.search);
    const statusParam = typeof req.query.status === 'string' ? req.query.status.trim().toUpperCase() : '';
    const sortByRaw   = String(req.query.sortBy   || 'created_at');
    const sortOrder   = String(req.query.sortOrder || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const allowedSortFields: Record<string, boolean> = { name: true, created_at: true, status: true };
    const sortBy = allowedSortFields[sortByRaw] ? sortByRaw : 'created_at';

    const where: any = { deleted_at: null };
    if (search) {
      where.OR = [
        { name:         { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
        { phone_number: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (statusParam && COMPANY_VALID_STATUSES.includes(statusParam)) {
      where.status = statusParam;
    }

    const [total, companies] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({ where, orderBy: { [sortBy]: sortOrder }, skip, take: limit }),
    ]);

    const totalPages = Math.ceil(total / limit);
    logger.info('[Company] Admin list fetched', { page, limit, total, count: companies.length, search: search || null, status: statusParam || null, adminId, timestamp: new Date().toISOString() });

    return res.status(200).json(ResponseHandler.success('Companies retrieved successfully', {
      results: companies.map(serializeCompany),
      page,
      limit,
      total,
      totalPages,
      count: companies.length,
    }));
  })
);

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   get:
 *     summary: Get company by ID
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Company UUID
 *     responses:
 *       200:
 *         description: Company retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Company retrieved successfully" }
 *                 data: { $ref: '#/components/schemas/Company' }
 *       404:
 *         description: Company not found
 */
router.get(
  '/companies/:id',
  asyncHandler(async (req: any, res: Response) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company || company.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Company not found'));
    }
    return res.status(200).json(ResponseHandler.success('Company retrieved successfully', serializeCompany(company)));
  })
);

/**
 * @swagger
 * /api/admin/companies:
 *   post:
 *     summary: Create company
 *     description: Create a new company with optional logo upload (JPG/PNG/WebP, max 10 MB).
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 example: "Nepal LIC Pvt. Ltd."
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "info@nepallic.com"
 *               phone_number:
 *                 type: string
 *                 example: "+9771452299"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *                 default: ACTIVE
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: "Logo file (JPG/JPEG/PNG/WEBP, max 10 MB)"
 *     responses:
 *       201:
 *         description: Company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Company created successfully" }
 *                 data: { $ref: '#/components/schemas/Company' }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             example: { success: false, message: "Validation failed", errors: [{ field: "name", message: "Company name is required." }] }
 *       409:
 *         description: Duplicate company name or email
 *         content:
 *           application/json:
 *             example: { success: false, message: "A company with this name already exists." }
 */
router.post(
  '/companies',
  imageHandler.createUploadMiddleware('documents').single('image'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const adminId = getCurrentAdminId(req) || 'unknown';

    // File size validation (10 MB hard cap for company logos)
    if (req.file && req.file.size > COMPANY_IMAGE_MAX_BYTES) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'image', message: 'Company logo must be less than 10MB.' }]));
    }

    // Field validation
    const fieldErrors = validateCompanyBody(req.body, true);
    if (fieldErrors.length > 0) {
      return res.status(400).json(ResponseHandler.validationError(fieldErrors));
    }

    const companyName  = normalizeText(req.body.name);
    const companyEmail = normalizeText(req.body.email).toLowerCase();

    // Duplicate name check (case-insensitive)
    const dupName = await prisma.company.findFirst({
      where: { name: { equals: companyName, mode: 'insensitive' }, deleted_at: null },
    });
    if (dupName) {
      return res.status(409).json(ResponseHandler.error('A company with this name already exists.', 409));
    }

    // Duplicate email check
    const dupEmail = await prisma.company.findFirst({
      where: { email: { equals: companyEmail, mode: 'insensitive' }, deleted_at: null },
    });
    if (dupEmail) {
      return res.status(409).json(ResponseHandler.validationError([{ field: 'email', message: 'A company with this email already exists.' }]));
    }

    // Upload logo
    let imageUrl: string | undefined;
    if (req.file) {
      try {
        imageUrl = (await imageHandler.uploadImage(req.file.path, 'companies')).url;
      } catch (uploadErr: any) {
        logger.error('[Company] Logo upload failed', uploadErr, { adminId });
        return res.status(500).json(ResponseHandler.error('Failed to upload company logo. Please try again.', 500));
      }
    }

    const company = await prisma.company.create({
      data: {
        name:         companyName,
        email:        companyEmail,
        phone_number: normalizeText(req.body.phone_number) || null,
        image:        imageUrl || '',
        status:       normalizeStatus(req.body.status),
      },
    });

    logger.info('[Company] Admin created company', {
      action: 'CREATE', companyId: company.id, companyName: company.name,
      email: company.email, adminId, timestamp: new Date().toISOString(),
    });

    return res.status(201).json(ResponseHandler.success('Company created successfully', serializeCompany(company)));
  })
);

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   patch:
 *     summary: Update company
 *     description: Partially update a company. All fields are optional. Logo upload optional (max 10 MB).
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:    { type: string, minLength: 2, maxLength: 100 }
 *               email:   { type: string, format: email }
 *               phone_number: { type: string }
 *               status:  { type: string, enum: [ACTIVE, INACTIVE] }
 *               image:   { type: string, format: binary, description: "Logo (JPG/PNG/WebP ≤ 10 MB)" }
 *     responses:
 *       200:
 *         description: Company updated successfully
 *       400:
 *         description: Validation error
 *       404:
 *         description: Company not found
 *       409:
 *         description: Duplicate name or email
 */
router.patch(
  '/companies/:id',
  imageHandler.createUploadMiddleware('documents').single('image'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const adminId = getCurrentAdminId(req) || 'unknown';

    // File size validation
    if (req.file && req.file.size > COMPANY_IMAGE_MAX_BYTES) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'image', message: 'Company logo must be less than 10MB.' }]));
    }

    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Company not found'));
    }

    // Validate provided fields (requireName=false so only validates fields that are present)
    const fieldErrors = validateCompanyBody(req.body, false);
    if (fieldErrors.length > 0) {
      return res.status(400).json(ResponseHandler.validationError(fieldErrors));
    }

    // Duplicate name check (excluding self)
    if (req.body.name) {
      const nameCandidate = normalizeText(req.body.name);
      const dupName = await prisma.company.findFirst({
        where: { name: { equals: nameCandidate, mode: 'insensitive' }, deleted_at: null, NOT: { id: req.params.id } },
      });
      if (dupName) {
        return res.status(409).json(ResponseHandler.error('A company with this name already exists.', 409));
      }
    }

    // Duplicate email check (excluding self)
    if (req.body.email) {
      const emailCandidate = normalizeText(req.body.email).toLowerCase();
      const dupEmail = await prisma.company.findFirst({
        where: { email: { equals: emailCandidate, mode: 'insensitive' }, deleted_at: null, NOT: { id: req.params.id } },
      });
      if (dupEmail) {
        return res.status(409).json(ResponseHandler.validationError([{ field: 'email', message: 'A company with this email already exists.' }]));
      }
    }

    // Upload new logo if provided
    let imageUrl: string | undefined;
    if (req.file) {
      try {
        imageUrl = (await imageHandler.uploadImage(req.file.path, 'companies')).url;
      } catch (uploadErr: any) {
        logger.error('[Company] Logo upload failed', uploadErr, { companyId: req.params.id, adminId });
        return res.status(500).json(ResponseHandler.error('Failed to upload company logo. Please try again.', 500));
      }
    }

    const updatedFields: string[] = [];
    if (req.body.name         !== undefined) updatedFields.push('name');
    if (req.body.email        !== undefined) updatedFields.push('email');
    if (req.body.phone_number !== undefined) updatedFields.push('phone_number');
    if (req.body.status       !== undefined) updatedFields.push('status');
    if (req.file)                            updatedFields.push('image');

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        name:         req.body.name         !== undefined ? normalizeText(req.body.name)  : undefined,
        email:        req.body.email        !== undefined ? normalizeText(req.body.email).toLowerCase() : undefined,
        phone_number: req.body.phone_number !== undefined ? (normalizeText(req.body.phone_number) || null) : undefined,
        image:        imageUrl ?? (req.body.image !== undefined ? req.body.image : undefined),
        status:       req.body.status       !== undefined ? normalizeStatus(req.body.status) : undefined,
      },
    });

    logger.info('[Company] Admin updated company', {
      action: 'UPDATE', companyId: company.id, companyName: company.name,
      updatedFields, adminId, timestamp: new Date().toISOString(),
    });

    return res.status(200).json(ResponseHandler.success('Company updated successfully', serializeCompany(company)));
  })
);

/**
 * @swagger
 * /api/admin/companies/{id}:
 *   delete:
 *     summary: Soft-delete company
 *     description: Marks the company as deleted (sets deleted_at) and changes status to INACTIVE.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Company deleted successfully
 *         content:
 *           application/json:
 *             example: { success: true, message: "Company deleted successfully", data: { id: "uuid" } }
 *       404:
 *         description: Company not found
 */
router.delete(
  '/companies/:id',
  asyncHandler(async (req: any, res: Response) => {
    const adminId = getCurrentAdminId(req) || 'unknown';

    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company || company.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Company not found'));
    }

    await prisma.company.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), status: 'INACTIVE' },
    });

    logger.info('[Company] Admin deleted company (soft)', {
      action: 'DELETE', companyId: req.params.id, companyName: company.name,
      adminId, deletedAt: new Date().toISOString(), timestamp: new Date().toISOString(),
    });

    return res.status(200).json(ResponseHandler.success('Company deleted successfully', { id: req.params.id }));
  })
);

/**
 * @swagger
 * /api/admin/agents:
 *   get:
 *     summary: List agents
 *     tags: [Admin - Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: Search by name/email/phone/code }
 *     responses:
 *       200: { description: Agents retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/agents',
  asyncHandler(async (req: any, res: Response) => {
    const search = normalizeText(req.query.search);
    const where = {
      deleted_at: null,
      ...(search
        ? {
            OR: [
              { full_name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone_number: { contains: search, mode: 'insensitive' } },
              { agent_code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const payload = await listMaybePaginate(
      req,
      prisma.agent,
      { where, include: { _count: { select: { clients: true } } }, orderBy: { created_at: 'desc' } },
      serializeAgent,
    );
    return res.status(200).json(ResponseHandler.success('Agents retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/agents/{id}:
 *   get:
 *     summary: Get a single agent by ID
 *     tags: [Admin - Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Agent retrieved successfully }
 *       404: { description: Agent not found }
 *       401: { description: Unauthorized }
 */
router.get(
  '/agents/:id',
  asyncHandler(async (req: any, res: Response) => {
    const agent = await prisma.agent.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { clients: true } } },
    });
    if (!agent || agent.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Agent not found'));
    }
    return res.status(200).json(ResponseHandler.success('Agent retrieved successfully', serializeAgent(agent)));
  })
);

/**
 * @swagger
 * /api/admin/agents:
 *   post:
 *     summary: Create an agent
 *     tags: [Admin - Agents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [full_name, email, password, company]
 *             properties:
 *               full_name: { type: string }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               company: { type: string, description: Company ID }
 *               phone_number: { type: string }
 *               agent_code: { type: string }
 *               lic_agent_code: { type: string }
 *               branch_division: { type: string }
 *               qualification: { type: string }
 *               position_designation: { type: string }
 *               short_bio: { type: string }
 *               is_active: { type: boolean }
 *               image: { type: string, format: binary }
 *     responses:
 *       201: { description: Agent created successfully }
 *       400: { description: Validation failed }
 *       409: { description: Agent email already exists }
 *       401: { description: Unauthorized }
 */
router.post(
  '/agents',
  imageHandler.createUploadMiddleware('documents').single('image'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'agents')).url : undefined;
    const password = normalizeText(req.body.password);
    const fullName = normalizeText(req.body.full_name || `${req.body.first_name || ''} ${req.body.last_name || ''}`);
    const email = normalizeText(req.body.email).toLowerCase();
    const companyId = normalizeText(req.body.company ?? req.body.company_id);

    // Agent accounts are created BY ADMIN: name, email, password and the
    // company the agent is associated with are all required.
    const fieldErrors: Array<{ field: string; message: string }> = [];
    if (!fullName) fieldErrors.push({ field: 'full_name', message: 'Agent name is required' });
    if (!email) fieldErrors.push({ field: 'email', message: 'Email is required' });
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fieldErrors.push({ field: 'email', message: 'Enter a valid email address' });
    if (!password) fieldErrors.push({ field: 'password', message: 'Password is required' });
    else if (password.length < 6) fieldErrors.push({ field: 'password', message: 'Password must be at least 6 characters' });
    if (!companyId) fieldErrors.push({ field: 'company', message: 'Select the company this agent is associated with' });
    if (fieldErrors.length > 0) {
      return res.status(400).json(ResponseHandler.validationError(fieldErrors));
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.deleted_at) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'company', message: 'Selected company does not exist' }]));
    }

    const existingAgent = await prisma.agent.findFirst({ where: { email, deleted_at: null } });
    if (existingAgent) {
      return res.status(409).json(ResponseHandler.error('An agent with this email already exists', 409));
    }

    const agent = await prisma.agent.create({
      data: {
        agent_code:
          normalizeText(req.body.agent_code || req.body.username) ||
          `AG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        full_name: fullName,
        email,
        phone_number: normalizeText(req.body.phone_number),
        password_hash: PasswordUtils.hashPassword(password),
        lic_agent_code: normalizeText(req.body.lic_agent_code),
        branch_division: normalizeText(req.body.branch_division),
        qualification: normalizeText(req.body.qualification),
        position_designation: normalizeText(req.body.position_designation),
        short_bio: normalizeText(req.body.short_bio),
        profile_picture: imageUrl || normalizeText(req.body.profile_picture),
        status: normalizeStatus(req.body.is_active),
        company_id: companyId,
        created_at: new Date(),
        deleted_at: null,
      },
    });

    return res.status(201).json(ResponseHandler.success('Agent created successfully', serializeAgent({ ...agent, _count: { clients: 0 } })));
  })
);

/**
 * @swagger
 * /api/admin/agents/{id}:
 *   patch:
 *     summary: Update an agent
 *     tags: [Admin - Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string }
 *               email: { type: string, format: email }
 *               phone_number: { type: string }
 *               company: { type: string }
 *               agent_code: { type: string }
 *               lic_agent_code: { type: string }
 *               branch_division: { type: string }
 *               qualification: { type: string }
 *               position_designation: { type: string }
 *               short_bio: { type: string }
 *               password: { type: string }
 *               is_active: { type: boolean }
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: Agent updated successfully }
 *       404: { description: Agent not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/agents/:id',
  imageHandler.createUploadMiddleware('documents').single('image'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id }, include: { _count: { select: { clients: true } } } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Agent not found'));
    }

    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'agents')).url : undefined;

    const patchCompanyId = normalizeText(req.body.company ?? req.body.company_id);
    if (patchCompanyId) {
      const company = await prisma.company.findUnique({ where: { id: patchCompanyId } });
      if (!company || company.deleted_at) {
        return res.status(400).json(ResponseHandler.validationError([{ field: 'company', message: 'Selected company does not exist' }]));
      }
    }

    const updated = await prisma.agent.update({
      where: { id: req.params.id },
      data: {
        agent_code: req.body.agent_code ?? req.body.username ?? undefined,
        full_name:
          req.body.full_name || req.body.first_name || req.body.last_name
            ? normalizeText(req.body.full_name || `${req.body.first_name || existing.full_name} ${req.body.last_name || ''}`)
            : undefined,
        email: req.body.email ?? undefined,
        phone_number: req.body.phone_number ?? undefined,
        lic_agent_code: req.body.lic_agent_code ?? undefined,
        branch_division: req.body.branch_division ?? undefined,
        qualification: req.body.qualification ?? undefined,
        position_designation: req.body.position_designation ?? undefined,
        short_bio: req.body.short_bio ?? undefined,
        profile_picture: imageUrl ?? req.body.profile_picture ?? undefined,
        status: req.body.is_active === undefined ? undefined : normalizeStatus(req.body.is_active),
        company_id: (req.body.company ?? req.body.company_id) ? String(req.body.company ?? req.body.company_id) : undefined,
        ...(normalizeText(req.body.password) ? { password_hash: PasswordUtils.hashPassword(normalizeText(req.body.password)) } : {}),
      },
    });

    return res.status(200).json(ResponseHandler.success('Agent updated successfully', serializeAgent(updated)));
  })
);

/**
 * @swagger
 * /api/admin/agents/{id}:
 *   delete:
 *     summary: Soft-delete an agent
 *     tags: [Admin - Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Agent deleted successfully }
 *       404: { description: Agent not found }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/agents/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Agent not found'));
    }

    await prisma.agent.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), status: 'INACTIVE' },
    });

    // Invalidate all active sessions so the agent is logged out immediately
    prisma.session.deleteMany({ where: { user_id: req.params.id } }).catch(() => {});

    return res.status(200).json(ResponseHandler.success('Agent deleted successfully', { id: req.params.id }));
  })
);

/**
 * @swagger
 * /api/admin/policies:
 *   get:
 *     summary: List all policies (paginated)
 *     tags: [Admin - Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Page number (1-based)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 100 }
 *         description: Results per page
 *     responses:
 *       200:
 *         description: Policies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Policies retrieved successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     results: { type: array, items: { $ref: '#/components/schemas/Policy' } }
 *                     page: { type: integer, example: 1 }
 *                     limit: { type: integer, example: 20 }
 *                     total: { type: integer, example: 42 }
 *                     totalPages: { type: integer, example: 3 }
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/policies',
  asyncHandler(async (req: any, res: Response) => {
    const page  = Math.max(1, parseInt(String(req.query.page  || '1'),  10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
    const skip  = (page - 1) * limit;

    const [total, policies] = await Promise.all([
      prisma.policy.count({ where: { deleted_at: null } }),
      prisma.policy.findMany({
        where: { deleted_at: null },
        include: { company: true, client: true, agent: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    logger.info('[Policy] Admin list fetched', {
      action: 'LIST',
      page, limit, total, count: policies.length,
      adminId: getCurrentAdminId(req),
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(ResponseHandler.success('Policies retrieved successfully', {
      results: policies.map(serializePolicy),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      count: policies.length,
    }));
  })
);

/**
 * @swagger
 * /api/admin/policies/{id}:
 *   get:
 *     summary: Get a single policy by ID
 *     tags: [Admin - Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Policy UUID
 *     responses:
 *       200:
 *         description: Policy retrieved successfully
 *       404:
 *         description: Policy not found
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/policies/:id',
  asyncHandler(async (req: any, res: Response) => {
    const policy = await prisma.policy.findUnique({
      where: { id: req.params.id },
      include: { company: true, client: true, agent: true },
    });
    if (!policy || policy.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Policy not found'));
    }

    logger.info('[Policy] Admin fetched single policy', {
      action: 'GET',
      policyId: req.params.id,
      adminId: getCurrentAdminId(req),
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(ResponseHandler.success('Policy retrieved successfully', serializePolicy(policy)));
  })
);

/**
 * @swagger
 * /api/admin/policies:
 *   post:
 *     summary: Create a new policy
 *     tags: [Admin - Policies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, company]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Life Insurance Standard Policy"
 *               company:
 *                 type: string
 *                 description: Company UUID
 *               type:
 *                 type: string
 *                 enum: [GENERAL, LIFE, HEALTH, VEHICLE, PROPERTY, ENDOWMENT, TERM]
 *                 default: GENERAL
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, PENDING, LAPSED, EXPIRED]
 *                 default: PENDING
 *               coverage_amount:
 *                 type: number
 *                 minimum: 0
 *               premium_amount:
 *                 type: number
 *                 minimum: 0
 *     responses:
 *       201:
 *         description: Policy created successfully
 *       400:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: false }
 *                 message: { type: string, example: "Validation failed" }
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field: { type: string, example: "name" }
 *                       message: { type: string, example: "Policy name is required" }
 *       409:
 *         description: Policy name already exists
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/policies',
  asyncHandler(async (req: any, res: Response) => {
    // ── 1. Field-level validation ─────────────────────────────────────────────
    const validationErrors = validatePolicyBody(req.body, true);

    const companyRaw = req.body.company;
    if (!companyRaw || !String(companyRaw).trim()) {
      validationErrors.push({ field: 'company', message: 'Company is required' });
    }

    if (validationErrors.length > 0) {
      return res.status(400).json(ResponseHandler.validationError(validationErrors));
    }

    // ── 2. Company existence check ────────────────────────────────────────────
    const companyId = String(companyRaw).trim();
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.deleted_at) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'company', message: 'Valid company is required' }]));
    }

    // ── 3. Duplicate name check ───────────────────────────────────────────────
    const policyName = String(req.body.name).trim();
    const duplicate = await (prisma.policy as any).findFirst({
      where: { name: { equals: policyName, mode: 'insensitive' }, deleted_at: null },
    });
    if (duplicate) {
      return res.status(409).json(ResponseHandler.validationError([
        { field: 'name', message: 'A policy with this name already exists' },
      ]));
    }

    // ── 4. Resolve agent / client ─────────────────────────────────────────────
    const agentId  = (req.body.agent  ? String(req.body.agent)  : await findPrimaryAgentId(companyId))  || (await findPrimaryAgentId());
    const clientId = (req.body.client ? String(req.body.client) : await findPrimaryClientId(agentId))   || (await findPrimaryClientId());

    if (!agentId || !clientId) {
      return res.status(400).json(ResponseHandler.validationError([
        { field: 'client', message: 'A client and agent are required to create a policy' },
      ]));
    }

    const policyType   = req.body.type   ? String(req.body.type).trim().toUpperCase()   : 'GENERAL';
    const policyStatus = req.body.status ? (String(req.body.status).trim().toUpperCase() as PolicyStatus) : 'PENDING';

    const policy = await prisma.policy.create({
      data: {
        policy_number:   normalizeText(req.body.policy_number || `POL-${Date.now()}`),
        name:            policyName,
        type:            policyType,
        coverage_amount: Number(req.body.coverage_amount || 0),
        premium_amount:  Number(req.body.premium_amount  || 0),
        status:          policyStatus,
        start_date:      req.body.start_date ? new Date(req.body.start_date) : new Date(),
        end_date:        req.body.end_date   ? new Date(req.body.end_date)   : new Date(),
        client_id:       clientId,
        agent_id:        agentId,
        company_id:      companyId,
      },
      include: { company: true, client: true, agent: true },
    });

    const adminId = getCurrentAdminId(req);
    logger.info('[Policy] Admin created policy', {
      action: 'CREATE',
      policyId: policy.id,
      policyName: policy.name,
      policyType,
      policyStatus,
      companyId,
      agentId,
      clientId,
      adminId,
      timestamp: new Date().toISOString(),
    });

    return res.status(201).json(ResponseHandler.success('Policy created successfully', serializePolicy(policy)));
  })
);

/**
 * @swagger
 * /api/admin/policies/{id}:
 *   patch:
 *     summary: Update an existing policy
 *     tags: [Admin - Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               type:
 *                 type: string
 *                 enum: [GENERAL, LIFE, HEALTH, VEHICLE, PROPERTY, ENDOWMENT, TERM]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, PENDING, LAPSED, EXPIRED]
 *               coverage_amount:
 *                 type: number
 *                 minimum: 0
 *               premium_amount:
 *                 type: number
 *                 minimum: 0
 *               company:
 *                 type: string
 *                 description: Company UUID
 *     responses:
 *       200:
 *         description: Policy updated successfully
 *       400:
 *         description: Validation failed
 *       404:
 *         description: Policy not found
 *       409:
 *         description: Policy name already exists
 *       401:
 *         description: Unauthorized
 */
router.patch(
  '/policies/:id',
  asyncHandler(async (req: any, res: Response) => {
    // ── 1. Field-level validation (patch — name not required) ─────────────────
    const validationErrors = validatePolicyBody(req.body, false);
    if (validationErrors.length > 0) {
      return res.status(400).json(ResponseHandler.validationError(validationErrors));
    }

    // ── 2. Existence check ────────────────────────────────────────────────────
    const existing = await prisma.policy.findUnique({
      where: { id: req.params.id },
      include: { company: true, client: true, agent: true },
    });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Policy not found'));
    }

    // ── 3. Duplicate name check (exclude self) ────────────────────────────────
    if (req.body.name) {
      const patchName = String(req.body.name).trim();
      const duplicate = await (prisma.policy as any).findFirst({
        where: {
          name: { equals: patchName, mode: 'insensitive' },
          deleted_at: null,
          NOT: { id: req.params.id },
        },
      });
      if (duplicate) {
        return res.status(409).json(ResponseHandler.validationError([
          { field: 'name', message: 'A policy with this name already exists' },
        ]));
      }
    }

    const companyId = req.body.company ? String(req.body.company).trim() : undefined;

    const updated = await prisma.policy.update({
      where: { id: req.params.id },
      data: {
        ...(req.body.name            ? { name: String(req.body.name).trim() }                             : {}),
        ...(req.body.type            ? { type: String(req.body.type).trim().toUpperCase() }               : {}),
        ...(req.body.coverage_amount !== undefined ? { coverage_amount: Number(req.body.coverage_amount) } : {}),
        ...(req.body.premium_amount  !== undefined ? { premium_amount:  Number(req.body.premium_amount)  } : {}),
        ...(req.body.status          ? { status: String(req.body.status).trim().toUpperCase() as PolicyStatus } : {}),
        ...(req.body.start_date      ? { start_date: new Date(req.body.start_date) }                      : {}),
        ...(req.body.end_date        ? { end_date:   new Date(req.body.end_date)   }                      : {}),
        ...(companyId                ? { company_id: companyId }                                          : {}),
      },
      include: { company: true, client: true, agent: true },
    });

    const adminId = getCurrentAdminId(req);
    logger.info('[Policy] Admin updated policy', {
      action: 'UPDATE',
      policyId: req.params.id,
      updatedFields: Object.keys(req.body),
      adminId,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(ResponseHandler.success('Policy updated successfully', serializePolicy(updated)));
  })
);

/**
 * @swagger
 * /api/admin/policies/{id}:
 *   delete:
 *     summary: Soft-delete a policy
 *     tags: [Admin - Policies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: Policy UUID
 *     responses:
 *       200:
 *         description: Policy deleted successfully
 *       404:
 *         description: Policy not found
 *       401:
 *         description: Unauthorized
 */
router.delete(
  '/policies/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.policy.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Policy not found'));
    }

    await prisma.policy.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });

    const adminId = getCurrentAdminId(req);
    logger.info('[Policy] Admin deleted policy (soft)', {
      action: 'DELETE',
      policyId: req.params.id,
      policyName: existing.name,
      adminId,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json(ResponseHandler.success('Policy deleted successfully', { id: req.params.id }));
  })
);

/**
 * @swagger
 * /api/admin/payments:
 *   get:
 *     summary: List payments/transactions
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer }, description: 'Opt-in pagination; omit for full list' }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: Payments retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/payments',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(
      req,
      prisma.transaction,
      {
        where: { deleted_at: null },
        include: { policy: { include: { client: true } } },
        orderBy: { created_at: 'desc' },
      },
      serializeTransaction,
    );
    return res.status(200).json(ResponseHandler.success('Payments retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/payments/{id}:
 *   get:
 *     summary: Get a single payment by ID
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Payment retrieved successfully }
 *       404: { description: Payment not found }
 *       401: { description: Unauthorized }
 */
router.get(
  '/payments/:id',
  asyncHandler(async (req: any, res: Response) => {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: {
        policy: {
          include: { client: true },
        },
      },
    });
    if (!transaction || transaction.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Payment not found'));
    }
    return res.status(200).json(ResponseHandler.success('Payment retrieved successfully', serializeTransaction(transaction)));
  })
);

/**
 * @swagger
 * /api/admin/payments:
 *   post:
 *     summary: Create a payment/transaction
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [client]
 *             properties:
 *               client: { type: string, description: Client ID }
 *               amount: { type: number }
 *               type: { type: string, enum: [PREMIUM_PAYMENT, CLAIM_PAYOUT, COMMISSION], default: PREMIUM_PAYMENT }
 *               payment_method: { type: string }
 *               status: { type: string, enum: [PENDING, SUCCESSFUL, FAILED], default: PENDING }
 *               transaction_id: { type: string }
 *     responses:
 *       201: { description: Payment created successfully }
 *       400: { description: Validation failed }
 *       401: { description: Unauthorized }
 */
router.post(
  '/payments',
  asyncHandler(async (req: any, res: Response) => {
    const clientId = String(req.body.client || '');
    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client || client.deleted_at) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'client', message: 'Valid client is required' }]));
    }

    const policy =
      (await prisma.policy.findFirst({
        where: { client_id: clientId, deleted_at: null },
        orderBy: { created_at: 'desc' },
      })) ||
      (await prisma.policy.findFirst({ where: { deleted_at: null }, orderBy: { created_at: 'desc' } }));

    if (!policy) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'policy', message: 'A policy is required before creating payments' }]));
    }

    const transaction = await prisma.transaction.create({
      data: {
        policy_id: policy.id,
        amount: Number(req.body.amount || 0),
        type: (String(req.body.type || 'PREMIUM_PAYMENT').toUpperCase() as TransactionType) || 'PREMIUM_PAYMENT',
        payment_method: normalizeText(req.body.payment_method || 'MANUAL'),
        status: (String(req.body.status || 'PENDING').toUpperCase() as TransactionStatus) || 'PENDING',
        reference_number: normalizeText(req.body.transaction_id || `TXN-${Date.now()}`),
      },
      include: { policy: { include: { client: true } } },
    });

    return res.status(201).json(ResponseHandler.success('Payment created successfully', serializeTransaction(transaction)));
  })
);

/**
 * @swagger
 * /api/admin/payments/{id}:
 *   patch:
 *     summary: Update a payment/transaction
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount: { type: number }
 *               type: { type: string }
 *               payment_method: { type: string }
 *               status: { type: string }
 *               transaction_id: { type: string }
 *     responses:
 *       200: { description: Payment updated successfully }
 *       404: { description: Payment not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/payments/:id',
  asyncHandler(async (req: any, res: Response) => {
    const transaction = await prisma.transaction.findUnique({
      where: { id: req.params.id },
      include: { policy: { include: { client: true } } },
    });
    if (!transaction || transaction.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Payment not found'));
    }

    const updated = await prisma.transaction.update({
      where: { id: req.params.id },
      data: {
        amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined,
        type: req.body.type ? (String(req.body.type).toUpperCase() as TransactionType) : undefined,
        payment_method: req.body.payment_method ?? undefined,
        status: req.body.status ? (String(req.body.status).toUpperCase() as TransactionStatus) : undefined,
        reference_number: req.body.transaction_id ?? undefined,
      },
      include: { policy: { include: { client: true } } },
    });

    return res.status(200).json(ResponseHandler.success('Payment updated successfully', serializeTransaction(updated)));
  })
);

/**
 * @swagger
 * /api/admin/payments/{id}:
 *   delete:
 *     summary: Soft-delete a payment/transaction
 *     tags: [Admin - Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Payment deleted successfully }
 *       404: { description: Payment not found }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/payments/:id',
  asyncHandler(async (req: any, res: Response) => {
    const transaction = await prisma.transaction.findUnique({ where: { id: req.params.id } });
    if (!transaction || transaction.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Payment not found'));
    }

    await prisma.transaction.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });

    return res.status(200).json(ResponseHandler.success('Payment deleted successfully', { id: req.params.id }));
  })
);

/**
 * @swagger
 * /api/admin/notifications:
 *   get:
 *     summary: List notifications
 *     tags: [Admin - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer }, description: 'Opt-in pagination; omit for full list' }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: Notifications retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/notifications',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(req, prisma.notification, { orderBy: { created_at: 'desc' } }, serializeNotification);
    return res.status(200).json(ResponseHandler.success('Notifications retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/notifications/{id}:
 *   get:
 *     summary: Get a single notification by ID
 *     tags: [Admin - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Notification retrieved successfully }
 *       404: { description: Notification not found }
 *       401: { description: Unauthorized }
 */
router.get(
  '/notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id },
    });
    if (!notification) {
      return res.status(404).json(ResponseHandler.notFound('Notification not found'));
    }
    return res.status(200).json(ResponseHandler.success('Notification retrieved successfully', await serializeNotification(notification)));
  })
);

/**
 * @swagger
 * /api/admin/notifications:
 *   post:
 *     summary: Create a notification
 *     tags: [Admin - Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipient_type: { type: string, enum: [ADMIN, AGENT, CLIENT], default: ADMIN }
 *               recipient: { type: string, description: Recipient ID }
 *               title: { type: string }
 *               message: { type: string }
 *               content: { type: string }
 *               is_read: { type: boolean }
 *     responses:
 *       201: { description: Notification created successfully }
 *       401: { description: Unauthorized }
 */
router.post(
  '/notifications',
  asyncHandler(async (req: any, res: Response) => {
    const recipientType = String(req.body.recipient_type || 'ADMIN').toUpperCase() as UserType;
    const recipientId = normalizeText(req.body.recipient || req.body.recipient_id || getCurrentAdminId(req));

    const notification = await prisma.notification.create({
      data: {
        recipient_id: recipientId,
        recipient_type: recipientType,
        title: normalizeText(req.body.title),
        message: normalizeText(req.body.message || req.body.content),
        is_read: Boolean(req.body.is_read),
      },
    });

    return res.status(201).json(ResponseHandler.success('Notification created successfully', await serializeNotification(notification)));
  })
);

/**
 * @swagger
 * /api/admin/notifications/{id}:
 *   patch:
 *     summary: Update a notification
 *     tags: [Admin - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               recipient_type: { type: string }
 *               recipient: { type: string }
 *               title: { type: string }
 *               message: { type: string }
 *               is_read: { type: boolean }
 *     responses:
 *       200: { description: Notification updated successfully }
 *       404: { description: Notification not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification) {
      return res.status(404).json(ResponseHandler.notFound('Notification not found'));
    }

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        recipient_id: req.body.recipient || req.body.recipient_id ? String(req.body.recipient || req.body.recipient_id) : undefined,
        recipient_type: req.body.recipient_type ? (String(req.body.recipient_type).toUpperCase() as UserType) : undefined,
        title: req.body.title ?? undefined,
        message: req.body.message ?? req.body.content ?? undefined,
        is_read: req.body.is_read === undefined ? undefined : Boolean(req.body.is_read),
      },
    });

    return res.status(200).json(ResponseHandler.success('Notification updated successfully', await serializeNotification(updated)));
  })
);

/**
 * @swagger
 * /api/admin/notifications/{id}:
 *   delete:
 *     summary: Delete a notification
 *     tags: [Admin - Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Notification deleted successfully }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('Notification deleted successfully', { id: req.params.id }));
  })
);

// ---------------------------------------------------------------------------
// Reports — generic CRUD used by the admin frontend (reportApi)
// ---------------------------------------------------------------------------
/**
 * @swagger
 * /api/admin/reports:
 *   get:
 *     summary: List reports
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer }, description: 'Opt-in pagination; omit for full list' }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: Reports retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/reports',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(req, prisma.report, { orderBy: { created_at: 'desc' } });
    return res.status(200).json(ResponseHandler.success('Reports retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/reports/{id}:
 *   get:
 *     summary: Get a single report by ID
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Report retrieved successfully }
 *       404: { description: Report not found }
 *       401: { description: Unauthorized }
 */
router.get(
  '/reports/:id',
  asyncHandler(async (req: any, res: Response) => {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) {
      return res.status(404).json(ResponseHandler.notFound('Report not found'));
    }
    return res.status(200).json(ResponseHandler.success('Report retrieved successfully', report));
  })
);

/**
 * @swagger
 * /api/admin/reports:
 *   post:
 *     summary: Create a report
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               name: { type: string }
 *               type: { type: string }
 *     responses:
 *       201: { description: Report created successfully }
 *       400: { description: Validation failed }
 *       401: { description: Unauthorized }
 */
router.post(
  '/reports',
  asyncHandler(async (req: any, res: Response) => {
    const body = sanitizeWriteData(req.body);
    if (!body.title && !body.name && !body.type) {
      return res.status(400).json(
        ResponseHandler.validationError([{ field: 'title', message: 'Report requires at least a title, name or type' }])
      );
    }
    const report = await prisma.report.create({
      data: { ...body, created_at: new Date(), updated_at: new Date() },
    });
    return res.status(201).json(ResponseHandler.success('Report created successfully', report));
  })
);

/**
 * @swagger
 * /api/admin/reports/{id}:
 *   patch:
 *     summary: Update a report
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               name: { type: string }
 *               type: { type: string }
 *     responses:
 *       200: { description: Report updated successfully }
 *       404: { description: Report not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/reports/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json(ResponseHandler.notFound('Report not found'));
    }
    const body = sanitizeWriteData(req.body);
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { ...body, updated_at: new Date() },
    });
    return res.status(200).json(ResponseHandler.success('Report updated successfully', report));
  })
);

/**
 * @swagger
 * /api/admin/reports/{id}:
 *   delete:
 *     summary: Delete a report
 *     tags: [Admin - Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Report deleted successfully }
 *       404: { description: Report not found }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/reports/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json(ResponseHandler.notFound('Report not found'));
    }
    await prisma.report.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('Report deleted successfully', { id: req.params.id }));
  })
);

// ── Bulk Notifications

router.get(
  '/bulk-notifications',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(
      req,
      prisma.bulkNotification,
      {
        where: { deleted_at: null },
        include: { target_agent: true, creator: true },
        orderBy: { created_at: 'desc' },
      },
      serializeBulkNotification,
    );
    return res.status(200).json(ResponseHandler.success('Notifications retrieved successfully', payload));
  })
);

router.get(
  '/bulk-notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    const notification = await prisma.bulkNotification.findUnique({
      where: { id: req.params.id },
      include: { target_agent: true, creator: true },
    });
    if (!notification || notification.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Notification not found'));
    }
    return res.status(200).json(ResponseHandler.success('Notification retrieved successfully', serializeBulkNotification(notification)));
  })
);

router.post(
  '/bulk-notifications',
  asyncHandler(async (req: any, res: Response) => {
    const targetType = String(req.body.target_type || 'ALL').toUpperCase() as NotificationTargetType;
    const creatorId = getCurrentAdminId(req);

    const notification = await prisma.bulkNotification.create({
      data: {
        title: normalizeText(req.body.title),
        content: buildContentMessage('achievement', {
          description: normalizeText(req.body.content),
          icon: req.body.icon || null,
          required_xp: Number(req.body.required_xp || 0),
        }),
        target_type: targetType,
        target_agent_id: req.body.target_agent_id ? String(req.body.target_agent_id) : null,
        created_by: creatorId,
      },
      include: { target_agent: true, creator: true },
    });
    return res.status(201).json(ResponseHandler.success('Notification sent successfully', serializeBulkNotification(notification)));
  })
);

/**
 * @swagger
 * /api/admin/bulk-notifications/{id}:
 *   patch:
 *     summary: Update a bulk notification
 *     tags: [Bulk Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               content: { type: string }
 *               icon: { type: string }
 *               required_xp: { type: integer }
 *               target_type: { type: string }
 *               target_agent_id: { type: string }
 *     responses:
 *       200: { description: Notification updated successfully }
 *       404: { description: Notification not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/bulk-notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    const notification = await prisma.bulkNotification.findUnique({ where: { id: req.params.id } });
    if (!notification || notification.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Notification not found'));
    }
    const updated = await prisma.bulkNotification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        content: req.body.content !== undefined
          ? buildContentMessage('achievement', {
              description: normalizeText(req.body.content),
              icon: req.body.icon || null,
              required_xp: req.body.required_xp !== undefined ? Number(req.body.required_xp) : 0,
            })
          : undefined,
        target_type: req.body.target_type ? String(req.body.target_type).toUpperCase() : undefined,
        target_agent_id: req.body.target_agent_id ? String(req.body.target_agent_id) : undefined,
      },
      include: { target_agent: true, creator: true },
    });
    return res.status(200).json(ResponseHandler.success('Notification updated successfully', serializeBulkNotification(updated)));
  })
);

router.delete(
  '/bulk-notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.bulkNotification.update({ where: { id: req.params.id }, data: { deleted_at: new Date() } });
    return res.status(200).json(ResponseHandler.success('Notification deleted successfully', { id: req.params.id }));
  })
);

// ── News

/**
 * @swagger
 * /api/admin/news:
 *   get:
 *     summary: List news items
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer }, description: 'Opt-in pagination; omit for full list' }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: News retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/news',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(
      req,
      prisma.notification,
      { where: { message: { contains: '"kind":"news"' } }, orderBy: { created_at: 'desc' } },
      (item: any) => {
        const p = parseJson<any>(item.message, {});
        return { id: item.id, title: item.title, description: p.description || '', image: p.image || null, created_at: toIso(item.created_at) };
      },
    );
    return res.status(200).json(ResponseHandler.success('News retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/news:
 *   post:
 *     summary: Create a news item
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               image: { type: string, format: binary }
 *     responses:
 *       201: { description: News created successfully }
 *       401: { description: Unauthorized }
 */
router.post(
  '/news',
  imageHandler.createUploadMiddleware('documents').single('image'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'news')).url : req.body.image || null;
    const news = await prisma.notification.create({
      data: {
        recipient_id: getCurrentAdminId(req) || String(req.body.recipient_id || ''),
        recipient_type: 'ADMIN',
        title: normalizeText(req.body.title),
        message: buildContentMessage('news', { description: normalizeText(req.body.description), image: imageUrl }),
        is_read: false,
      },
    });
    const payload = parseJson<any>(news.message, {});
    return res.status(201).json(ResponseHandler.success('News created successfully', {
      id: news.id, title: news.title, description: payload.description || '', image: payload.image || null, created_at: toIso(news.created_at),
    }));
  })
);

/**
 * @swagger
 * /api/admin/news/{id}:
 *   patch:
 *     summary: Update a news item
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               image: { type: string, format: binary }
 *     responses:
 *       200: { description: News updated successfully }
 *       404: { description: News not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/news/:id',
  imageHandler.createUploadMiddleware('documents').single('image'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json(ResponseHandler.notFound('News not found'));
    const previous = parseJson<any>(existing.message, {});
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'news')).url : req.body.image || previous.image || null;
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        message: buildContentMessage('news', { description: req.body.description ?? previous.description ?? '', image: imageUrl }),
      },
    });
    const payload = parseJson<any>(updated.message, {});
    return res.status(200).json(ResponseHandler.success('News updated successfully', {
      id: updated.id, title: updated.title, description: payload.description || '', image: payload.image || null, created_at: toIso(updated.created_at),
    }));
  })
);

/**
 * @swagger
 * /api/admin/news/{id}:
 *   delete:
 *     summary: Delete a news item
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: News deleted successfully }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/news/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('News deleted successfully', { id: req.params.id }));
  })
);

// ── Resources

/**
 * @swagger
 * /api/admin/resources:
 *   get:
 *     summary: List resources
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer }, description: 'Opt-in pagination; omit for full list' }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 100 } }
 *     responses:
 *       200: { description: Resources retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/resources',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(
      req,
      prisma.notification,
      { where: { message: { contains: '"kind":"resource"' } }, orderBy: { created_at: 'desc' } },
      (item: any) => {
        const p = parseJson<any>(item.message, {});
        return { id: item.id, title: item.title, file: p.file || null, link: p.link || null, created_at: toIso(item.created_at) };
      },
    );
    return res.status(200).json(ResponseHandler.success('Resources retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/resources:
 *   post:
 *     summary: Create a resource
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               file: { type: string, format: binary }
 *               link: { type: string }
 *     responses:
 *       201: { description: Resource created successfully }
 *       401: { description: Unauthorized }
 */
router.post(
  '/resources',
  imageHandler.createUploadMiddleware('documents').single('file'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const fileUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'resources')).url : req.body.file || null;
    const resource = await prisma.notification.create({
      data: {
        recipient_id: getCurrentAdminId(req) || String(req.body.recipient_id || ''),
        recipient_type: 'ADMIN',
        title: normalizeText(req.body.title),
        message: buildContentMessage('resource', { file: fileUrl, link: req.body.link || null }),
        is_read: false,
      },
    });
    const payload = parseJson<any>(resource.message, {});
    return res.status(201).json(ResponseHandler.success('Resource created successfully', {
      id: resource.id, title: resource.title, file: payload.file || null, link: payload.link || null, created_at: toIso(resource.created_at),
    }));
  })
);

/**
 * @swagger
 * /api/admin/resources/{id}:
 *   patch:
 *     summary: Update a resource
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               file: { type: string, format: binary }
 *               link: { type: string }
 *     responses:
 *       200: { description: Resource updated successfully }
 *       404: { description: Resource not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/resources/:id',
  imageHandler.createUploadMiddleware('documents').single('file'),
  boundaryGuard,
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json(ResponseHandler.notFound('Resource not found'));
    const previous = parseJson<any>(existing.message, {});
    const fileUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'resources')).url : req.body.file || previous.file || null;
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        message: buildContentMessage('resource', { file: fileUrl, link: req.body.link ?? previous.link ?? null }),
      },
    });
    const payload = parseJson<any>(updated.message, {});
    return res.status(200).json(ResponseHandler.success('Resource updated successfully', {
      id: updated.id, title: updated.title, file: payload.file || null, link: payload.link || null, created_at: toIso(updated.created_at),
    }));
  })
);

/**
 * @swagger
 * /api/admin/resources/{id}:
 *   delete:
 *     summary: Delete a resource
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Resource deleted successfully }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/resources/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('Resource deleted successfully', { id: req.params.id }));
  })
);

// ── Achievements

/**
 * @swagger
 * /api/admin/achievements:
 *   get:
 *     summary: List achievements
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Achievements retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/achievements',
  asyncHandler(async (req: any, res: Response) => {
    const payload = await listMaybePaginate(
      req,
      prisma.bulkNotification,
      { where: { deleted_at: null }, include: { target_agent: true, creator: true }, orderBy: { created_at: 'desc' } },
      (item: any) => {
        const p = parseJson<any>(item.content, {});
        return { id: item.id, title: item.title, description: p.description || '', icon: p.icon || null, required_xp: p.required_xp || 0, created_at: toIso(item.created_at) };
      },
    );
    return res.status(200).json(ResponseHandler.success('Achievements retrieved successfully', payload));
  })
);

/**
 * @swagger
 * /api/admin/achievements:
 *   post:
 *     summary: Create an achievement
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               icon: { type: string }
 *               required_xp: { type: integer }
 *     responses:
 *       201: { description: Achievement created successfully }
 *       401: { description: Unauthorized }
 */
router.post(
  '/achievements',
  asyncHandler(async (req: any, res: Response) => {
    const achievement = await prisma.bulkNotification.create({
      data: {
        title: normalizeText(req.body.title),
        content: buildContentMessage('achievement', {
          description: normalizeText(req.body.description),
          icon: req.body.icon || null,
          required_xp: Number(req.body.required_xp || 0),
        }),
        target_type: 'ALL',
        created_by: getCurrentAdminId(req),
      },
      include: { target_agent: true, creator: true },
    });
    const payload = parseJson<any>(achievement.content, {});
    return res.status(201).json(ResponseHandler.success('Achievement created successfully', {
      id: achievement.id, title: achievement.title, description: payload.description || '', icon: payload.icon || null, required_xp: payload.required_xp || 0, created_at: toIso(achievement.created_at),
    }));
  })
);

/**
 * @swagger
 * /api/admin/achievements/{id}:
 *   patch:
 *     summary: Update an achievement
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               icon: { type: string }
 *               required_xp: { type: integer }
 *     responses:
 *       200: { description: Achievement updated successfully }
 *       404: { description: Achievement not found }
 *       401: { description: Unauthorized }
 */
router.patch(
  '/achievements/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.bulkNotification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) return res.status(404).json(ResponseHandler.notFound('Achievement not found'));
    const updated = await prisma.bulkNotification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        content: req.body.description !== undefined || req.body.icon !== undefined || req.body.required_xp !== undefined
          ? buildContentMessage('achievement', {
              description: normalizeText(req.body.description ?? parseJson<any>(existing.content, {}).description),
              icon: req.body.icon ?? parseJson<any>(existing.content, {}).icon ?? null,
              required_xp: req.body.required_xp !== undefined ? Number(req.body.required_xp) : parseJson<any>(existing.content, {}).required_xp || 0,
            })
          : undefined,
      },
      include: { target_agent: true, creator: true },
    });
    const payload = parseJson<any>(updated.content, {});
    return res.status(200).json(ResponseHandler.success('Achievement updated successfully', {
      id: updated.id, title: updated.title, description: payload.description || '', icon: payload.icon || null, required_xp: payload.required_xp || 0, created_at: toIso(updated.created_at),
    }));
  })
);

/**
 * @swagger
 * /api/admin/achievements/{id}:
 *   delete:
 *     summary: Delete an achievement
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Achievement deleted successfully }
 *       401: { description: Unauthorized }
 */
router.delete(
  '/achievements/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.bulkNotification.update({ where: { id: req.params.id }, data: { deleted_at: new Date() } });
    return res.status(200).json(ResponseHandler.success('Achievement deleted successfully', { id: req.params.id }));
  })
);

// ── User Achievements

/**
 * @swagger
 * /api/admin/user-achievements:
 *   get:
 *     summary: List user achievement unlocks
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: User achievements retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/user-achievements',
  asyncHandler(async (_req: any, res: Response) => {
    const reads = await prisma.notificationRead.findMany({
      include: { notification: true, agent: true },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json(ResponseHandler.success('User achievements retrieved successfully',
      maybePaginate(req, reads.filter((r: any) => parseJson<any>(r.notification?.content, {}).kind !== 'news').map(serializeUserAchievement))
    ));
  })
);

/**
 * @swagger
 * /api/admin/user-achievements/unlock:
 *   post:
 *     summary: Unlock an achievement for a user
 *     tags: [Admin - Content]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, achievement_id]
 *             properties:
 *               user_id: { type: string }
 *               achievement_id: { type: string }
 *     responses:
 *       201: { description: Achievement unlocked }
 *       404: { description: Achievement not found }
 *       401: { description: Unauthorized }
 */
router.post(
  '/user-achievements/unlock',
  asyncHandler(async (req: any, res: Response) => {
    const userId        = String(req.body.user_id        || '');
    const achievementId = String(req.body.achievement_id || '');
    const achievement = await prisma.bulkNotification.findUnique({ where: { id: achievementId } });
    if (!achievement || achievement.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Achievement not found'));
    }
    const notificationRead = await prisma.notificationRead.upsert({
      where: { notification_id_agent_id: { notification_id: achievementId, agent_id: userId } },
      create: { notification_id: achievementId, agent_id: userId, is_read: true, read_at: new Date() },
      update: { is_read: true, read_at: new Date() },
      include: { notification: true, agent: true },
    });
    return res.status(201).json(ResponseHandler.success('Notification read', notificationRead));
  })
);

export default router;
