import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * GET /api/user-panel/dashboard-overview
 * Fetch dashboard overview for authenticated user (Agent/Admin)
 */
router.get(
  '/dashboard-overview',
  verifyToken,
  requireRole('ADMIN', 'AGENT', 'USER'),
  asyncHandler((req, res) => dashboardController.getDashboardOverview(req, res))
);

export default router;
