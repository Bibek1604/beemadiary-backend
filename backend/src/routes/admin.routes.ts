import { Router, Response } from 'express';
import prisma from '../config/database';
import { asyncHandler } from '../middleware/asyncHandler';
import { verifyAdminToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { ResponseHandler } from '../utils/errorResponse';
import imageHandler from '../utils/imageHandler';
import { PasswordUtils } from '../utils/passwordUtils';

type Company = any;
type Status = 'ACTIVE' | 'INACTIVE';
const Status = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;
type UserType = 'ADMIN' | 'AGENT' | 'CLIENT';
const UserType = { ADMIN: 'ADMIN', AGENT: 'AGENT', CLIENT: 'CLIENT' } as const;
type NotificationTargetType = 'SINGLE' | 'ALL';
const NotificationTargetType = { SINGLE: 'SINGLE', ALL: 'ALL' } as const;
type PolicyStatus = 'ACTIVE' | 'LAPSED' | 'EXPIRED' | 'PENDING';
const PolicyStatus = { ACTIVE: 'ACTIVE', LAPSED: 'LAPSED', EXPIRED: 'EXPIRED', PENDING: 'PENDING' } as const;
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

    return res.status(200).json(ResponseHandler.success('Users retrieved successfully', users));
  })
);

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

router.get(
  '/companies',
  asyncHandler(async (_req: any, res: Response) => {
    const companies = await prisma.company.findMany({
      where: { deleted_at: null },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json(ResponseHandler.success('Companies retrieved successfully', companies.map(serializeCompany)));
  })
);

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

router.post(
  '/companies',
  imageHandler.createUploadMiddleware('documents').single('image'),
  asyncHandler(async (req: any, res: Response) => {
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'companies')).url : normalizeText(req.body.image);

    const company = await prisma.company.create({
      data: {
        name: normalizeText(req.body.name),
        email: normalizeText(req.body.email),
        phone_number: normalizeText(req.body.phone_number),
        image: imageUrl || '',
        status: normalizeStatus(req.body.status),
      },
    });

    return res.status(201).json(ResponseHandler.success('Company created successfully', serializeCompany(company)));
  })
);

router.patch(
  '/companies/:id',
  imageHandler.createUploadMiddleware('documents').single('image'),
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Company not found'));
    }

    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'companies')).url : undefined;

    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name ?? undefined,
        email: req.body.email ?? undefined,
        phone_number: req.body.phone_number ?? undefined,
        image: imageUrl ?? req.body.image ?? undefined,
        status: req.body.status === undefined ? undefined : normalizeStatus(req.body.status),
      },
    });

    return res.status(200).json(ResponseHandler.success('Company updated successfully', serializeCompany(company)));
  })
);

router.delete(
  '/companies/:id',
  asyncHandler(async (req: any, res: Response) => {
    const company = await prisma.company.findUnique({ where: { id: req.params.id } });
    if (!company || company.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Company not found'));
    }

    await prisma.company.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), status: 'INACTIVE' },
    });

    return res.status(200).json(ResponseHandler.success('Company deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/agents',
  asyncHandler(async (req: any, res: Response) => {
    const search = normalizeText(req.query.search);
    const agents = await prisma.agent.findMany({
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
    });
    return res.status(200).json(ResponseHandler.success('Agents retrieved successfully', agents.map(serializeAgent)));
  })
);

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

router.post(
  '/agents',
  imageHandler.createUploadMiddleware('documents').single('image'),
  asyncHandler(async (req: any, res: Response) => {
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'agents')).url : undefined;
    const password = normalizeText(req.body.password);

    if (!password) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'password', message: 'Password is required' }]));
    }

    const agent = await prisma.agent.create({
      data: {
        agent_code: normalizeText(req.body.agent_code || req.body.username),
        full_name: normalizeText(req.body.full_name || `${req.body.first_name || ''} ${req.body.last_name || ''}`),
        email: normalizeText(req.body.email),
        phone_number: normalizeText(req.body.phone_number),
        password_hash: PasswordUtils.hashPassword(password),
        lic_agent_code: normalizeText(req.body.lic_agent_code),
        branch_division: normalizeText(req.body.branch_division),
        qualification: normalizeText(req.body.qualification),
        position_designation: normalizeText(req.body.position_designation),
        short_bio: normalizeText(req.body.short_bio),
        profile_picture: imageUrl || normalizeText(req.body.profile_picture),
        status: normalizeStatus(req.body.is_active),
        company_id: req.body.company ? String(req.body.company) : null,
      },
    });

    return res.status(201).json(ResponseHandler.success('Agent created successfully', serializeAgent({ ...agent, _count: { clients: 0 } })));
  })
);

