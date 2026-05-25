import prisma from '../config/database';
import { DateUtils } from '../utils/dateUtils';
type Decimal = number;

export class DashboardRepository {
  /**
   * Get summary statistics for agent/admin
   */
  async getSummary(agentId?: string) {
    const clientWhereClause = agentId ? { agent_id: agentId, deleted_at: null } : { deleted_at: null };
    const policyWhereClause = agentId ? { agent_id: agentId, deleted_at: null } : { deleted_at: null };

    // Get total members
    const totalMembers = await prisma.client.count({
      where: clientWhereClause,
    });

    // Get active members
    const activeMembers = await prisma.client.count({
      where: {
        ...clientWhereClause,
        status: 'ACTIVE',
      },
    });

    // Get inactive members
    const inactiveMembers = totalMembers - activeMembers;

    // Get overdue premiums count
    const now = new Date();
    const overdueCount = await prisma.policy.count({
      where: {
        ...policyWhereClause,
        premium_due_date: {
          lt: now,
        },
        status: 'ACTIVE',
      },
    });

    // Get lapsed policies count
    const lapsedCount = await prisma.policy.count({
      where: {
        ...policyWhereClause,
        status: 'LAPSED',
      },
    });

    // Get total policies
    const totalPolicies = await prisma.policy.count({
      where: policyWhereClause,
    });

    return {
      total_members: totalMembers,
      active_members: activeMembers,
      inactive_members: inactiveMembers,
      total_policies: totalPolicies,
      overdue_premiums: overdueCount,
      lapsed_policies: lapsedCount,
    };
  }

  /**
   * Get birthdays - today and this month
   */
  async getBirthdays(agentId?: string) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    const whereClause = agentId ? { agent_id: agentId, deleted_at: null } : { deleted_at: null };

    const birthdays = await prisma.client.findMany({
      where: whereClause,
      select: {
        id: true,
        first_name: true,
        last_name: true,
        dob: true,
        phone: true,
        email: true,
        profile_picture: true,
      },
    });

    const todayBirthdays = birthdays.filter((client) => {
      return (
        client.dob && client.dob.getMonth() === currentMonth && client.dob.getDate() === currentDate
      );
    });

    const thisMonthBirthdays = birthdays.filter((client) => {
      return client.dob && client.dob.getMonth() === currentMonth;
    });

    return {
      today: todayBirthdays.map((b) => ({
        id: b.id,
        name: `${b.first_name} ${b.last_name}`,
        dob: b.dob ? DateUtils.formatDate(b.dob) : null,
        phone: b.phone,
        email: b.email,
        profile_picture: b.profile_picture,
      })),
      this_month: thisMonthBirthdays.map((b) => ({
        id: b.id,
        name: `${b.first_name} ${b.last_name}`,
        dob: b.dob ? DateUtils.formatDate(b.dob) : null,
        phone: b.phone,
        email: b.email,
        profile_picture: b.profile_picture,
      })),
      this_month_count: thisMonthBirthdays.length,
    };
  }

  /**
   * Get overdue premiums with complete client details
   */
  async getOverduePremiums(agentId?: number) {
    const now = new Date();

    const overduePolicies = await prisma.policy.findMany({
      where: {
        premium_due_date: {
          lt: now,
        },
        status: 'ACTIVE',
        deleted_at: null,
        ...(agentId ? { agent_id: agentId } : {}),
      },
      include: {
        client: true,
        agent: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
      orderBy: {
        premium_due_date: 'asc',
      },
      take: 50,
    });

    return overduePolicies.map((policy) => ({
      id: policy.id,
      client_name: `${policy.client.first_name} ${policy.client.last_name}`,
      client_id: policy.client.id,
      client_email: policy.client.email,
      client_phone: policy.client.phone,
      client_image: policy.client.profile_picture,
      policy_number: policy.policy_number,
      plan_name: policy.plan_name,
      premium_amount: policy.premium_amount ? Number(policy.premium_amount) : 0,
      premium_due_date: policy.premium_due_date,
      status: policy.status,
      created_at: policy.created_at.toISOString(),
    }));
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(agentId?: number, limit: number = 10) {
    const alerts = await prisma.alert.findMany({
      where: {
        is_resolved: false,
        ...(agentId ? { client: { agent_id: agentId } } : {}),
      },
      include: {
        client: {
          select: {
            first_name: true,
            last_name: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
    });

    return alerts.map((alert) => ({
      id: alert.id,
      client_name: `${alert.client.first_name} ${alert.client.last_name}`,
      alert_type: alert.alert_type,
      message: alert.alert_message,
      severity: alert.severity,
      created_at: alert.created_at.toISOString(),
    }));
  }

  /**
   * Get recent notifications
   */
  async getRecentNotifications(userId: number, limit: number = 10) {
    const notifications = await prisma.notification.findMany({
      where: {
        user_id: userId,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
    });

    return notifications.map((notif) => ({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      type: notif.notification_type,
      is_read: notif.is_read,
      created_at: notif.created_at.toISOString(),
    }));
  }

  /**
   * Get target progress
   */
  async getTargets(agentId: number) {
    const now = new Date();
    const currentMonthStart = DateUtils.getMonthStart();

    const targets = await prisma.target.findMany({
      where: {
        agent_id: agentId,
        target_month: {
          gte: currentMonthStart,
        },
      },
      orderBy: {
        target_month: 'desc',
      },
    });

    return targets.map((target) => ({
      id: target.id,
      target_type: target.target_type,
      target_value: Number(target.target_value),
      current_value: Number(target.current_value),
      progress_percentage:
        Number(target.current_value) > 0
          ? Number(((Number(target.current_value) / Number(target.target_value)) * 100).toFixed(2))
          : 0,
      target_month: target.target_month.toISOString().split('T')[0],
    }));
  }

  /**
   * Get gender breakdown
   */
  async getGenderBreakdown(agentId?: number) {
    const groupByGender = await prisma.client.groupBy({
      by: ['gender'],
      where: agentId ? { agent_id: agentId } : {},
      _count: true,
    });

    const breakdown = {
      MALE: 0,
      FEMALE: 0,
      CHILD: 0,
      OTHER: 0,
    };

    groupByGender.forEach((item) => {
      breakdown[item.gender as keyof typeof breakdown] = item._count;
    });

    return breakdown;
  }

  /**
   * Get why_bought breakdown (Insurance buying reason)
   */
  async getWhyBoughtBreakdown(agentId?: number) {
    const groupByReason = await prisma.clientPolicy.groupBy({
      by: ['why_bought'],
      where: agentId ? { client: { agent_id: agentId } } : {},
      _count: true,
    });

    return groupByReason
      .map((item) => ({
        why_bought: item.why_bought,
        count: item._count,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Get achievements (placeholder)
   */
  async getAchievements(agentId?: number) {
    // This would be populated based on agent performance
    // For now, returning empty array
    return [];
  }

  /**
   * Check if user is agent and get agent info
   */
  async getAgentInfo(userId: number) {
    const agent = await prisma.agent.findUnique({
      where: {
        user_id: userId,
      },
    });
    return agent;
  }
}

export const dashboardRepository = new DashboardRepository();
