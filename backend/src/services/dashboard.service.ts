import { dashboardRepository } from '../repositories/dashboard.repository';
import { DashboardOverview, JWTPayload } from '../types';
import { Calculations } from '../utils/calculations';

export class DashboardService {
  /**
   * Get complete dashboard overview
   */
  async getDashboardOverview(user: JWTPayload): Promise<DashboardOverview> {
    let agentId: number | undefined;

    // If user is AGENT, get their agent ID
    if (user.role === 'AGENT') {
      const agentInfo = await dashboardRepository.getAgentInfo(user.id);
      if (!agentInfo) {
        throw new Error('Agent information not found');
      }
      agentId = agentInfo.id;
    }

    // Fetch all data in parallel
    const [
      summary,
      birthdays,
      overduePremiums,
      recentAlerts,
      recentNotifications,
      targets,
      genderBreakdown,
      whyBoughtBreakdown,
      achievements,
    ] = await Promise.all([
      dashboardRepository.getSummary(agentId),
      dashboardRepository.getBirthdays(agentId),
      dashboardRepository.getOverduePremiums(agentId),
      dashboardRepository.getRecentAlerts(agentId),
      dashboardRepository.getRecentNotifications(user.id),
      agentId ? dashboardRepository.getTargets(agentId) : Promise.resolve([]),
      dashboardRepository.getGenderBreakdown(agentId),
      dashboardRepository.getWhyBoughtBreakdown(agentId),
      dashboardRepository.getAchievements(agentId),
    ]);

    return {
      summary,
      birthdays,
      recent_alerts: recentAlerts,
      recent_notifications: recentNotifications,
      achievements,
      payments_due: overduePremiums,
      targets,
      visualizations: {
        gender_breakdown: genderBreakdown,
        why_bought_breakdown: whyBoughtBreakdown,
      },
    };
  }

  /**
   * Calculate target progress percentage
   */
  calculateTargetProgress(current: number, target: number): number {
    return Calculations.calculatePercentage(current, target);
  }

  /**
   * Validate dashboard access for role
   */
  validateDashboardAccess(role: string): boolean {
    return ['ADMIN', 'AGENT', 'USER'].includes(role);
  }
}

export const dashboardService = new DashboardService();
