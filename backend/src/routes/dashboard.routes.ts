import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { verifyAnyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * GET /api/user-panel/dashboard-overview
 * Fetch dashboard overview for authenticated user (Agent/Admin)
 */
router.get(
  '/dashboard-overview',
  verifyAnyToken,  // accepts both admin (JWT_ADMIN_SECRET) and agent (JWT_SECRET) tokens
  asyncHandler((req, res) => dashboardController.getDashboardOverview(req, res))
);

export default router;
