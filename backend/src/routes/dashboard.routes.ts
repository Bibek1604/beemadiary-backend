import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { verifyAnyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();

/**
 * @swagger
 * /api/user-panel/dashboard-overview:
 *   get:
 *     summary: Dashboard overview for the authenticated user (Agent/Admin)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Dashboard overview retrieved successfully }
 *       401: { description: Unauthorized }
 */
router.get(
  '/dashboard-overview',
  verifyAnyToken,  // accepts both admin (JWT_ADMIN_SECRET) and agent (JWT_SECRET) tokens
  asyncHandler((req, res) => dashboardController.getDashboardOverview(req, res))
);

export default router;
