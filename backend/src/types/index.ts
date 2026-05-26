import type { Request } from 'express';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'AGENT' | 'CLIENT';

export interface JWTPayload {
  id: number;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

export interface ApiResponse<T = any> {
  status: boolean;
  message: string;
  data?: T;
  errors?: any[];
  code: number;
}

export interface DashboardSummary {
  total_members: number;
  active_members: number;
  inactive_members: number;
  lapsed_policies: number;
  overdue_premiums: number;
  unread_alerts: number;
}

export interface BirthdayData {
  id: number;
  first_name: string;
  last_name: string;
  dob: string;
  contact_number: string;
}

export interface BirthdayResponse {
  today: BirthdayData[];
  this_month: BirthdayData[];
  this_month_count: number;
}

export interface OverduePremium {
  client_name: string;
  policy_number: string;
  premium_amount: number;
  premium_due_date: string;
  days_overdue: number;
  contact_number: string;
  policy_status: string;
}

export interface TargetData {
  id: number;
  target_type: string;
  target_value: number;
  current_value: number;
  progress_percentage: number;
  target_month: string;
}

export interface GenderBreakdown {
  MALE: number;
  FEMALE: number;
  CHILD: number;
  OTHER: number;
}

export interface WhyBoughtBreakdown {
  why_bought: string;
  count: number;
}

export interface Visualization {
  gender_breakdown: GenderBreakdown;
  why_bought_breakdown: WhyBoughtBreakdown[];
}

export interface DashboardOverview {
  summary: DashboardSummary;
  birthdays: BirthdayResponse;
  recent_alerts: any[];
  recent_notifications: any[];
  achievements: any[];
  payments_due: OverduePremium[];
  targets: TargetData[];
  visualizations: Visualization;
}

export interface ErrorResponse {
  status: false;
  message: string;
  errors?: Array<{
    field?: string;
    message: string;
  }>;
  code: number;
}
