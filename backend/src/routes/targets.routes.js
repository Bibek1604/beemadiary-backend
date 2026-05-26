/**
 * Agent monthly/yearly targets — MongoDB implementation.
 *
 * Routes (unchanged contract):
 *   GET    /api/my-targets/                  list current agent's targets
 *   POST   /api/my-targets/                  create a target
 *   GET    /api/my-targets/:targetId         get a target
 *   PATCH  /api/my-targets/:targetId         update a target
 *   DELETE /api/my-targets/:targetId         soft-delete a target
 *
 * Stored in the `agentTarget` collection. `current_value` is computed on
 * read by counting clients enrolled by the agent within the target's period.
 */
const express = require('express');
const crypto = require('crypto');
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
      return { ok: false, error: 'For MONTHLY targets, period_name must be in "Mon YYYY" format' };
    }
    const month = parts[0].slice(0, 1).toUpperCase() + parts[0].slice(1, 3).toLowerCase();
    const year = parts[1];
    if (!MONTHS.includes(month) || !/^\d{4}$/.test(year)) {
      return { ok: false, error: 'For MONTHLY targets, use "Mon YYYY" format' };
    }
    return { ok: true, value: `${month} ${year}` };
  }

  return { ok: false, error: 'target_type must be MONTHLY or YEARLY' };
};

const getPeriodRange = (targetType, periodName) => {
  if (targetType === 'YEARLY') {
    const year = Number(periodName);
    return {
      start: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
      end:   new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
    };
  }
  const [monthName, yearText] = periodName.split(' ');
  const month = MONTHS.indexOf(monthName);
  const year = Number(yearText);
  return {
    start: new Date(Date.UTC(year, month, 1, 0, 0, 0, 0)),
    end:   month === 11
      ? new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0))
      : new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0)),
  };
};

const decorateTarget = async (target) => {
  const { start, end } = getPeriodRange(target.target_type, target.period_name);

  let currentValue = 0;
  try {
    currentValue = await prisma.client.count({
      where: {
        agent_id: target.agent_id,
        deleted_at: null,
        created_at: { gte: start, lt: end },
      },
    });
  } catch (_err) {
    currentValue = 0;
  }

  const percentage = target.target_value > 0
    ? Number(((currentValue / target.target_value) * 100).toFixed(2))
    : 0;

  return {
    id: target.id,
    target_type: target.target_type,
    target_value: Number(target.target_value),
    period_name: target.period_name,
    current_value: currentValue,
    progress_percentage: percentage,
    created_at: target.created_at instanceof Date ? target.created_at.toISOString() : target.created_at,
    updated_at: target.updated_at instanceof Date ? target.updated_at.toISOString() : target.updated_at,
  };
};

// ---------- LIST ----------
router.get(['/my-targets', '/my-targets/'], verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Authentication required', null, 401));

    const targets = await prisma.agentTarget.findMany({
      where: { agent_id: agentId, deleted_at: null },
      orderBy: { created_at: 'desc' },
    });

    const formatted = await Promise.all(targets.map(decorateTarget));
    return res.status(200).json(
      ApiResponse.success('Targets fetched successfully', { results: formatted, data: formatted }, 200)
    );
  } catch (error) {
    console.error('[Targets List Error]:', error);
    return res.status(500).json(ApiResponse.error('Failed to fetch targets', error, 500));
  }
});

// ---------- CREATE ----------
router.post(['/my-targets', '/my-targets/'], verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Authentication required', null, 401));

    const targetType  = parseTargetType(req.body?.target_type);
    const targetValue = toNumber(req.body?.target_value);
    const periodValidation = normalizePeriodName(targetType, req.body?.period_name);

    const errors = [];
    if (!TARGET_TYPES.includes(targetType))            errors.push('target_type must be MONTHLY or YEARLY');
    if (!Number.isInteger(targetValue) || targetValue <= 0) errors.push('target_value must be a positive integer');
    if (!periodValidation.ok)                          errors.push(periodValidation.error);
    if (errors.length > 0) return res.status(400).json(ApiResponse.error('Validation failed', errors, 400));

    const periodName = periodValidation.value;

    const existing = await prisma.agentTarget.findFirst({
      where: { agent_id: agentId, target_type: targetType, period_name: periodName, deleted_at: null },
    });
    if (existing) {
      return res.status(409).json(ApiResponse.error('Target already exists for this period and type', null, 409));
    }

    const created = await prisma.agentTarget.create({
      data: {
        id: crypto.randomUUID(),
        agent_id: agentId,
        target_type: targetType,
        target_value: targetValue,
        period_name: periodName,
        deleted_at: null,
      },
    });

    const decorated = await decorateTarget(created);
    return res.status(201).json(ApiResponse.success('Target created successfully', decorated, 201));
  } catch (error) {
    console.error('[Targets Create Error]:', error);
    return res.status(500).json(ApiResponse.error('Failed to create target', error, 500));
  }
});

