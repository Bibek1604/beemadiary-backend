const express = require('express');
const { prisma } = require('../config/db');
const ApiResponse = require('../utils/apiResponse');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

const TARGET_TYPES = ['MONTHLY', 'YEARLY'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const parseTargetType = (value) => String(value || '').trim().toUpperCase();

const normalizePeriodName = (targetType, periodName) => {
  const raw = String(periodName || '').trim();
  if (!raw) return { ok: false, error: 'period_name is required' };

  if (targetType === 'YEARLY') {
    if (!/^\d{4}$/.test(raw)) {
      return { ok: false, error: 'For YEARLY targets, period_name must be in YYYY format' };
    }
    return { ok: true, value: raw };
  }

  if (targetType === 'MONTHLY') {
    const parts = raw.split(/\s+/);
    if (parts.length !== 2) {
      return { ok: false, error: 'For MONTHLY targets, period_name must be in Mon YYYY format (e.g. Jan 2026)' };
    }

    const month = parts[0].slice(0, 1).toUpperCase() + parts[0].slice(1, 3).toLowerCase();
    const year = parts[1];

    if (!MONTHS.includes(month) || !/^\d{4}$/.test(year)) {
      return { ok: false, error: 'For MONTHLY targets, use Mon YYYY format (e.g. Jan 2026)' };
    }

    return { ok: true, value: `${month} ${year}` };
  }

  return { ok: false, error: 'target_type must be MONTHLY or YEARLY' };
};

const getPeriodRange = (targetType, periodName) => {
  if (targetType === 'YEARLY') {
    const year = Number(periodName);
    const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
    return { start, end };
  }

  const [monthName, yearText] = periodName.split(' ');
  const month = MONTHS.indexOf(monthName);
  const year = Number(yearText);
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const end = month === 11
    ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))
    : new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  return { start, end };
};