router.patch(
  '/agents/:id',
  imageHandler.createUploadMiddleware('documents').single('image'),
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.agent.findUnique({ where: { id: req.params.id }, include: { _count: { select: { clients: true } } } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Agent not found'));
    }

    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'agents')).url : undefined;

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
        company_id: req.body.company ? String(req.body.company) : undefined,
        ...(normalizeText(req.body.password) ? { password_hash: PasswordUtils.hashPassword(normalizeText(req.body.password)) } : {}),
      },
    });

    return res.status(200).json(ResponseHandler.success('Agent updated successfully', serializeAgent(updated)));
  })
);

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

router.get(
  '/policies',
  asyncHandler(async (_req: any, res: Response) => {
    const policies = await prisma.policy.findMany({
      where: { deleted_at: null },
      include: { company: true, client: true, agent: true },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json(ResponseHandler.success('Policies retrieved successfully', policies.map(serializePolicy)));
  })
);

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
    return res.status(200).json(ResponseHandler.success('Policy retrieved successfully', serializePolicy(policy)));
  })
);

router.post(
  '/policies',
  asyncHandler(async (req: any, res: Response) => {
    const companyId = String(req.body.company || '');
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.deleted_at) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'company', message: 'Valid company is required' }]));
    }

    const agentId = (req.body.agent ? String(req.body.agent) : await findPrimaryAgentId(companyId)) || (await findPrimaryAgentId());
    const clientId = (req.body.client ? String(req.body.client) : await findPrimaryClientId(agentId)) || (await findPrimaryClientId());

    if (!agentId || !clientId) {
      return res.status(400).json(ResponseHandler.validationError([{ field: 'client', message: 'A client and agent are required to create a policy' }]));
    }

    const policy = await prisma.policy.create({
      data: {
        policy_number: normalizeText(req.body.policy_number || `POL-${Date.now()}`),
        name: normalizeText(req.body.name),
        type: normalizeText(req.body.type || 'GENERAL'),
        coverage_amount: Number(req.body.coverage_amount || 0),
        premium_amount: Number(req.body.premium_amount || 0),
        status: (String(req.body.status || 'PENDING').toUpperCase() as PolicyStatus) || 'PENDING',
        start_date: req.body.start_date ? new Date(req.body.start_date) : new Date(),
        end_date: req.body.end_date ? new Date(req.body.end_date) : new Date(),
        client_id: clientId,
        agent_id: agentId,
        company_id: companyId,
      },
      include: { company: true, client: true, agent: true },
    });

    return res.status(201).json(ResponseHandler.success('Policy created successfully', serializePolicy(policy)));
  })
);

