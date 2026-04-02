// Database types matching Supabase schema

export type UserRole = "citizen" | "admin" | "worker";
export type UserStatus = "active" | "inactive" | "banned";
export type AuthProvider = "email" | "google" | "facebook";

export type ReportStatus =
  | "pending"
  | "open"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "completed"
  | "closed"
  | "rejected";

export type AssignmentStatus = "assigned" | "in_progress" | "completed" | "rejected";
export type AssignmentPriority = "low" | "normal" | "high" | "critical";

export interface DbUser {
  uid: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  auth_provider: AuthProvider;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface DbCitizenProfile {
  citizen_id: string;
  address: string | null;
  city: string | null;
  province: string | null;
  zip_code: string | null;
  total_reports: number;
  created_at: string;
  updated_at: string;
}

export interface DbWorkerProfile {
  worker_id: string;
  is_available: boolean;
  current_task_count: number;
  max_task_limit: number;
  avg_rating: number;
  total_completed: number;
  total_rejected: number;
  service_area: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbCategory {
  id: number;
  name: string;
  example_issues: string;
  category_group: string;
  min_response_days: number;
  max_response_days: number;
  is_active: boolean;
  created_at: string;
}

export interface DbReport {
  id: string;
  report_number: number;
  citizen_id: string;
  description: string;
  category_id: number | null;
  ai_category_name: string | null;
  ai_description: string | null;
  ai_severity: number | null;
  ai_confidence: number | null;
  ai_image_relevant: boolean | null;
  status: ReportStatus;
  due_date: string | null;
  reported_at: string;
  ai_processed_at: string | null;
  assigned_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  updated_at: string;
  assigned_worker_id: string | null;
}

export interface DbReportLocation {
  id: number;
  report_id: string;
  latitude: number;
  longitude: number;
  location_source: string;
  gps_accuracy_meters: number | null;
  formatted_address: string | null;
  street_number: string | null;
  street_name: string | null;
  neighbourhood: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country_code: string;
  location_description: string | null;
  created_at: string;
}

export interface DbReportImage {
  id: number;
  report_id: string;
  image_url: string;
  thumbnail_url: string | null;
  file_size_kb: number | null;
  is_primary: boolean;
  ai_analyzed: boolean;
  uploaded_at: string;
}

export interface DbWorkerAssignment {
  id: number;
  report_id: string;
  worker_id: string;
  assigned_by: string | null;
  assignment_status: AssignmentStatus;
  assignment_priority: AssignmentPriority;
  assigned_at: string;
  started_at: string | null;
  completed_at: string | null;
  rejected_at: string | null;
  assignment_note: string | null;
  worker_note: string | null;
  proof_image_url: string | null;
  last_update_at: string;
}

// Joined/enriched types for UI use

export interface ReportWithDetails extends DbReport {
  citizen?: DbUser;
  category?: DbCategory;
  location?: DbReportLocation;
  images?: DbReportImage[];
  assignment?: DbWorkerAssignment & { worker?: DbUser };
}

export interface WorkerWithProfile extends DbUser {
  worker_profile?: DbWorkerProfile;
}
