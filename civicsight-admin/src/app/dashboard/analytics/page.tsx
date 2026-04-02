"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Download, Loader2, AlertTriangle, Users, TrendingUp, Briefcase, Star, CheckCircle, XCircle, ClipboardList, Clock, BarChart3, Target, Zap, ArrowUpRight, ArrowDownRight, ChevronDown, FileText, FileSpreadsheet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    LineChart, Line, PieChart, Pie, Cell, Sector,
    AreaChart, Area,
} from "recharts";
import { fetchAnalyticsData, fetchCitizens, fetchWorkers } from "@/lib/queries";
import type { WorkerWithProfile } from "@/lib/types";

type PeriodKey = "7D" | "30D" | "90D" | "All";

const tooltipStyle = { backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e", borderRadius: "8px", fontSize: "12px", color: "#e8e4df" };
const tooltipLabelStyle = { color: "#e8e4df" };
const tooltipItemStyle = { color: "#c4c0ba" };

const periodDays: Record<PeriodKey, number> = { "7D": 7, "30D": 30, "90D": 90, All: 36500 };
const periodLabels: Record<PeriodKey, string> = { "7D": "past 7 days", "30D": "past 30 days", "90D": "past 90 days", All: "all time" };

const DONE_STATUSES = ["resolved", "completed", "closed"];

interface RawReport {
    id: string;
    status: string;
    ai_severity: number | null;
    reported_at: string;
    resolved_at: string | null;
    closed_at: string | null;
    assigned_at: string | null;
    citizen_id: string;
    category_id: number | null;
    ai_category_name: string | null;
}

interface Assignment {
    report_id: string;
    worker_id: string;
    assignment_status: string;
    assignment_priority: string;
    assigned_at: string | null;
    completed_at: string | null;
    rejected_at: string | null;
}

function filterByPeriod(reports: RawReport[], days: number): RawReport[] {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return reports.filter((r) => new Date(r.reported_at) >= cutoff);
}

function getEndDate(r: RawReport): string | null {
    return r.resolved_at || r.closed_at || null;
}

export default function AnalyticsPage() {
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>("30D");
    const [activePieIndex, setActivePieIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [allReports, setAllReports] = useState<RawReport[]>([]);
    const [catsMap, setCatsMap] = useState<Map<number, string>>(new Map());
    const [catGroupMap, setCatGroupMap] = useState<Map<number, string>>(new Map());
    const [locMap, setLocMap] = useState<Map<string, { city: string | null; neighbourhood: string | null }>>(new Map());
    const [assignmentsMap, setAssignmentsMap] = useState<Map<string, Assignment>>(new Map());
    const [citizenDates, setCitizenDates] = useState<string[]>([]);
    const [workers, setWorkers] = useState<WorkerWithProfile[]>([]);
    const [activeTab, setActiveTab] = useState("reports");

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [data, citizens, workersData] = await Promise.all([
                fetchAnalyticsData(),
                fetchCitizens(),
                fetchWorkers(),
            ]);
            setAllReports(data.reports);
            setCatsMap(data.catsMap);
            setCatGroupMap(data.catGroupMap);
            setLocMap(data.locMap);
            setAssignmentsMap(data.assignments);
            setCitizenDates(citizens.map((c) => c.created_at));
            setWorkers(workersData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load analytics");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const reports = useMemo(() => filterByPeriod(allReports, periodDays[selectedPeriod]), [allReports, selectedPeriod]);

    // ─── KPI Summary Stats ───
    const kpiStats = useMemo(() => {
        const total = reports.length;
        const done = reports.filter((r) => DONE_STATUSES.includes(r.status)).length;
        const pending = reports.filter((r) => r.status === "pending").length;
        const rejected = reports.filter((r) => r.status === "rejected").length;
        const inProgress = reports.filter((r) => r.status === "in_progress" || r.status === "assigned").length;
        const resolveRate = total > 0 ? Math.round((done / total) * 100) : 0;
        const resolved = reports.filter((r) => getEndDate(r));
        const avgHours = resolved.length > 0
            ? resolved.reduce((s, r) => s + (new Date(getEndDate(r)!).getTime() - new Date(r.reported_at).getTime()) / (1000 * 60 * 60), 0) / resolved.length
            : 0;
        const avgDays = Number((avgHours / 24).toFixed(1));
        const withSeverity = reports.filter((r) => r.ai_severity != null);
        const avgSeverity = withSeverity.length > 0 ? Number((withSeverity.reduce((s, r) => s + (r.ai_severity || 0), 0) / withSeverity.length).toFixed(1)) : 0;
        return { total, done, pending, rejected, inProgress, resolveRate, avgDays, avgSeverity };
    }, [reports]);

    // Volume data
    const volumeData = useMemo(() => {
        const buckets = new Map<string, { reports: number; resolved: number }>();
        for (const r of reports) {
            const d = r.reported_at.slice(0, 10);
            const b = buckets.get(d) || { reports: 0, resolved: 0 };
            b.reports++;
            buckets.set(d, b);
        }
        for (const r of reports) {
            const endDate = getEndDate(r);
            if (endDate) {
                const d = endDate.slice(0, 10);
                const b = buckets.get(d) || { reports: 0, resolved: 0 };
                b.resolved++;
                buckets.set(d, b);
            }
        }
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, v]) => ({
                month: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                reports: v.reports,
                resolved: v.resolved,
            }));
    }, [reports]);

    // Resolution time data
    const resolutionData = useMemo(() => {
        const resolved = reports.filter((r) => getEndDate(r));
        const buckets = new Map<string, { totalHours: number; count: number }>();
        for (const r of resolved) {
            const end = getEndDate(r)!;
            const d = end.slice(0, 10);
            const hours = (new Date(end).getTime() - new Date(r.reported_at).getTime()) / (1000 * 60 * 60);
            const b = buckets.get(d) || { totalHours: 0, count: 0 };
            b.totalHours += hours;
            b.count++;
            buckets.set(d, b);
        }
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, v]) => ({
                month: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                days: Number((v.totalHours / v.count / 24).toFixed(1)),
            }));
    }, [reports]);

    // Status distribution
    const statusData = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const r of reports) {
            const label = r.status === "resolved" ? "completed" : r.status;
            counts[label] = (counts[label] || 0) + 1;
        }
        const total = reports.length || 1;
        const colorMap: Record<string, string> = { completed: "#22c55e", in_progress: "#3b82f6", pending: "#f59e0b", closed: "#6b7280", open: "#60a5fa", assigned: "#8b5cf6", rejected: "#ef4444" };
        return Object.entries(counts).map(([name, count]) => ({
            name: name.replace("_", " "),
            value: Math.round((count / total) * 100),
            count,
            color: colorMap[name] || "#6b7280",
        }));
    }, [reports]);

    // Category efficiency — completion rate per category
    const categoryEfficiencyData = useMemo(() => {
        const catCounts: Record<string, { total: number; resolved: number }> = {};
        for (const r of reports) {
            const catName = r.category_id ? (catsMap.get(r.category_id) || "Other") : (r.ai_category_name || "Other");
            const c = catCounts[catName] || { total: 0, resolved: 0 };
            c.total++;
            if (DONE_STATUSES.includes(r.status)) c.resolved++;
            catCounts[catName] = c;
        }
        return Object.entries(catCounts)
            .sort(([, a], [, b]) => b.total - a.total)
            .slice(0, 8)
            .map(([category, v]) => ({
                category,
                total: v.total,
                resolved: v.resolved,
                rate: v.total > 0 ? Math.round((v.resolved / v.total) * 100) : 0,
            }));
    }, [reports, catsMap]);

    // Area performance — fixed
    const areaData = useMemo(() => {
        const areas: Record<string, { reports: number; resolved: number; totalHours: number; resolvedCount: number }> = {};
        for (const r of reports) {
            const loc = locMap.get(r.id);
            const area = loc?.city || loc?.neighbourhood || "Unknown";
            const a = areas[area] || { reports: 0, resolved: 0, totalHours: 0, resolvedCount: 0 };
            a.reports++;
            if (DONE_STATUSES.includes(r.status)) {
                a.resolved++;
                const end = getEndDate(r);
                if (end) {
                    a.totalHours += (new Date(end).getTime() - new Date(r.reported_at).getTime()) / (1000 * 60 * 60);
                    a.resolvedCount++;
                }
            }
            areas[area] = a;
        }
        return Object.entries(areas)
            .sort(([, a], [, b]) => b.reports - a.reports)
            .slice(0, 5)
            .map(([area, v]) => ({
                area,
                reports: v.reports,
                resolved: v.resolved,
                avgDays: v.resolvedCount > 0 ? Number((v.totalHours / v.resolvedCount / 24).toFixed(1)) : 0,
            }));
    }, [reports, locMap]);

    // Severity distribution
    const severityData = useMemo(() => {
        const counts = [0, 0, 0, 0, 0];
        for (const r of reports) {
            if (r.ai_severity && r.ai_severity >= 1 && r.ai_severity <= 5) {
                counts[r.ai_severity - 1]++;
            }
        }
        const labels = ["Low (1)", "Moderate (2)", "Medium (3)", "High (4)", "Critical (5)"];
        const colors = ["#22c55e", "#84cc16", "#f59e0b", "#f97316", "#ef4444"];
        return labels.map((label, i) => ({ name: label, count: counts[i], color: colors[i] }));
    }, [reports]);

    // Category Group Breakdown
    const categoryGroupData = useMemo(() => {
        const groups: Record<string, { total: number; resolved: number }> = {};
        for (const r of reports) {
            const group = r.category_id ? (catGroupMap.get(r.category_id) || "Other") : "Other";
            const g = groups[group] || { total: 0, resolved: 0 };
            g.total++;
            if (DONE_STATUSES.includes(r.status)) g.resolved++;
            groups[group] = g;
        }
        return Object.entries(groups)
            .sort(([, a], [, b]) => b.total - a.total)
            .map(([group, v]) => ({
                group: group.length > 18 ? group.slice(0, 18) + "…" : group,
                total: v.total,
                resolved: v.resolved,
                pending: v.total - v.resolved,
            }));
    }, [reports, catGroupMap]);

    // Cumulative reports trend
    const cumulativeData = useMemo(() => {
        const sorted = [...reports].sort((a, b) => a.reported_at.localeCompare(b.reported_at));
        const buckets = new Map<string, { cumReports: number; cumResolved: number }>();
        let cumR = 0, cumD = 0;
        for (const r of sorted) {
            const d = r.reported_at.slice(0, 10);
            cumR++;
            if (DONE_STATUSES.includes(r.status)) cumD++;
            buckets.set(d, { cumReports: cumR, cumResolved: cumD });
        }
        return Array.from(buckets.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-14)
            .map(([date, v]) => ({
                date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                cumReports: v.cumReports,
                cumResolved: v.cumResolved,
            }));
    }, [reports]);

    // Hourly heatmap data
    const hourlyData = useMemo(() => {
        const hours: number[] = new Array(24).fill(0);
        for (const r of reports) {
            const h = new Date(r.reported_at).getHours();
            hours[h]++;
        }
        return hours.map((count, hour) => ({
            hour: `${hour.toString().padStart(2, "0")}:00`,
            count,
        }));
    }, [reports]);

    // Day of week distribution
    const dayOfWeekData = useMemo(() => {
        const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const counts = new Array(7).fill(0);
        for (const r of reports) {
            counts[new Date(r.reported_at).getDay()]++;
        }
        return days.map((day, i) => ({ day: day.slice(0, 3), count: counts[i] }));
    }, [reports]);

    // Priority distribution from assignments
    const priorityData = useMemo(() => {
        const counts: Record<string, number> = { low: 0, normal: 0, high: 0, critical: 0 };
        for (const [, a] of assignmentsMap) {
            if (a.assignment_priority && counts[a.assignment_priority] !== undefined) {
                counts[a.assignment_priority]++;
            }
        }
        const colors: Record<string, string> = { low: "#6b7280", normal: "#3b82f6", high: "#f97316", critical: "#ef4444" };
        return Object.entries(counts)
            .filter(([, v]) => v > 0)
            .map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value, color: colors[name] }));
    }, [assignmentsMap]);

    // Top reporters (citizens)
    const topReportersData = useMemo(() => {
        const counter: Record<string, number> = {};
        for (const r of reports) {
            if (r.citizen_id) counter[r.citizen_id] = (counter[r.citizen_id] || 0) + 1;
        }
        return Object.entries(counter)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([id, count], rank) => ({ rank: rank + 1, citizenId: id.slice(0, 8) + "…", count }));
    }, [reports]);

    // Citizens growth data — cumulative by month
    const citizenGrowthData = useMemo(() => {
        const sorted = [...citizenDates].sort();
        if (sorted.length === 0) return [];

        const buckets = new Map<string, number>();
        for (const d of sorted) {
            const key = d.slice(0, 7); // YYYY-MM
            buckets.set(key, (buckets.get(key) || 0) + 1);
        }

        const months = Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b));
        let cumulative = 0;
        return months.map(([month, count]) => {
            cumulative += count;
            return {
                month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
                newCitizens: count,
                totalCitizens: cumulative,
            };
        });
    }, [citizenDates]);

    const totalCitizens = citizenDates.length;
    const thisMonthCitizens = citizenDates.filter((d) => {
        const now = new Date();
        const created = new Date(d);
        return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;

    // Worker analytics data
    const workerStats = useMemo(() => {
        const total = workers.length;
        const available = workers.filter((w) => w.worker_profile?.is_available).length;
        const totalCompleted = workers.reduce((s, w) => s + (w.worker_profile?.total_completed || 0), 0);
        const totalRejected = workers.reduce((s, w) => s + (w.worker_profile?.total_rejected || 0), 0);
        const avgRating = total > 0 ? workers.reduce((s, w) => s + (w.worker_profile?.avg_rating || 0), 0) / total : 0;
        const totalTasks = workers.reduce((s, w) => s + (w.worker_profile?.current_task_count || 0), 0);
        return { total, available, totalCompleted, totalRejected, avgRating, totalTasks };
    }, [workers]);

    const workerPerformanceData = useMemo(() => {
        return workers
            .filter((w) => w.worker_profile)
            .sort((a, b) => (b.worker_profile?.total_completed || 0) - (a.worker_profile?.total_completed || 0))
            .slice(0, 10)
            .map((w) => ({
                name: (w.full_name || "Unknown").split(" ")[0],
                completed: w.worker_profile?.total_completed || 0,
                rejected: w.worker_profile?.total_rejected || 0,
                rating: w.worker_profile?.avg_rating || 0,
            }));
    }, [workers]);

    const workerServiceAreaData = useMemo(() => {
        const areas: Record<string, { count: number; completed: number; available: number }> = {};
        for (const w of workers) {
            const area = w.worker_profile?.service_area || "Unassigned";
            const a = areas[area] || { count: 0, completed: 0, available: 0 };
            a.count++;
            a.completed += w.worker_profile?.total_completed || 0;
            if (w.worker_profile?.is_available) a.available++;
            areas[area] = a;
        }
        return Object.entries(areas)
            .sort(([, a], [, b]) => b.count - a.count)
            .map(([area, v]) => ({ area, ...v }));
    }, [workers]);

    const workerWorkloadData = useMemo(() => {
        const buckets = { light: 0, moderate: 0, heavy: 0, maxed: 0 };
        for (const w of workers) {
            const current = w.worker_profile?.current_task_count || 0;
            const max = w.worker_profile?.max_task_limit || 5;
            const ratio = current / max;
            if (ratio === 0) buckets.light++;
            else if (ratio < 0.5) buckets.moderate++;
            else if (ratio < 1) buckets.heavy++;
            else buckets.maxed++;
        }
        return [
            { name: "Idle", value: buckets.light, color: "#6b7280" },
            { name: "Moderate", value: buckets.moderate, color: "#3b82f6" },
            { name: "Heavy", value: buckets.heavy, color: "#f59e0b" },
            { name: "At Capacity", value: buckets.maxed, color: "#ef4444" },
        ].filter((d) => d.value > 0);
    }, [workers]);

    const downloadBlob = (content: string, filename: string, type: string) => {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getExportCSVContent = (): { csv: string; filename: string } => {
        const stamp = new Date().toISOString().slice(0, 10);
        if (activeTab === "reports") {
            const headers = ["ID", "Status", "Severity", "Category", "Reported At", "Resolved At", "Citizen ID"];
            const rows = reports.map((r) => [
                r.id,
                r.status,
                String(r.ai_severity ?? ""),
                r.category_id ? (catsMap.get(r.category_id) || "") : (r.ai_category_name || ""),
                new Date(r.reported_at).toLocaleDateString(),
                getEndDate(r) ? new Date(getEndDate(r)!).toLocaleDateString() : "",
                r.citizen_id || "",
            ]);
            return { csv: [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), filename: `civicsight-reports-analytics-${selectedPeriod}-${stamp}.csv` };
        } else if (activeTab === "citizens") {
            const headers = ["Month", "New Citizens", "Total Citizens"];
            const rows = citizenGrowthData.map((d) => [d.month, String(d.newCitizens), String(d.totalCitizens)]);
            return { csv: [headers, ...rows].map((r) => r.join(",")).join("\n"), filename: `civicsight-citizen-growth-${stamp}.csv` };
        } else {
            const headers = ["Name", "Service Area", "Completed", "Rejected", "Rating", "Available"];
            const rows = workers.map((w) => [
                w.full_name || "Unknown",
                w.worker_profile?.service_area || "Unassigned",
                String(w.worker_profile?.total_completed || 0),
                String(w.worker_profile?.total_rejected || 0),
                String(w.worker_profile?.avg_rating?.toFixed(1) || "0"),
                w.worker_profile?.is_available ? "Yes" : "No",
            ]);
            return { csv: [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n"), filename: `civicsight-worker-performance-${stamp}.csv` };
        }
    };

    const handleExportCSV = () => {
        const { csv, filename } = getExportCSVContent();
        downloadBlob(csv, filename, "text/csv");
    };

    const contentRef = useRef<HTMLDivElement>(null);

    const handleExportPDF = async () => {
        try {
            if (!contentRef.current) {
                console.error("PDF Export: contentRef is null");
                return;
            }
            const html2canvasModule = await import("html2canvas");
            const html2canvas: (element: HTMLElement, options?: Record<string, unknown>) => Promise<HTMLCanvasElement> =
                typeof html2canvasModule === "function" ? html2canvasModule : (html2canvasModule as any).default;
            if (typeof html2canvas !== "function") {
                console.error("PDF Export: html2canvas is not a function", html2canvasModule);
                return;
            }
            const { default: jsPDF } = await import("jspdf");
            const stamp = new Date().toISOString().slice(0, 10);

        const canvas = await html2canvas(contentRef.current, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/png");
        const doc = new jsPDF({ orientation: "landscape" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 10;
        const usableWidth = pageWidth - 2 * margin;
        const usableHeight = pageHeight - 2 * margin;
        const ratio = usableWidth / canvas.width;
        const scaledHeight = canvas.height * ratio;

        if (scaledHeight <= usableHeight) {
            doc.addImage(imgData, "PNG", margin, margin, usableWidth, scaledHeight);
        } else {
            const pageCanvasHeight = usableHeight / ratio;
            let yOffset = 0;
            let pageNum = 0;
            while (yOffset < canvas.height) {
                if (pageNum > 0) doc.addPage();
                const sliceH = Math.min(pageCanvasHeight, canvas.height - yOffset);
                const sliceCanvas = document.createElement("canvas");
                sliceCanvas.width = canvas.width;
                sliceCanvas.height = sliceH;
                const ctx = sliceCanvas.getContext("2d");
                ctx?.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
                doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, margin, usableWidth, sliceH * ratio);
                yOffset += pageCanvasHeight;
                pageNum++;
            }
        }
        doc.save(`civicsight-${activeTab}-analytics-${stamp}.pdf`);
        } catch (err) {
            console.error("PDF Export failed:", err);
            alert("PDF export failed: " + (err instanceof Error ? err.message : String(err)));
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading analytics...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <p className="text-sm text-destructive">{error}</p>
                <Button size="sm" onClick={loadData}>Retry</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="flex items-center justify-between">
                    <TabsList className="grid w-80 grid-cols-3 h-9">
                        <TabsTrigger value="reports" className="text-xs">Reports</TabsTrigger>
                        <TabsTrigger value="citizens" className="text-xs">Citizens</TabsTrigger>
                        <TabsTrigger value="workers" className="text-xs">Workers</TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-2">
                        {activeTab === "reports" && (["7D", "30D", "90D", "All"] as PeriodKey[]).map((period) => (
                            <Button
                                key={period}
                                variant={period === selectedPeriod ? "default" : "ghost"}
                                size="sm"
                                className="text-xs h-8 px-3"
                                onClick={() => setSelectedPeriod(period)}
                            >
                                {period}
                            </Button>
                        ))}
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm" className="text-xs h-8 gap-1.5">
                                    <Download className="w-3.5 h-3.5" /> Export <ChevronDown className="w-3 h-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={handleExportPDF}>
                                    <FileText className="w-3.5 h-3.5 mr-2" /> Export as PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleExportCSV}>
                                    <FileSpreadsheet className="w-3.5 h-3.5 mr-2" /> Export as CSV
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div ref={contentRef}>
                {/* ─── REPORTS TAB ─── */}
                <TabsContent value="reports" className="mt-4 space-y-4">

            {/* KPI Cards Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Total Reports</p>
                                <p className="text-2xl font-bold mt-1">{kpiStats.total}</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-primary" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <span>{kpiStats.pending} pending</span>
                            <span>·</span>
                            <span>{kpiStats.inProgress} in progress</span>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Resolution Rate</p>
                                <p className="text-2xl font-bold mt-1">{kpiStats.resolveRate}%</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                                <Target className="w-5 h-5 text-green-500" />
                            </div>
                        </div>
                        <div className="flex items-center gap-1 mt-2">
                            <div className={`flex items-center gap-0.5 text-xs ${kpiStats.resolveRate >= 50 ? "text-green-500" : "text-destructive"}`}>
                                {kpiStats.resolveRate >= 50 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                                {kpiStats.done} resolved
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Avg Resolution</p>
                                <p className="text-2xl font-bold mt-1">{kpiStats.avgDays}d</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                <Clock className="w-5 h-5 text-blue-500" />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">average time to close</p>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs text-muted-foreground font-medium">Avg Severity</p>
                                <p className="text-2xl font-bold mt-1">{kpiStats.avgSeverity}/5</p>
                            </div>
                            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <Zap className="w-5 h-5 text-amber-500" />
                            </div>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(kpiStats.avgSeverity / 5) * 100}%` }} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 1: Volume + Resolution Time */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Report Volume</CardTitle>
                        <p className="text-xs text-muted-foreground">New reports vs completed over the {periodLabels[selectedPeriod]}</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-70">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={volumeData} barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                                    <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                    <Bar dataKey="reports" fill="#e88c30" radius={[4, 4, 0, 0]} name="New Reports" />
                                    <Bar dataKey="resolved" fill="#22c55e" radius={[4, 4, 0, 0]} name="Completed" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Average Resolution Time</CardTitle>
                        <p className="text-xs text-muted-foreground">Days to resolve, {periodLabels[selectedPeriod]}</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-70">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={resolutionData}>
                                    <defs>
                                        <linearGradient id="resGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                                    <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" domain={[0, "auto"]} tickFormatter={(v) => `${v}d`} />
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number | undefined) => [`${v ?? 0} days`, "Avg Resolution"]} />
                                    <Area type="monotone" dataKey="days" stroke="#22c55e" strokeWidth={2.5} fill="url(#resGradient)" dot={{ r: 4, fill: "#22c55e" }} activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 2: Status + Radar + Area Performance */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Status Distribution</CardTitle>
                        <p className="text-xs text-muted-foreground">Report status breakdown ({periodLabels[selectedPeriod]})</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-50">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={statusData} cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={80} paddingAngle={4}
                                        dataKey="value" strokeWidth={0}
                                        // @ts-expect-error activeIndex valid Recharts prop
                                        activeIndex={activePieIndex ?? undefined}
                                        activeShape={(props: any) => {
                                            const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                                            return <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={(outerRadius as number) + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} strokeWidth={0} />;
                                        }}
                                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                                        onMouseLeave={() => setActivePieIndex(null)}
                                    >
                                        {statusData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} opacity={activePieIndex === null || activePieIndex === index ? 1 : 0.3} style={{ transition: "opacity 0.2s ease" }} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number | undefined, name?: string) => [`${v ?? 0}%`, name ?? ""]} cursor={false} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                            {statusData.map((item) => (
                                <div key={item.name} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-muted-foreground capitalize">{item.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">{item.count}</span>
                                        <span className="font-medium">{item.value}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Resolution Efficiency</CardTitle>
                        <p className="text-xs text-muted-foreground">Completion rate by category</p>
                    </CardHeader>
                    <CardContent>
                        {categoryEfficiencyData.length > 0 ? (
                        <div className="space-y-3 mt-1">
                            {categoryEfficiencyData.map((cat) => (
                                <div key={cat.category} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-medium truncate max-w-[60%]">{cat.category}</span>
                                        <span className="text-muted-foreground shrink-0 ml-2">{cat.rate}% · {cat.resolved}/{cat.total}</span>
                                    </div>
                                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${cat.rate}%`,
                                                background: cat.rate >= 60 ? "#22c55e" : cat.rate >= 30 ? "#f59e0b" : "#ef4444",
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        ) : (
                            <div className="h-70 flex items-center justify-center text-muted-foreground text-xs">No category data available</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Area Performance</CardTitle>
                        <p className="text-xs text-muted-foreground">Reports & resolution by district</p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 mt-2">
                            {areaData.map((area) => {
                                const resolveRate = area.reports > 0 ? Math.round((area.resolved / area.reports) * 100) : 0;
                                return (
                                    <div key={area.area} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium">{area.area}</span>
                                            <span className="text-muted-foreground">{resolveRate}% resolved · {area.avgDays}d avg</span>
                                        </div>
                                        <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
                                            <div className="h-full rounded-full bg-linear-to-r from-primary to-primary/70 transition-all duration-500" style={{ width: `${resolveRate}%` }} />
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                            <span>{area.resolved} resolved</span>
                                            <span>{area.reports} total</span>
                                        </div>
                                    </div>
                                );
                            })}
                            {areaData.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">No location data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 3: Category Groups + Severity Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Reports by Category Group</CardTitle>
                        <p className="text-xs text-muted-foreground">Volume breakdown by infrastructure type</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categoryGroupData} layout="vertical" barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
                                    <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <YAxis type="category" dataKey="group" fontSize={10} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" width={110} />
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                    <Bar dataKey="resolved" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} name="Resolved" />
                                    <Bar dataKey="pending" stackId="a" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Pending" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Severity Distribution</CardTitle>
                        <p className="text-xs text-muted-foreground">AI-assessed severity levels</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={severityData} barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                                    <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                    <Bar dataKey="count" name="Reports" radius={[4, 4, 0, 0]}>
                                        {severityData.map((entry, index) => (
                                            <Cell key={`sev-${index}`} fill={entry.color} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 4: Cumulative + Hourly/Day Patterns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Cumulative Progress</CardTitle>
                        <p className="text-xs text-muted-foreground">Total reports vs completed over time</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-70">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={cumulativeData}>
                                    <defs>
                                        <linearGradient id="cumReportGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#e88c30" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#e88c30" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="cumResolvedGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                                    <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                                    <Area type="monotone" dataKey="cumReports" stroke="#e88c30" strokeWidth={2} fill="url(#cumReportGrad)" name="Total Reports" />
                                    <Area type="monotone" dataKey="cumResolved" stroke="#22c55e" strokeWidth={2} fill="url(#cumResolvedGrad)" name="Total Completed" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Reporting Patterns</CardTitle>
                        <p className="text-xs text-muted-foreground">When citizens report issues</p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">By Hour of Day</p>
                            <div className="h-28">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={hourlyData}>
                                        <XAxis dataKey="hour" fontSize={8} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.3)" interval={2} />
                                        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number | undefined) => [`${v ?? 0} reports`, "Count"]} />
                                        <Bar dataKey="count" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">By Day of Week</p>
                            <div className="h-28">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={dayOfWeekData}>
                                        <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.3)" />
                                        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number | undefined) => [`${v ?? 0} reports`, "Count"]} />
                                        <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 5: Priority + Top Reporters */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Assignment Priority</CardTitle>
                        <p className="text-xs text-muted-foreground">How tasks are prioritized</p>
                    </CardHeader>
                    <CardContent>
                        {priorityData.length > 0 ? (
                        <>
                        <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={priorityData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={4} dataKey="value" strokeWidth={0}>
                                        {priorityData.map((entry, index) => (
                                            <Cell key={`pri-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number | undefined, name?: string) => [`${v ?? 0} tasks`, name ?? ""]} cursor={false} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                            {priorityData.map((item) => (
                                <div key={item.name} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-muted-foreground">{item.name}</span>
                                    </div>
                                    <span className="font-medium">{item.value}</span>
                                </div>
                            ))}
                        </div>
                        </>
                        ) : (
                            <div className="h-48 flex items-center justify-center text-muted-foreground text-xs">No assignment data available</div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">Top Reporters</CardTitle>
                        <p className="text-xs text-muted-foreground">Most active citizens by report count</p>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3 mt-2">
                            {topReportersData.map((reporter) => (
                                <div key={reporter.citizenId} className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                        #{reporter.rank}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-mono text-muted-foreground">{reporter.citizenId}</span>
                                            <Badge variant="secondary" className="text-[10px]">{reporter.count} reports</Badge>
                                        </div>
                                        <div className="w-full h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden">
                                            <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${topReportersData.length > 0 ? (reporter.count / topReportersData[0].count) * 100 : 0}%` }} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {topReportersData.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">No report data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

                </TabsContent>

                {/* ─── CITIZENS TAB ─── */}
                <TabsContent value="citizens" className="mt-4 space-y-4">
                    {/* Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card className="border-border/50">
                            <CardContent className="p-6 flex flex-col justify-between h-full">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium">Total Citizens</p>
                                        <p className="text-3xl font-bold mt-1">{totalCitizens}</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                                        <Users className="w-6 h-6 text-primary" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-4">
                                    <div className="flex items-center gap-1 text-xs text-success">
                                        <TrendingUp className="w-3.5 h-3.5" />
                                        +{thisMonthCitizens}
                                    </div>
                                    <span className="text-xs text-muted-foreground">new this month</span>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardContent className="p-6">
                                <p className="text-xs text-muted-foreground font-medium">Average per Month</p>
                                <p className="text-3xl font-bold mt-1">
                                    {citizenGrowthData.length > 0
                                        ? Math.round(totalCitizens / citizenGrowthData.length)
                                        : 0}
                                </p>
                                <p className="text-xs text-muted-foreground mt-4">citizen sign-ups</p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardContent className="p-6">
                                <p className="text-xs text-muted-foreground font-medium">Peak Month</p>
                                {citizenGrowthData.length > 0 ? (() => {
                                    const peak = citizenGrowthData.reduce((max, d) => d.newCitizens > max.newCitizens ? d : max);
                                    return (
                                        <>
                                            <p className="text-3xl font-bold mt-1">{peak.newCitizens}</p>
                                            <p className="text-xs text-muted-foreground mt-4">{peak.month}</p>
                                        </>
                                    );
                                })() : <p className="text-3xl font-bold mt-1">0</p>}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Growth Chart */}
                    <Card className="border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Citizen Growth</CardTitle>
                            <p className="text-xs text-muted-foreground">Cumulative citizen registrations over time</p>
                        </CardHeader>
                        <CardContent>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={citizenGrowthData}>
                                        <defs>
                                            <linearGradient id="citizenGradient" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                                        <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                        <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                        <Tooltip
                                            contentStyle={tooltipStyle}
                                            labelStyle={tooltipLabelStyle}
                                            itemStyle={tooltipItemStyle}
                                            formatter={(value: number | undefined, name?: string) => [
                                                value ?? 0,
                                                name === "totalCitizens" ? "Total Citizens" : "New Citizens",
                                            ]}
                                        />
                                        <Area type="monotone" dataKey="totalCitizens" stroke="#3b82f6" strokeWidth={2.5} fill="url(#citizenGradient)" name="totalCitizens" />
                                        <Bar dataKey="newCitizens" fill="#3b82f6" opacity={0.4} radius={[3, 3, 0, 0]} name="newCitizens" barSize={20} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Monthly Breakdown Table */}
                    <Card className="border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Monthly Registrations</CardTitle>
                            <p className="text-xs text-muted-foreground">New citizens per month</p>
                        </CardHeader>
                        <CardContent>
                            <div className="h-62.5">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={citizenGrowthData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" vertical={false} />
                                        <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                        <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                        <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                        <Bar dataKey="newCitizens" fill="#8b5cf6" radius={[4, 4, 0, 0]} name="New Citizens" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ─── WORKERS TAB ─── */}
                <TabsContent value="workers" className="mt-4 space-y-4">
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="border-border/50">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium">Total Workers</p>
                                        <p className="text-2xl font-bold mt-1">{workerStats.total}</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                                        <Briefcase className="w-5 h-5 text-info" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">{workerStats.available} available now</p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium">Total Completed</p>
                                        <p className="text-2xl font-bold mt-1">{workerStats.totalCompleted}</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                                        <CheckCircle className="w-5 h-5 text-success" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">{workerStats.totalRejected} rejected</p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium">Avg Rating</p>
                                        <p className="text-2xl font-bold mt-1">{workerStats.avgRating.toFixed(1)}</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                                        <Star className="w-5 h-5 text-warning" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">out of 5.0</p>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-muted-foreground font-medium">Active Tasks</p>
                                        <p className="text-2xl font-bold mt-1">{workerStats.totalTasks}</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                        <ClipboardList className="w-5 h-5 text-primary" />
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">in progress</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Worker Performance Chart */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold">Top Worker Performance</CardTitle>
                                <p className="text-xs text-muted-foreground">Completed vs rejected tasks by worker</p>
                            </CardHeader>
                            <CardContent>
                                <div className="h-75">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={workerPerformanceData} layout="vertical" barGap={2}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
                                            <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" />
                                            <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} stroke="rgba(128,128,128,0.4)" width={70} />
                                            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                                            <Bar dataKey="completed" fill="#22c55e" radius={[0, 4, 4, 0]} name="Completed" />
                                            <Bar dataKey="rejected" fill="#ef4444" radius={[0, 4, 4, 0]} name="Rejected" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold">Workload Distribution</CardTitle>
                                <p className="text-xs text-muted-foreground">Current task load across workers</p>
                            </CardHeader>
                            <CardContent>
                                <div className="h-55">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={workerWorkloadData} cx="50%" cy="50%"
                                                innerRadius={55} outerRadius={80} paddingAngle={4}
                                                dataKey="value" strokeWidth={0}
                                            >
                                                {workerWorkloadData.map((entry, index) => (
                                                    <Cell key={`wl-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: number | undefined, name?: string) => [`${v ?? 0} workers`, name ?? ""]} cursor={false} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="space-y-2">
                                    {workerWorkloadData.map((item) => (
                                        <div key={item.name} className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                                <span className="text-muted-foreground">{item.name}</span>
                                            </div>
                                            <span className="font-medium">{item.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Service Area Breakdown */}
                    <Card className="border-border/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-semibold">Workers by Service Area</CardTitle>
                            <p className="text-xs text-muted-foreground">Distribution and performance per area</p>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4 mt-2">
                                {workerServiceAreaData.map((area) => (
                                    <div key={area.area} className="space-y-1.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-medium">{area.area}</span>
                                            <span className="text-muted-foreground">
                                                {area.count} workers · {area.available} available · {area.completed} completed
                                            </span>
                                        </div>
                                        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-linear-to-r from-info to-info/70 transition-all duration-500"
                                                style={{ width: `${workers.length > 0 ? Math.round((area.count / workers.length) * 100) : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                {workerServiceAreaData.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4">No worker data available</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