router.patch(
  '/policies/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.policy.findUnique({
      where: { id: req.params.id },
      include: { company: true, client: true, agent: true },
    });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Policy not found'));
    }

    const companyId = req.body.company ? String(req.body.company) : undefined;
    const updated = await prisma.policy.update({
      where: { id: req.params.id },
      data: {
        name: req.body.name ?? undefined,
        type: req.body.type ?? undefined,
        coverage_amount: req.body.coverage_amount !== undefined ? Number(req.body.coverage_amount) : undefined,
        premium_amount: req.body.premium_amount !== undefined ? Number(req.body.premium_amount) : undefined,
        status: req.body.status ? (String(req.body.status).toUpperCase() as PolicyStatus) : undefined,
        start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
        end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
        company_id: companyId,
      },
      include: { company: true, client: true, agent: true },
    });

    return res.status(200).json(ResponseHandler.success('Policy updated successfully', serializePolicy(updated)));
  })
);

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

    return res.status(200).json(ResponseHandler.success('Policy deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/payments',
  asyncHandler(async (_req: any, res: Response) => {
    const transactions = await prisma.transaction.findMany({
      where: { deleted_at: null },
      include: {
        policy: {
          include: {
            client: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json(ResponseHandler.success('Payments retrieved successfully', transactions.map(serializeTransaction)));
  })
);

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

router.get(
  '/notifications',
  asyncHandler(async (_req: any, res: Response) => {
    const notifications = await prisma.notification.findMany({
      orderBy: { created_at: 'desc' },
    });
    const data = await Promise.all(notifications.map(serializeNotification));
    return res.status(200).json(ResponseHandler.success('Notifications retrieved successfully', data));
  })
);

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

router.delete(
  '/notifications/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('Notification deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/bulk-notifications',
  asyncHandler(async (_req: any, res: Response) => {
    const notifications = await prisma.bulkNotification.findMany({
      where: { deleted_at: null },
      include: { target_agent: true, creator: true },
      orderBy: { created_at: 'desc' },
    });
    return res.status(200).json(ResponseHandler.success('Notifications retrieved successfully', notifications.map(serializeBulkNotification)));
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
        target_type: req.body.target_type ? (String(req.body.target_type).toUpperCase() as NotificationTargetType) : undefined,
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
    await prisma.bulkNotification.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    return res.status(200).json(ResponseHandler.success('Notification deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/news',
  asyncHandler(async (_req: any, res: Response) => {
    const news = await prisma.notification.findMany({
      where: {
        message: {
          contains: '"kind":"news"',
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json(
      ResponseHandler.success(
        'News retrieved successfully',
        news.map((item) => {
          const payload = parseJson<any>(item.message, {});
          return {
            id: item.id,
            title: item.title,
            description: payload.description || '',
            image: payload.image || null,
            created_at: toIso(item.created_at),
          };
        })
      )
    );
  })
);

router.post(
  '/news',
  imageHandler.createUploadMiddleware('documents').single('image'),
  asyncHandler(async (req: any, res: Response) => {
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'news')).url : req.body.image || null;
    const news = await prisma.notification.create({
      data: {
        recipient_id: getCurrentAdminId(req) || String(req.body.recipient_id || ''),
        recipient_type: 'ADMIN',
        title: normalizeText(req.body.title),
        message: buildContentMessage('news', {
          description: normalizeText(req.body.description),
          image: imageUrl,
        }),
        is_read: false,
      },
    });

    const payload = parseJson<any>(news.message, {});
    return res.status(201).json(ResponseHandler.success('News created successfully', {
      id: news.id,
      title: news.title,
      description: payload.description || '',
      image: payload.image || null,
      created_at: toIso(news.created_at),
    }));
  })
);

router.patch(
  '/news/:id',
  imageHandler.createUploadMiddleware('documents').single('image'),
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json(ResponseHandler.notFound('News not found'));
    }

    const previous = parseJson<any>(existing.message, {});
    const imageUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'news')).url : req.body.image || previous.image || null;

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        message: buildContentMessage('news', {
          description: req.body.description ?? previous.description ?? '',
          image: imageUrl,
        }),
      },
    });

    const payload = parseJson<any>(updated.message, {});
    return res.status(200).json(ResponseHandler.success('News updated successfully', {
      id: updated.id,
      title: updated.title,
      description: payload.description || '',
      image: payload.image || null,
      created_at: toIso(updated.created_at),
    }));
  })
);

router.delete(
  '/news/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('News deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/resources',
  asyncHandler(async (_req: any, res: Response) => {
    const resources = await prisma.notification.findMany({
      where: {
        message: {
          contains: '"kind":"resource"',
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json(
      ResponseHandler.success(
        'Resources retrieved successfully',
        resources.map((item) => {
          const payload = parseJson<any>(item.message, {});
          return {
            id: item.id,
            title: item.title,
            file: payload.file || null,
            link: payload.link || null,
            created_at: toIso(item.created_at),
          };
        })
      )
    );
  })
);

router.post(
  '/resources',
  imageHandler.createUploadMiddleware('documents').single('file'),
  asyncHandler(async (req: any, res: Response) => {
    const fileUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'resources')).url : req.body.file || null;
    const resource = await prisma.notification.create({
      data: {
        recipient_id: getCurrentAdminId(req) || String(req.body.recipient_id || ''),
        recipient_type: 'ADMIN',
        title: normalizeText(req.body.title),
        message: buildContentMessage('resource', {
          file: fileUrl,
          link: req.body.link || null,
        }),
        is_read: false,
      },
    });

    const payload = parseJson<any>(resource.message, {});
    return res.status(201).json(ResponseHandler.success('Resource created successfully', {
      id: resource.id,
      title: resource.title,
      file: payload.file || null,
      link: payload.link || null,
      created_at: toIso(resource.created_at),
    }));
  })
);

router.patch(
  '/resources/:id',
  imageHandler.createUploadMiddleware('documents').single('file'),
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json(ResponseHandler.notFound('Resource not found'));
    }

    const previous = parseJson<any>(existing.message, {});
    const fileUrl = req.file ? (await imageHandler.uploadImage(req.file.path, 'resources')).url : req.body.file || previous.file || null;

    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        message: buildContentMessage('resource', {
          file: fileUrl,
          link: req.body.link ?? previous.link ?? null,
        }),
      },
    });

    const payload = parseJson<any>(updated.message, {});
    return res.status(200).json(ResponseHandler.success('Resource updated successfully', {
      id: updated.id,
      title: updated.title,
      file: payload.file || null,
      link: payload.link || null,
      created_at: toIso(updated.created_at),
    }));
  })
);

