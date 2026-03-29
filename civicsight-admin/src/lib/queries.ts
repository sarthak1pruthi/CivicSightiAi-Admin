import { apiFetch } from "./api";
import { supabase } from "./supabase";
import type {
  DbCategory,
  DbCitizenProfile,
  ReportWithDetails,
  WorkerWithProfile,
  ReportStatus,
  AssignmentPriority,
} from "./types";

// ─── Reports ──────────────────────────────────────────────

export async function fetchReports(): Promise<ReportWithDetails[]> {
  return apiFetch<ReportWithDetails[]>("/api/reports");
}

export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
  rejectionNote?: string
) {
  await apiFetch("/api/reports", {
    method: "PATCH",
    body: JSON.stringify({ reportId, status, rejectionNote }),
  });
}

// ─── Worker Assignment ────────────────────────────────────

export async function assignWorkerToReport(
  reportId: string,
  workerId: string,
  adminId: string,
  priority: AssignmentPriority = "normal",
  note?: string
) {
  await apiFetch("/api/assignments", {
    method: "POST",
    body: JSON.stringify({ reportId, workerId, adminId, priority, note }),
  });
}

// ─── Workers ──────────────────────────────────────────────

export async function fetchWorkers(): Promise<WorkerWithProfile[]> {
  return apiFetch<WorkerWithProfile[]>("/api/workers");
}

// ─── Citizens ─────────────────────────────────────────────

export async function fetchCitizens() {
  return apiFetch<(import("./types").DbUser & { citizen_profile?: DbCitizenProfile })[]>("/api/citizens");
}

// ─── Categories ───────────────────────────────────────────

export async function fetchCategories(): Promise<DbCategory[]> {
  return apiFetch<DbCategory[]>("/api/categories");
}

// ─── Dashboard Stats ──────────────────────────────────────

export async function fetchDashboardStats() {
  return apiFetch<{
    totalReports: number;
    activeCitizens: number;
    totalWorkers: number;
    resolvedToday: number;
    statusCounts: Record<string, number>;
    categoryCounts: Record<string, number>;
    last7Days: { date: string; count: number }[];
    avgResolutionHours: number;
  }>("/api/dashboard");
}

// ─── Analytics ────────────────────────────────────────────

export async function fetchAnalyticsData() {
  const data = await apiFetch<{
    reports: Array<{ id: string; status: string; ai_severity: number | null; reported_at: string; resolved_at: string | null; category_id: number | null; ai_category_name: string | null }>;
    categories: Array<{ id: number; name: string; category_group: string }>;
    catsMap: Record<string, string>;
    locMap: Record<string, { report_id: string; city: string | null; neighbourhood: string | null }>;
  }>("/api/analytics");

  // Convert plain objects back to Maps for frontend compatibility
  return {
    reports: data.reports,
    categories: data.categories,
    catsMap: new Map(Object.entries(data.catsMap).map(([k, v]) => [Number(k), v])),
    locMap: new Map(Object.entries(data.locMap)),
  };
}

// ─── Auth ─────────────────────────────────────────────────

export async function adminLogin(email: string, password: string) {
  const result = await apiFetch<{
    session: { access_token: string; refresh_token: string };
    user: { uid: string; role: string; full_name: string; email: string };
  }>("/api/auth", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  // Store token for subsequent requests
  if (result.session?.access_token) {
    localStorage.setItem("access_token", result.session.access_token);
  }

  // Also sign in on the client supabase for realtime subscriptions
  await supabase.auth.signInWithPassword({ email, password });

  return result;
}

export async function adminLogout() {
  try {
    await apiFetch("/api/auth", { method: "DELETE" });
  } finally {
    localStorage.removeItem("access_token");
    await supabase.auth.signOut();
  }
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentAdmin() {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  if (!token) {
    // Fallback: check supabase session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    // Store it for future API calls
    localStorage.setItem("access_token", session.access_token);
  }

  try {
    return await apiFetch<{ uid: string; role: string; full_name: string; email: string }>("/api/auth");
  } catch {
    return null;
  }
}