const ensureTargetsTable = async () => {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS agent_targets (
      id BIGSERIAL PRIMARY KEY,
      agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      target_type VARCHAR(16) NOT NULL,
      target_value INTEGER NOT NULL CHECK (target_value > 0),
      period_name VARCHAR(32) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      deleted_at TIMESTAMPTZ NULL
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_agent_targets_agent_id
    ON agent_targets (agent_id);
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_agent_targets_period
    ON agent_targets (target_type, period_name);
  `);
};

const calculateCurrentAndProgress = async (target) => {
  const { start, end } = getPeriodRange(target.target_type, target.period_name);

  const currentValue = await prisma.client.count({
    where: {
      agent_id: target.agent_id,
      deleted_at: null,
      created_at: {
        gte: start,
        lt: end,
      },
    },
  });

  const percentage = target.target_value > 0
    ? Number(((currentValue / target.target_value) * 100).toFixed(2))
    : 0;

  return {
    id: Number(target.id),
    target_type: target.target_type,
    target_value: Number(target.target_value),
    period_name: target.period_name,
    current_value: currentValue,
    progress_percentage: percentage,
    created_at: new Date(target.created_at).toISOString(),
    updated_at: new Date(target.updated_at).toISOString(),
  };
};

router.get(['/my-targets', '/my-targets/'], verifyToken, async (req, res) => {
  try {
    await ensureTargetsTable();

    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Authentication required'));
    }

    const targets = await prisma.$queryRawUnsafe(
      `
      SELECT id, agent_id, target_type, target_value, period_name, created_at, updated_at
      FROM agent_targets
      WHERE agent_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      `,
      agentId
    );

    const formatted = await Promise.all(targets.map(calculateCurrentAndProgress));

    return res.status(200).json(
      ApiResponse.success('Targets fetched successfully', {
        results: formatted,
        data: formatted,
      })
    );
  } catch (error) {
    return res.status(400).json(ApiResponse.error('Failed to fetch targets', [error.message]));
  }
});

router.post(['/my-targets', '/my-targets/'], verifyToken, async (req, res) => {
  try {
    await ensureTargetsTable();

    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Authentication required'));
    }

    const targetType = parseTargetType(req.body?.target_type);
    const targetValue = toNumber(req.body?.target_value);
    const periodValidation = normalizePeriodName(targetType, req.body?.period_name);

    const errors = [];
    if (!TARGET_TYPES.includes(targetType)) {
      errors.push('target_type must be MONTHLY or YEARLY');
    }
    if (!Number.isInteger(targetValue) || targetValue <= 0) {
      errors.push('target_value must be a positive integer');
    }
    if (!periodValidation.ok) {
      errors.push(periodValidation.error);
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error('Validation failed', errors));
    }

    const periodName = periodValidation.value;

    const existing = await prisma.$queryRawUnsafe(
      `
      SELECT id
      FROM agent_targets
      WHERE agent_id = $1 AND target_type = $2 AND period_name = $3 AND deleted_at IS NULL
      LIMIT 1
      `,
      agentId,
      targetType,
      periodName
    );

    if (Array.isArray(existing) && existing.length > 0) {
      return res.status(409).json(
        ApiResponse.error('Target already exists for this period and type')
      );
    }

    const inserted = await prisma.$queryRawUnsafe(
      `
      INSERT INTO agent_targets (agent_id, target_type, target_value, period_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, agent_id, target_type, target_value, period_name, created_at, updated_at
      `,
      agentId,
      targetType,
      targetValue,
      periodName
    );

    const created = await calculateCurrentAndProgress(inserted[0]);

    return res.status(201).json(ApiResponse.success('Target created successfully', created));
  } catch (error) {
    return res.status(400).json(ApiResponse.error('Failed to create target', [error.message]));
  }
});

router.get(['/my-targets/:targetId', '/my-targets/:targetId/'], verifyToken, async (req, res) => {
  try {
    await ensureTargetsTable();

    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Authentication required'));
    }

    const targetId = toNumber(req.params?.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json(ApiResponse.error('Invalid target ID'));
    }

    const rows = await prisma.$queryRawUnsafe(
      `
      SELECT id, agent_id, target_type, target_value, period_name, created_at, updated_at
      FROM agent_targets
      WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL
      LIMIT 1
      `,
      targetId,
      agentId
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json(ApiResponse.error('Target not found'));
    }

    const target = await calculateCurrentAndProgress(rows[0]);
    return res.status(200).json(ApiResponse.success('Target fetched successfully', target));
  } catch (error) {
    return res.status(400).json(ApiResponse.error('Failed to fetch target', [error.message]));
  }
});

router.patch(['/my-targets/:targetId', '/my-targets/:targetId/'], verifyToken, async (req, res) => {
  try {
    await ensureTargetsTable();

    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Authentication required'));
    }

    const targetId = toNumber(req.params?.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json(ApiResponse.error('Invalid target ID'));
    }

    const currentRows = await prisma.$queryRawUnsafe(
      `
      SELECT id, agent_id, target_type, target_value, period_name, created_at, updated_at
      FROM agent_targets
      WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL
      LIMIT 1
      `,
      targetId,
      agentId
    );

    if (!Array.isArray(currentRows) || currentRows.length === 0) {
      return res.status(404).json(ApiResponse.error('Target not found'));
    }

    const current = currentRows[0];
    const targetType = req.body?.target_type ? parseTargetType(req.body.target_type) : current.target_type;
    const targetValue = req.body?.target_value !== undefined ? toNumber(req.body.target_value) : Number(current.target_value);
    const periodValidation = normalizePeriodName(
      targetType,
      req.body?.period_name !== undefined ? req.body.period_name : current.period_name
    );

    const errors = [];
    if (!TARGET_TYPES.includes(targetType)) {
      errors.push('target_type must be MONTHLY or YEARLY');
    }
    if (!Number.isInteger(targetValue) || targetValue <= 0) {
      errors.push('target_value must be a positive integer');
    }
    if (!periodValidation.ok) {
      errors.push(periodValidation.error);
    }

    if (errors.length > 0) {
      return res.status(400).json(ApiResponse.error('Validation failed', errors));
    }

    const duplicate = await prisma.$queryRawUnsafe(
      `
      SELECT id
      FROM agent_targets
      WHERE agent_id = $1
        AND target_type = $2
        AND period_name = $3
        AND id <> $4
        AND deleted_at IS NULL
      LIMIT 1
      `,
      agentId,
      targetType,
      periodValidation.value,
      targetId
    );

    if (Array.isArray(duplicate) && duplicate.length > 0) {
      return res.status(409).json(
        ApiResponse.error('Another target already exists for this period and type')
      );
    }

    const updatedRows = await prisma.$queryRawUnsafe(
      `
      UPDATE agent_targets
      SET target_type = $1, target_value = $2, period_name = $3, updated_at = NOW()
      WHERE id = $4 AND agent_id = $5 AND deleted_at IS NULL
      RETURNING id, agent_id, target_type, target_value, period_name, created_at, updated_at
      `,
      targetType,
      targetValue,
      periodValidation.value,
      targetId,
      agentId
    );

    const updated = await calculateCurrentAndProgress(updatedRows[0]);
    return res.status(200).json(ApiResponse.success('Target updated successfully', updated));
  } catch (error) {
    return res.status(400).json(ApiResponse.error('Failed to update target', [error.message]));
  }
});

router.delete(['/my-targets/:targetId', '/my-targets/:targetId/'], verifyToken, async (req, res) => {
  try {
    await ensureTargetsTable();

    const agentId = req.user?.id;
    if (!agentId) {
      return res.status(401).json(ApiResponse.error('Authentication required'));
    }

    const targetId = toNumber(req.params?.targetId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json(ApiResponse.error('Invalid target ID'));
    }

    const deleted = await prisma.$executeRawUnsafe(
      `
      UPDATE agent_targets
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND agent_id = $2 AND deleted_at IS NULL
      `,
      targetId,
      agentId
    );

    if (!deleted) {
      return res.status(404).json(ApiResponse.error('Target not found'));
    }

    return res.status(200).json(ApiResponse.success('Target deleted successfully', { id: targetId }));
  } catch (error) {
    return res.status(400).json(ApiResponse.error('Failed to delete target', [error.message]));
  }
});

module.exports = router;