router.delete(
  '/resources/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json(ResponseHandler.success('Resource deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/achievements',
  asyncHandler(async (_req: any, res: Response) => {
    const achievements = await prisma.bulkNotification.findMany({
      where: { deleted_at: null },
      include: { target_agent: true, creator: true },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json(
      ResponseHandler.success(
        'Achievements retrieved successfully',
        achievements.map((item) => {
          const payload = parseJson<any>(item.content, {});
          return {
            id: item.id,
            title: item.title,
            description: payload.description || '',
            icon: payload.icon || null,
            required_xp: payload.required_xp || 0,
            created_at: toIso(item.created_at),
          };
        })
      )
    );
  })
);

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
      id: achievement.id,
      title: achievement.title,
      description: payload.description || '',
      icon: payload.icon || null,
      required_xp: payload.required_xp || 0,
      created_at: toIso(achievement.created_at),
    }));
  })
);

router.patch(
  '/achievements/:id',
  asyncHandler(async (req: any, res: Response) => {
    const existing = await prisma.bulkNotification.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Achievement not found'));
    }

    const updated = await prisma.bulkNotification.update({
      where: { id: req.params.id },
      data: {
        title: req.body.title ?? undefined,
        content:
          req.body.description !== undefined || req.body.icon !== undefined || req.body.required_xp !== undefined
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
      id: updated.id,
      title: updated.title,
      description: payload.description || '',
      icon: payload.icon || null,
      required_xp: payload.required_xp || 0,
      created_at: toIso(updated.created_at),
    }));
  })
);

router.delete(
  '/achievements/:id',
  asyncHandler(async (req: any, res: Response) => {
    await prisma.bulkNotification.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date() },
    });
    return res.status(200).json(ResponseHandler.success('Achievement deleted successfully', { id: req.params.id }));
  })
);

router.get(
  '/user-achievements',
  asyncHandler(async (_req: any, res: Response) => {
    const reads = await prisma.notificationRead.findMany({
      include: {
        notification: true,
        agent: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return res.status(200).json(
      ResponseHandler.success(
        'User achievements retrieved successfully',
        reads
          .filter((read) => parseJson<any>(read.notification?.content, {}).kind !== 'news')
          .map(serializeUserAchievement)
      )
    );
  })
);

router.post(
  '/user-achievements/unlock',
  asyncHandler(async (req: any, res: Response) => {
    const userId = String(req.body.user_id || '');
    const achievementId = String(req.body.achievement_id || '');

    const achievement = await prisma.bulkNotification.findUnique({ where: { id: achievementId } });
    if (!achievement || achievement.deleted_at) {
      return res.status(404).json(ResponseHandler.notFound('Achievement not found'));
    }

    const read = await prisma.notificationRead.upsert({
      where: {
        notification_id_agent_id: {
          notification_id: achievementId,
          agent_id: userId,
        },
      },
      create: {
        notification_id: achievementId,
        agent_id: userId,
        is_read: true,
        read_at: new Date(),
      },
      update: {
        is_read: true,
        read_at: new Date(),
      },
      include: { notification: true, agent: true },
    } as any);

    return res.status(201).json(ResponseHandler.success('Achievement unlocked successfully', serializeUserAchievement(read)));
  })
);

export default router;