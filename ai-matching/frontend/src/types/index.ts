export type UserRole = 'freelancer' | 'client';

export interface FreelancerProfile {
  id: string;
  phone: string;
  name: string | null;
  profile_link: string | null;
  portfolio: string | null;
  skills: string | null;
  tools: string | null;
  rate: string | null;
  availability: string | null;
  preferences: string | null;
  bio: string | null;
  avatar_url: string | null;
  languages: string[] | null;
  experience_years: number | null;
  linkedin_url: string | null;
  cv_url: string | null;
  location: string | null;
  timezone: string | null;
  profile_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClientProfile {
  id: string;
  phone: string;
  name: string | null;
  project_description: string | null;
  hire_type: 'full-time' | 'project-based' | null;
  budget_hourly: string | null;
  budget_project: string | null;
  project_count: number | null;
  deadline: string | null;
  deadline_date: string | null;
  role: 'client';
  created_at: string;
  updated_at: string;
}

export interface ConversationRecord {
  id: string;
  phone: string;
  role: UserRole | null;
  step: string | null;
  temp_data: Record<string, unknown> | null;
  updated_at: string;
}

export interface Match {
  id: string;
  freelancer_phone: string;
  client_phone: string;
  compatibility_score: number;
  skills_overlap: string[];
  budget_fit: boolean;
  availability_fit: boolean;
  ai_explanation: string;
  potential_risks: string;
  recommended_action: string;
  created_at: string;
  freelancer?: FreelancerProfile;
  client?: ClientProfile;
}

export interface Notification {
  id: string;
  phone: string;
  type: 'new_match' | 'profile_update' | 'ai_recommendation' | 'deadline' | 'system';
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export interface Insight {
  id: string;
  phone: string;
  insight_type: 'profile_strength' | 'market_demand' | 'pricing' | 'skill_gap' | 'opportunity';
  content: string;
  metric_value: number | null;
  metric_label: string | null;
  icon: string | null;
  color: string | null;
  generated_at: string;
}

export interface DashboardStats {
  profile_score: number;
  match_count: number;
  unread_notifications: number;
  profile_views: number;
  response_rate: number;
  top_skills: string[];
  recent_matches: Match[];
  recent_notifications: Notification[];
  skill_demand_trend: SkillTrendPoint[];
  weekly_activity: WeeklyActivityPoint[];
}

export interface SkillTrendPoint {
  skill: string;
  demand: number;
  growth: number;
}

export interface WeeklyActivityPoint {
  day: string;
  matches: number;
  views: number;
  messages: number;
}

export interface AuthUser {
  id: string;
  phone: string;
  role: UserRole | null;
  profile?: FreelancerProfile | ClientProfile;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export type ProfileCompletionField = {
  key: string;
  label: string;
  completed: boolean;
  weight: number;
};