// ---------- GET ----------
router.get(['/my-targets/:targetId', '/my-targets/:targetId/'], verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Authentication required', null, 401));

    const { targetId } = req.params;
    const target = await prisma.agentTarget.findFirst({
      where: { id: targetId, agent_id: agentId, deleted_at: null },
    });
    if (!target) return res.status(404).json(ApiResponse.error('Target not found', null, 404));

    const decorated = await decorateTarget(target);
    return res.status(200).json(ApiResponse.success('Target fetched successfully', decorated, 200));
  } catch (error) {
    console.error('[Targets Get Error]:', error);
    return res.status(500).json(ApiResponse.error('Failed to fetch target', error, 500));
  }
});

// ---------- UPDATE ----------
router.patch(['/my-targets/:targetId', '/my-targets/:targetId/'], verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Authentication required', null, 401));

    const { targetId } = req.params;
    const current = await prisma.agentTarget.findFirst({
      where: { id: targetId, agent_id: agentId, deleted_at: null },
    });
    if (!current) return res.status(404).json(ApiResponse.error('Target not found', null, 404));

    const targetType  = req.body?.target_type ? parseTargetType(req.body.target_type) : current.target_type;
    const targetValue = req.body?.target_value !== undefined ? toNumber(req.body.target_value) : Number(current.target_value);
    const periodValidation = normalizePeriodName(
      targetType,
      req.body?.period_name !== undefined ? req.body.period_name : current.period_name
    );

    const errors = [];
    if (!TARGET_TYPES.includes(targetType))            errors.push('target_type must be MONTHLY or YEARLY');
    if (!Number.isInteger(targetValue) || targetValue <= 0) errors.push('target_value must be a positive integer');
    if (!periodValidation.ok)                          errors.push(periodValidation.error);
    if (errors.length > 0) return res.status(400).json(ApiResponse.error('Validation failed', errors, 400));

    const duplicate = await prisma.agentTarget.findFirst({
      where: {
        agent_id: agentId,
        target_type: targetType,
        period_name: periodValidation.value,
        deleted_at: null,
      },
    });
    if (duplicate && duplicate.id !== current.id) {
      return res.status(409).json(ApiResponse.error('Another target already exists for this period and type', null, 409));
    }

    const updated = await prisma.agentTarget.update({
      where: { id: current.id },
      data: { target_type: targetType, target_value: targetValue, period_name: periodValidation.value },
    });

    const decorated = await decorateTarget(updated);
    return res.status(200).json(ApiResponse.success('Target updated successfully', decorated, 200));
  } catch (error) {
    console.error('[Targets Update Error]:', error);
    return res.status(500).json(ApiResponse.error('Failed to update target', error, 500));
  }
});

// ---------- DELETE ----------
router.delete(['/my-targets/:targetId', '/my-targets/:targetId/'], verifyToken, async (req, res) => {
  try {
    const agentId = req.user?.id;
    if (!agentId) return res.status(401).json(ApiResponse.error('Authentication required', null, 401));

    const { targetId } = req.params;
    const current = await prisma.agentTarget.findFirst({
      where: { id: targetId, agent_id: agentId, deleted_at: null },
    });
    if (!current) return res.status(404).json(ApiResponse.error('Target not found', null, 404));

    await prisma.agentTarget.update({
      where: { id: current.id },
      data: { deleted_at: new Date() },
    });

    return res.status(200).json(ApiResponse.success('Target deleted successfully', { id: current.id }, 200));
  } catch (error) {
    console.error('[Targets Delete Error]:', error);
    return res.status(500).json(ApiResponse.error('Failed to delete target', error, 500));
  }
});

module.exports = router;
