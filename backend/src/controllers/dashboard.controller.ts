import { Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';
import { dashboardService } from '../services/dashboard.service';
import { ResponseHandler } from '../utils/errorResponse';
import { CONSTANTS } from '../config/constants';

export class DashboardController {
  /**
   * Get dashboard overview
   */
  async getDashboardOverview(req: AuthenticatedRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(CONSTANTS.STATUS_CODES.UNAUTHORIZED).json(
          ResponseHandler.unauthorized()
        );
      }

      // Validate user has dashboard access
      if (!dashboardService.validateDashboardAccess(req.user.role)) {
        return res.status(CONSTANTS.STATUS_CODES.FORBIDDEN).json(
          ResponseHandler.forbidden('No dashboard access')
        );
      }

      const dashboardData = await dashboardService.getDashboardOverview(req.user);

      return res.status(CONSTANTS.STATUS_CODES.OK).json(
        ResponseHandler.success<any>(
          CONSTANTS.SUCCESS.DASHBOARD_FETCHED,
          dashboardData,
          CONSTANTS.STATUS_CODES.OK
        )
      );
    } catch (error: any) {
      console.error('[Dashboard Controller Error]', error);

      if (error.message.includes('Agent information not found')) {
        return res.status(CONSTANTS.STATUS_CODES.NOT_FOUND).json(
          ResponseHandler.notFound('Agent profile not found')
        );
      }

      return res.status(CONSTANTS.STATUS_CODES.INTERNAL_ERROR).json(
        ResponseHandler.error(
          'Failed to fetch dashboard overview',
          CONSTANTS.STATUS_CODES.INTERNAL_ERROR
        )
      );
    }
  }
}

export const dashboardController = new DashboardController();
