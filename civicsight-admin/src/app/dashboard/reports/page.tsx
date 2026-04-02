"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
    Search,
    Filter,
    MoreHorizontal,
    Eye,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    ArrowUpDown,
    Download,
    SlidersHorizontal,
    MapPin,
    Calendar,
    User,
    UserPlus,
    Loader2,
    AlertTriangle,
    ImageIcon,
    XCircle,
    MessageSquare,
    ZoomIn,
    ZoomOut,
    X,
    FileSpreadsheet,
    CheckSquare,
    Square,
    MinusSquare,
    SearchX,
} from "lucide-react";
import { toast } from "sonner";
import { APIProvider, Map as GoogleMap, AdvancedMarker, Pin } from "@vis.gl/react-google-maps";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useSearchParams } from "next/navigation";
import {
    fetchReports,
    fetchWorkers,
    fetchCategories,
    updateReportStatus as updateReportStatusDb,
    assignWorkerToReport,
    getCurrentAdmin,
    fetchComments,
    postComment,
} from "@/lib/queries";
import type {
    ReportWithDetails,
    WorkerWithProfile,
    DbCategory,
    ReportStatus,
    AssignmentPriority,
} from "@/lib/types";
import type { Comment } from "@/lib/queries";
import { supabase } from "@/lib/supabase";

const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning border-warning/20",
    open: "bg-info/10 text-info border-info/20",
    assigned: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    in_progress: "bg-info/10 text-info border-info/20",
    resolved: "bg-success/10 text-success border-success/20",
    completed: "bg-success/10 text-success border-success/20",
    closed: "bg-muted text-muted-foreground border-border",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const priorityColors: Record<string, string> = {
    critical: "bg-destructive/10 text-destructive",
    high: "bg-destructive/10 text-destructive",
    medium: "bg-warning/10 text-warning",
    low: "bg-muted text-muted-foreground",
    normal: "bg-muted text-muted-foreground",
};

function getSeverityLabel(severity: number | null): string {
    if (!severity) return "Unknown";
    if (severity >= 5) return "Critical";
    if (severity >= 4) return "High";
    if (severity >= 3) return "Medium";
    return "Low";
}

// Category icon mapping based on category name / group
function getCategoryIcon(categoryName?: string, categoryGroup?: string): string {
    const name = (categoryName || "").toLowerCase();
    const group = (categoryGroup || "").toLowerCase();

    // Specific category icons
    const categoryIcons: Record<string, string> = {
        pothole: "🕳️",
        "road crack & surface damage": "🛣️",
        "sidewalk & curb damage": "🚶",
        "faded road markings": "🚧",
        "damaged road sign": "🪧",
        "damaged traffic signal": "🚦",
        "water leak": "💧",
        "flooding & standing water": "🌊",
        "blocked catch basin": "🔲",
        "manhole issue": "⚠️",
        "overflowing litter bin": "🗑️",
        "illegal dumping": "🚮",
        graffiti: "🎨",
        "debris on road": "⚠️",
        "fallen tree or branch": "🌳",
        "dead or hazardous tree": "🪵",
        "tree root damage": "🌿",
        "damaged playground equipment": "🛝",
        "damaged park amenity": "🏞️",
        "damaged bus shelter": "🚏",
        "dead animal": "🐾",
        "snow or ice on road": "❄️",
        "snow or ice on sidewalk": "🧊",
        "property standards violation": "🏚️",
        "unsafe construction site": "🏗️",
        "abandoned vehicle": "🚗",
        "electrical hazard": "⚡",
        "damaged utility box": "📦",
        "accessibility barrier": "♿",
    };

    if (categoryIcons[name]) return categoryIcons[name];

    // Fallback to group icons
    const groupIcons: Record<string, string> = {
        "roads & transportation": "🛣️",
        "water & drainage": "💧",
        "waste & cleanliness": "🗑️",
        "trees & green spaces": "🌳",
        "parks & public spaces": "🏞️",
        "winter maintenance": "❄️",
        "property & safety": "🏠",
        "utilities & infrastructure": "⚡",
    };

    if (groupIcons[group]) return groupIcons[group];

    return "📋";
}

function getPriorityFromSeverity(severity: number | null): string {
    if (!severity) return "normal";
    if (severity >= 5) return "critical";
    if (severity >= 4) return "high";
    if (severity >= 3) return "medium";
    return "low";
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

const ITEMS_PER_PAGE = 25;

export default function ReportsPage() {
    const searchParams = useSearchParams();
    const workerFilter = searchParams.get("worker");
    const citizenFilter = searchParams.get("citizen");
    const [reports, setReports] = useState<ReportWithDetails[]>([]);
    const [workers, setWorkers] = useState<WorkerWithProfile[]>([]);
    const [categories, setCategories] = useState<DbCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [adminId, setAdminId] = useState<string | null>(null);

    const [selectedReport, setSelectedReport] = useState<ReportWithDetails | null>(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [severityFilter, setSeverityFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [detailStatus, setDetailStatus] = useState("");
    const [assignDialog, setAssignDialog] = useState<ReportWithDetails | null>(null);
    const [assignPriority, setAssignPriority] = useState<AssignmentPriority>("normal");
    const [assignNote, setAssignNote] = useState("");
    const [assigning, setAssigning] = useState(false);
    const [rejectDialog, setRejectDialog] = useState<ReportWithDetails | null>(null);
    const [rejectNote, setRejectNote] = useState("");
    const [rejecting, setRejecting] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [sortField, setSortField] = useState<"report_number" | "severity" | "reported_at">("reported_at");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

    // Image lightbox state
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const panStart = useRef({ x: 0, y: 0 });
    const offsetStart = useRef({ x: 0, y: 0 });

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentText, setCommentText] = useState("");
    const [loadingComments, setLoadingComments] = useState(false);
    const [sendingComment, setSendingComment] = useState(false);
    const commentsEndRef = useRef<HTMLDivElement>(null);

    const openLightbox = (url: string) => {
        setLightboxUrl(url);
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
    };

    const closeLightbox = () => {
        setLightboxUrl(null);
        setZoomLevel(1);
        setPanOffset({ x: 0, y: 0 });
    };

    const handleLightboxWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setZoomLevel((prev) => Math.min(5, Math.max(0.5, prev + (e.deltaY < 0 ? 0.3 : -0.3))));
    };

    const handleLightboxPointerDown = (e: React.PointerEvent) => {
        if (zoomLevel <= 1) return;
        setIsPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY };
        offsetStart.current = { ...panOffset };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handleLightboxPointerMove = (e: React.PointerEvent) => {
        if (!isPanning) return;
        setPanOffset({
            x: offsetStart.current.x + (e.clientX - panStart.current.x),
            y: offsetStart.current.y + (e.clientY - panStart.current.y),
        });
    };

    const handleLightboxPointerUp = () => {
        setIsPanning(false);
    };

    // ─── Comments helpers ─────────────────────────────────
    const loadComments = useCallback(async (reportId: string) => {
        setLoadingComments(true);
        try {
            const data = await fetchComments(reportId);
            setComments(data);
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } catch {
            toast.error("Failed to load comments");
        } finally {
            setLoadingComments(false);
        }
    }, []);

    const handleSendComment = async () => {
        if (!commentText.trim() || !selectedReport) return;
        let currentAdminId = adminId;
        if (!currentAdminId) {
            // Retry fetching admin session
            const admin = await getCurrentAdmin();
            if (admin) {
                setAdminId(admin.uid);
                currentAdminId = admin.uid;
            } else {
                toast.error("Admin session expired. Please log in again.");
                return;
            }
        }
        setSendingComment(true);
        try {
            const newComment = await postComment(selectedReport.id, currentAdminId, commentText.trim());
            setComments((prev) => [...prev, newComment]);
            setCommentText("");
            setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to send comment");
        } finally {
            setSendingComment(false);
        }
    };

    // Realtime subscription + 60s fallback poll when dialog is open
    useEffect(() => {
        if (!selectedReport) {
            setComments([]);
            setCommentText("");
            return;
        }

        loadComments(selectedReport.id);

        // Realtime: fires immediately when a new comment is inserted
        const channel = supabase
            .channel(`comments:${selectedReport.id}`)
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "comments",
                    filter: `report_id=eq.${selectedReport.id}`,
                },
                () => {
                    // Re-fetch to get author_name from the backend join
                    loadComments(selectedReport.id);
                }
            )
            .subscribe();

        // Fallback poll every 60s in case Realtime drops
        const interval = setInterval(() => loadComments(selectedReport.id), 60_000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(interval);
        };
    }, [selectedReport, loadComments]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [reportsData, workersData, catsData, admin] = await Promise.all([
                fetchReports(),
                fetchWorkers(),
                fetchCategories(),
                getCurrentAdmin(),
            ]);
            setReports(reportsData);
            setWorkers(workersData);
            setCategories(catsData);
            if (admin) setAdminId(admin.uid);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Apply filters from notification query params
    useEffect(() => {
        const statusParam = searchParams.get("status");
        const severityParam = searchParams.get("severity");
        if (statusParam) setStatusFilter(statusParam);
        if (severityParam) setSeverityFilter(severityParam);
    }, [searchParams]);

    // Filter logic
    const filteredReports = reports.filter((r) => {
        if (workerFilter && r.assigned_worker_id !== workerFilter && r.assignment?.worker_id !== workerFilter) return false;
        if (citizenFilter && r.citizen_id !== citizenFilter) return false;
        if (statusFilter !== "all" && statusFilter === "completed"
            ? (r.status !== "resolved" && r.status !== "completed")
            : (statusFilter !== "all" && r.status !== statusFilter)) return false;
        if (categoryFilter !== "all" && r.category?.category_group !== categoryFilter) return false;
        if (severityFilter !== "all" && getSeverityLabel(r.ai_severity).toLowerCase() !== severityFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const matchId = `RPT-${r.report_number}`.toLowerCase().includes(q);
            const matchDesc = r.description.toLowerCase().includes(q);
            const matchCitizen = r.citizen?.full_name?.toLowerCase().includes(q);
            const matchCategory = r.category?.name?.toLowerCase().includes(q);
            if (!matchId && !matchDesc && !matchCitizen && !matchCategory) return false;
        }
        return true;
    });

    // Sort
    const sortedReports = [...filteredReports].sort((a, b) => {
        let cmp = 0;
        if (sortField === "report_number") {
            cmp = (a.report_number ?? 0) - (b.report_number ?? 0);
        } else if (sortField === "severity") {
            cmp = (a.ai_severity ?? 0) - (b.ai_severity ?? 0);
        } else {
            cmp = new Date(a.reported_at).getTime() - new Date(b.reported_at).getTime();
        }
        return sortDir === "asc" ? cmp : -cmp;
    });

    // Pagination
    const totalPages = Math.max(1, Math.ceil(sortedReports.length / ITEMS_PER_PAGE));
    const paginatedReports = sortedReports.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Reset page when filter changes
    const handleFilterChange = (setter: (v: string) => void, value: string) => {
        setter(value);
        setCurrentPage(1);
    };

    // Base reports to count from (respecting user filter)
    const baseReports = reports.filter((r) => {
        if (workerFilter && r.assigned_worker_id !== workerFilter && r.assignment?.worker_id !== workerFilter) return false;
        if (citizenFilter && r.citizen_id !== citizenFilter) return false;
        return true;
    });

    const statusCounts = {
        all: baseReports.length,
        pending: baseReports.filter((r) => r.status === "pending").length,
        open: baseReports.filter((r) => r.status === "open").length,
        assigned: baseReports.filter((r) => r.status === "assigned").length,
        in_progress: baseReports.filter((r) => r.status === "in_progress").length,
        completed: baseReports.filter((r) => r.status === "resolved" || r.status === "completed").length,
        closed: baseReports.filter((r) => r.status === "closed").length,
        rejected: baseReports.filter((r) => r.status === "rejected").length,
    };

    // Bulk selection helpers
    const toggleSelect = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === paginatedReports.filter((r) => r.status !== "closed").length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(paginatedReports.filter((r) => r.status !== "closed").map((r) => r.id)));
        }
    };

    const handleBulkStatus = async (newStatus: ReportStatus) => {
        const ids = [...selectedIds].filter((id) => {
            const r = reports.find((rep) => rep.id === id);
            return r?.status !== "closed";
        });
        if (ids.length === 0) {
            toast.error("No eligible reports — closed reports cannot be modified.");
            return;
        }
        try {
            await Promise.all(ids.map((id) => updateReportStatusDb(id, newStatus)));
            setReports((prev) =>
                prev.map((r) => (ids.includes(r.id) ? { ...r, status: newStatus } : r))
            );
            toast.success(`${ids.length} report${ids.length > 1 ? "s" : ""} marked as ${newStatus.replace("_", " ")}`);
            setSelectedIds(new Set());
        } catch (err) {
            toast.error("Failed to update some reports");
        }
    };

    // Update report status
    const handleUpdateStatus = async (reportId: string, newStatus: ReportStatus, rejectionNote?: string) => {
        const report = reports.find((r) => r.id === reportId);
        if (report?.status === "closed") return;
        try {
            await updateReportStatusDb(reportId, newStatus, rejectionNote);
            setReports((prev) =>
                prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r))
            );
            if (selectedReport?.id === reportId) {
                setSelectedReport((prev) => (prev ? { ...prev, status: newStatus } : null));
                setDetailStatus(newStatus);
            }
            toast.success(`RPT-${report?.report_number || ""} marked as ${newStatus.replace("_", " ")}`);
        } catch (err) {
            toast.error(`Failed to update report status`);
        }
    };

    // Reject report with note
    const handleRejectReport = async () => {
        if (!rejectDialog || !rejectNote.trim()) return;
        try {
            setRejecting(true);
            await handleUpdateStatus(rejectDialog.id, "rejected", rejectNote.trim());
            setRejectDialog(null);
            setRejectNote("");
        } catch (err) {
            toast.error("Failed to reject report");
        } finally {
            setRejecting(false);
        }
    };

    // Save changes from detail dialog
    const handleSaveChanges = async () => {
        if (selectedReport && detailStatus && detailStatus !== selectedReport.status) {
            await handleUpdateStatus(selectedReport.id, detailStatus as ReportStatus);
        }
        setSelectedReport(null);
    };

    const contentRef = useRef<HTMLDivElement>(null);

    // Export as PDF (screen capture)
    const handleExport = async () => {
        if (!contentRef.current) return;
        const html2canvasModule = await import("html2canvas");
        const html2canvas = html2canvasModule.default || html2canvasModule;
        const { default: jsPDF } = await import("jspdf");

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
        doc.save(`civicsight-reports-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    // Export as CSV
    const handleExportCSV = () => {
        const headers = ["ID", "Description", "Category", "Severity", "Status", "Confidence", "Citizen", "Reported"];
        const rows = filteredReports.map((r) => [
            `RPT-${r.report_number}`,
            `"${(r.description || "").replace(/"/g, '""')}"`,
            r.category?.name || r.ai_category_name || "N/A",
            getSeverityLabel(r.ai_severity),
            r.status.replace("_", " "),
            `${(r.ai_confidence || 0).toFixed(0)}%`,
            r.citizen?.full_name || "Unknown",
            new Date(r.reported_at).toLocaleDateString(),
        ]);
        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `civicsight-reports-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Assign worker handler
    const handleAssignWorker = async (workerId: string) => {
        if (!assignDialog || !adminId) return;
        try {
            setAssigning(true);
            await assignWorkerToReport(assignDialog.id, workerId, adminId, assignPriority, assignNote);
            await loadData();
            toast.success(`Worker assigned to RPT-${assignDialog.report_number}`);
            setAssignDialog(null);
            setAssignPriority("normal");
            setAssignNote("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to assign worker");
        } finally {
            setAssigning(false);
        }
    };

    // Open detail dialog
    const openDetail = (report: ReportWithDetails) => {
        setSelectedReport(report);
        setDetailStatus(report.status);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading reports...</span>
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
        <div ref={contentRef} className="space-y-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {Object.entries(statusCounts).map(([status, count]) => (
                    <Button
                        key={status}
                        variant={statusFilter === status ? "default" : "ghost"}
                        size="sm"
                        onClick={() => handleFilterChange(setStatusFilter, status)}
                        className={`text-xs capitalize whitespace-nowrap ${statusFilter === status
                                ? ""
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                    >
                        {status === "all" ? "All Reports" : status.replace("_", " ")}
                        <Badge
                            variant="secondary"
                            className="ml-1.5 text-[10px] px-1.5 py-0 min-w-5 justify-center"
                        >
                            {count}
                        </Badge>
                    </Button>
                ))}
            </div>

            {/* Search & Toolbar */}
            <Card className="border-border/50">
                <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by report ID, title, or citizen..."
                                className="pl-9 h-9 text-sm bg-muted/30 border-border/50"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setCurrentPage(1);
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={categoryFilter}
                                onValueChange={(v) => handleFilterChange(setCategoryFilter, v)}
                            >
                                <SelectTrigger className="w-35 h-9 text-xs">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
                                    {[...new Set(categories.map((c) => c.category_group))].map((group) => (
                                        <SelectItem key={group} value={group}>{group}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select
                                value={severityFilter}
                                onValueChange={(v) => handleFilterChange(setSeverityFilter, v)}
                            >
                                <SelectTrigger className="w-30 h-9 text-xs">
                                    <SelectValue placeholder="Severity" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Severity</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>
                            <Separator orientation="vertical" className="h-6" />
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
                                        <Download className="w-3.5 h-3.5" />
                                        Export
                                        <ChevronDown className="w-3 h-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={handleExport}>
                                        <Download className="w-3.5 h-3.5 mr-2" />
                                        Export as PDF
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={handleExportCSV}>
                                        <FileSpreadsheet className="w-3.5 h-3.5 mr-2" />
                                        Export as CSV
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Bulk Action Bar */}
            {selectedIds.size > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-3 flex items-center gap-3">
                        <CheckSquare className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium">{selectedIds.size} report{selectedIds.size > 1 ? "s" : ""} selected</span>
                        <Separator orientation="vertical" className="h-5" />
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkStatus("in_progress")}>
                            Mark In Progress
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkStatus("completed")}>
                            Mark Completed
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleBulkStatus("closed")}>
                            Mark Closed
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setSelectedIds(new Set())}>
                            Clear Selection
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Reports Table */}
            <Card className="border-border/50">
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border/50">
                                <TableHead className="w-10 pl-4">
                                    <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground transition-colors">
                                        {selectedIds.size === paginatedReports.length && paginatedReports.length > 0
                                            ? <CheckSquare className="w-4 h-4" />
                                            : selectedIds.size > 0
                                                ? <MinusSquare className="w-4 h-4" />
                                                : <Square className="w-4 h-4" />}
                                    </button>
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    <button
                                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                                        onClick={() => { setSortField("report_number"); setSortDir(prev => sortField === "report_number" ? (prev === "asc" ? "desc" : "asc") : "desc"); setCurrentPage(1); }}
                                    >
                                        Report ID <ArrowUpDown className={`w-3 h-3 ${sortField === "report_number" ? "text-primary" : ""}`} />
                                    </button>
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    Title
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    Category
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    <button
                                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                                        onClick={() => { setSortField("severity"); setSortDir(prev => sortField === "severity" ? (prev === "asc" ? "desc" : "asc") : "desc"); setCurrentPage(1); }}
                                    >
                                        Severity <ArrowUpDown className={`w-3 h-3 ${sortField === "severity" ? "text-primary" : ""}`} />
                                    </button>
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    Priority
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    Status
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    Confidence
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10">
                                    <button
                                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                                        onClick={() => { setSortField("reported_at"); setSortDir(prev => sortField === "reported_at" ? (prev === "asc" ? "desc" : "asc") : "desc"); setCurrentPage(1); }}
                                    >
                                        Reported <ArrowUpDown className={`w-3 h-3 ${sortField === "reported_at" ? "text-primary" : ""}`} />
                                    </button>
                                </TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-10 pr-6 w-10">
                                    {" "}
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedReports.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={10} className="h-60">
                                        <div className="flex flex-col items-center justify-center gap-3 text-muted-foreground">
                                            <SearchX className="w-10 h-10 opacity-40" />
                                            <div className="text-center">
                                                <p className="text-sm font-medium">No reports found</p>
                                                <p className="text-xs mt-1">Try adjusting your filters or search query</p>
                                            </div>
                                            {(statusFilter !== "all" || categoryFilter !== "all" || severityFilter !== "all" || searchQuery) && (
                                                <Button variant="outline" size="sm" className="text-xs h-7 mt-1" onClick={() => {
                                                    setStatusFilter("all"); setCategoryFilter("all"); setSeverityFilter("all"); setSearchQuery(""); setCurrentPage(1);
                                                }}>Clear All Filters</Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            )}
                            {paginatedReports.map((report) => (
                                <TableRow
                                    key={report.id}
                                    className={`cursor-pointer border-border/30 hover:bg-muted/50 transition-colors group ${selectedIds.has(report.id) ? "bg-primary/5" : ""}`}
                                    onClick={() => openDetail(report)}
                                >
                                    <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                                        {report.status !== "closed" ? (
                                        <button onClick={() => toggleSelect(report.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                                            {selectedIds.has(report.id) ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                                        </button>
                                        ) : (
                                        <Square className="w-4 h-4 text-muted-foreground/30" />
                                        )}
                                    </TableCell>
                                    <TableCell className="text-xs font-mono font-medium text-primary">
                                        RPT-{report.report_number}
                                    </TableCell>
                                    <TableCell className="text-sm font-medium max-w-55 truncate">
                                        {report.description.slice(0, 60)}{report.description.length > 60 ? "..." : ""}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {report.category?.name || report.ai_category_name || "N/A"}
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] font-medium px-2 py-0.5 ${priorityColors[getSeverityLabel(report.ai_severity).toLowerCase()]
                                                }`}
                                        >
                                            {getSeverityLabel(report.ai_severity)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="secondary"
                                            className={`text-[10px] font-medium px-2 py-0.5 capitalize ${priorityColors[getPriorityFromSeverity(report.ai_severity)]
                                                }`}
                                        >
                                            {getPriorityFromSeverity(report.ai_severity)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant="outline"
                                            className={`text-[10px] font-medium px-2 py-0.5 capitalize ${statusColors[report.status]
                                                }`}
                                        >
                                            <CircleDot className="w-2.5 h-2.5 mr-1" />
                                            {report.status.replace("_", " ")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {(() => {
                                            const conf = report.ai_confidence || 0;
                                            const color = conf >= 80 ? "text-success" : conf >= 50 ? "text-warning" : "text-destructive";
                                            const barColor = conf >= 80 ? "bg-success" : conf >= 50 ? "bg-warning" : "bg-destructive";
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${conf}%` }} />
                                                    </div>
                                                    <span className={`text-[10px] font-mono font-medium ${color}`}>
                                                        {conf.toFixed(0)}%
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {new Date(report.reported_at).toLocaleDateString("en-US", {
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </TableCell>
                                    <TableCell className="pr-6">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDetail(report);
                                                    }}
                                                >
                                                    <Eye className="w-3.5 h-3.5 mr-2" />
                                                    View Details
                                                </DropdownMenuItem>
                                                {report.status !== "closed" && (
                                                    <DropdownMenuItem
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAssignDialog(report);
                                                        }}
                                                    >
                                                        <UserPlus className="w-3.5 h-3.5 mr-2" />
                                                        Assign Worker
                                                    </DropdownMenuItem>
                                                )}
                                                {report.status !== "closed" && (
                                                <>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUpdateStatus(report.id, "in_progress");
                                                    }}
                                                >
                                                    Mark as In Progress
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUpdateStatus(report.id, "completed");
                                                    }}
                                                >
                                                    Mark as Completed
                                                </DropdownMenuItem>
                                                <DropdownMenuItem
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleUpdateStatus(report.id, "closed");
                                                    }}
                                                >
                                                    Mark as Closed
                                                </DropdownMenuItem>                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem
                                                    className="text-destructive focus:text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setRejectDialog(report);
                                                    }}
                                                >
                                                    <XCircle className="w-3.5 h-3.5 mr-2" />
                                                    Reject Report
                                                </DropdownMenuItem>
                                                </>)}                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>

                    {/* Pagination */}
                    {filteredReports.length > ITEMS_PER_PAGE && (
                        <div className="flex items-center justify-between px-6 py-3 border-t border-border/50">
                            <p className="text-xs text-muted-foreground">
                                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredReports.length)} of {filteredReports.length}
                            </p>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="w-8 h-8"
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage((p) => p - 1)}
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </Button>
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                                    <Button
                                        key={page}
                                        variant={page === currentPage ? "default" : "outline"}
                                        size="icon"
                                        className="w-8 h-8 text-xs"
                                        onClick={() => setCurrentPage(page)}
                                    >
                                        {page}
                                    </Button>
                                ))}
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="w-8 h-8"
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage((p) => p + 1)}
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Report Detail Dialog */}
            <Dialog
                open={!!selectedReport}
                onOpenChange={(open) => !open && setSelectedReport(null)}
            >
                <DialogContent className="max-w-[90vw] w-full max-h-[95vh] overflow-y-auto">
                    {selectedReport && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="text-sm font-mono text-primary font-semibold bg-primary/10 px-2.5 py-1 rounded-md">
                                        RPT-{selectedReport.report_number}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] font-medium px-2 py-0.5 capitalize ${statusColors[selectedReport.status]
                                            }`}
                                    >
                                        <CircleDot className="w-2.5 h-2.5 mr-1" />
                                        {selectedReport.status.replace("_", " ")}
                                    </Badge>
                                    <Badge
                                        variant="secondary"
                                        className={`text-[10px] font-medium px-2 py-0.5 capitalize ${priorityColors[getPriorityFromSeverity(selectedReport.ai_severity)]
                                            }`}
                                    >
                                        {getPriorityFromSeverity(selectedReport.ai_severity)} priority
                                    </Badge>
                                </div>
                                <DialogTitle className="text-xl font-semibold mt-3">
                                    {selectedReport.category?.name || selectedReport.ai_category_name || "Report"} — #{selectedReport.report_number}
                                </DialogTitle>
                                <DialogDescription className="sr-only">
                                    Details for report {selectedReport.report_number}
                                </DialogDescription>
                            </DialogHeader>

                            {/* Quick Status Bar — always visible */}
                            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/40 border border-border/60">
                                <span className="text-xs font-medium text-muted-foreground shrink-0">Status:</span>
                                <Select
                                    value={detailStatus}
                                    onValueChange={(v) => setDetailStatus(v)}
                                    disabled={selectedReport.status === "closed"}
                                >
                                    <SelectTrigger className={`w-40 h-8 text-xs ${selectedReport.status === "closed" ? "opacity-50 cursor-not-allowed" : ""}`}>
                                        <SelectValue placeholder="Update Status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="pending">Pending</SelectItem>
                                        <SelectItem value="open">Open</SelectItem>
                                        <SelectItem value="assigned">Assigned</SelectItem>
                                        <SelectItem value="in_progress">In Progress</SelectItem>
                                        <SelectItem value="completed">Completed</SelectItem>
                                        <SelectItem value="closed">Closed</SelectItem>
                                        <SelectItem value="rejected">Rejected</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    size="sm"
                                    className="text-xs h-8"
                                    disabled={selectedReport.status === "closed" || detailStatus === selectedReport.status}
                                    onClick={handleSaveChanges}
                                >
                                    Save Status
                                </Button>
                                <Separator orientation="vertical" className="h-5" />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className={`text-xs h-8 gap-1.5 ${selectedReport.status === "closed" ? "opacity-50 cursor-not-allowed" : ""}`}
                                    disabled={selectedReport.status === "closed"}
                                    onClick={() => setAssignDialog(selectedReport)}
                                >
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Assign Worker
                                </Button>
                                {selectedReport.status !== "closed" && selectedReport.status !== "rejected" && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        className="text-xs h-8 gap-1.5 ml-auto"
                                        onClick={() => setRejectDialog(selectedReport)}
                                    >
                                        <XCircle className="w-3.5 h-3.5" />
                                        Reject
                                    </Button>
                                )}
                            </div>

                            <Tabs defaultValue="images" className="mt-4">
                                <TabsList className="grid w-full grid-cols-5 h-10">
                                    <TabsTrigger value="images" className="text-sm">
                                        Images
                                    </TabsTrigger>
                                    <TabsTrigger value="details" className="text-sm">
                                        Details
                                    </TabsTrigger>
                                    <TabsTrigger value="ai" className="text-sm">
                                        AI Analysis
                                    </TabsTrigger>
                                    <TabsTrigger value="activity" className="text-sm">
                                        Activity
                                    </TabsTrigger>
                                    <TabsTrigger value="comments" className="text-sm">
                                        Comments {comments.length > 0 && `(${comments.length})`}
                                    </TabsTrigger>
                                </TabsList>

                                {/* ── Images Tab ── side-by-side comparison ── */}
                                <TabsContent value="images" className="space-y-6 mt-5">
                                    {(() => {
                                        // Filter out worker proof image from citizen images to avoid duplication
                                        const proofUrl = selectedReport.assignment?.proof_image_url;
                                        const citizenImages = (selectedReport.images || []).filter(
                                            (img) => !proofUrl || img.image_url !== proofUrl
                                        );
                                        return (
                                    <>
                                    <div className="grid grid-cols-2 gap-8">
                                        {/* Citizen Report Image */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-destructive" />
                                                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                                    Before — Citizen Report
                                                </h4>
                                            </div>
                                            <div className="h-96 rounded-xl overflow-hidden bg-muted/30 border-2 border-destructive/20 shadow-sm">
                                                {citizenImages.length > 0 ? (
                                                    <img
                                                        src={citizenImages[0].image_url}
                                                        alt="Citizen report"
                                                        className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                                        onClick={() => openLightbox(citizenImages[0].image_url)}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                        <ImageIcon className="w-8 h-8 opacity-40" />
                                                        <p className="text-xs">No image uploaded by citizen</p>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Additional citizen images */}
                                            {citizenImages.length > 1 && (
                                                <div className="flex gap-2 overflow-x-auto pb-1">
                                                    {citizenImages.map((img, i) => (
                                                        <img
                                                            key={img.id}
                                                            src={img.thumbnail_url || img.image_url}
                                                            alt={`Report image ${i + 1}`}
                                                            className="w-16 h-16 rounded-lg object-cover cursor-zoom-in border-2 border-border/50 hover:border-primary/50 transition-colors shrink-0"
                                                            onClick={() => openLightbox(img.image_url)}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                                Uploaded {citizenImages[0]?.uploaded_at
                                                    ? new Date(citizenImages[0].uploaded_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                                    : new Date(selectedReport.reported_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })
                                                }
                                            </p>
                                        </div>

                                        {/* Worker Proof Image */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 rounded-full bg-success" />
                                                <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                                                    After — Worker Proof
                                                </h4>
                                                {selectedReport.assignment?.worker && (
                                                    <span className="text-xs text-muted-foreground ml-auto">
                                                        by {selectedReport.assignment.worker.full_name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="h-96 rounded-xl overflow-hidden bg-muted/30 border-2 border-success/20 shadow-sm">
                                                {selectedReport.assignment?.proof_image_url ? (
                                                    <img
                                                        src={selectedReport.assignment.proof_image_url}
                                                        alt="Worker proof"
                                                        className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                                                        onClick={() => openLightbox(selectedReport.assignment!.proof_image_url!)}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                                        <ImageIcon className="w-8 h-8 opacity-40" />
                                                        <p className="text-xs">No proof uploaded yet</p>
                                                        {selectedReport.assignment?.worker ? (
                                                            <p className="text-[10px] text-muted-foreground/70">Assigned to {selectedReport.assignment.worker.full_name}</p>
                                                        ) : (
                                                            <p className="text-[10px] text-muted-foreground/70">No worker assigned</p>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            {selectedReport.assignment?.proof_image_url && selectedReport.assignment?.completed_at && (
                                                <p className="text-xs text-muted-foreground">
                                                    Completed {new Date(selectedReport.assignment.completed_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Worker Note */}
                                    {selectedReport.assignment?.worker_note && (
                                        <div className="flex items-start gap-3 p-3.5 rounded-xl bg-muted/50 border border-border/50">
                                            <MessageSquare className="w-4 h-4 text-muted-foreground mt-0.5" />
                                            <div>
                                                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Worker Note</p>
                                                <p className="text-sm mt-1">{selectedReport.assignment.worker_note}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Verdict hint for admin */}
                                    {selectedReport.assignment?.proof_image_url && selectedReport.images && selectedReport.images.length > 0 && (
                                        <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                                            <span className="text-xl">🔍</span>
                                            <div>
                                                <p className="text-sm font-medium">Review Comparison</p>
                                                <p className="text-xs text-muted-foreground">
                                                    Compare the before &amp; after images above, then update the status using the controls at the top.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                        </>
                                        );
                                    })()}
                                </TabsContent>

                                <TabsContent value="details" className="space-y-4 mt-4">
                                    {/* Description */}
                                    <div>
                                        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                            Description
                                        </h4>
                                        <p className="text-sm leading-relaxed">
                                            {selectedReport.description}
                                        </p>
                                    </div>

                                    <Separator />

                                    {/* Mini Map */}
                                    {selectedReport.location?.latitude && selectedReport.location?.longitude && GOOGLE_MAPS_API_KEY && (
                                        <div className="w-full h-72 rounded-lg overflow-hidden border border-border/50">
                                            <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                                                <GoogleMap
                                                    defaultCenter={{ lat: Number(selectedReport.location.latitude), lng: Number(selectedReport.location.longitude) }}
                                                    defaultZoom={16}
                                                    gestureHandling="cooperative"
                                                    disableDefaultUI={false}
                                                    mapId="civicsight-detail-map"
                                                    style={{ width: "100%", height: "100%" }}
                                                >
                                                    <AdvancedMarker position={{ lat: Number(selectedReport.location.latitude), lng: Number(selectedReport.location.longitude) }}>
                                                        <Pin background="#dc2626" borderColor="#991b1b" glyphColor="#ffffff" scale={1.2} />
                                                    </AdvancedMarker>
                                                </GoogleMap>
                                            </APIProvider>
                                        </div>
                                    )}

                                    {/* Info Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm">
                                                <User className="w-4 h-4 text-muted-foreground" />
                                                <div>
                                                    <p className="font-medium text-xs">
                                                        {selectedReport.citizen?.full_name || "Unknown"}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {selectedReport.citizen?.email}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-sm">
                                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                                <div>
                                                    <p className="font-medium text-xs">
                                                        {selectedReport.location?.formatted_address || "No address"}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground font-mono">
                                                        {selectedReport.location?.latitude}, {selectedReport.location?.longitude}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-sm">
                                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                                <div>
                                                    <p className="font-medium text-xs">Reported</p>
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {new Date(
                                                            selectedReport.reported_at
                                                        ).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground mb-1">
                                                    Category
                                                </p>
                                                <Badge variant="secondary" className="text-xs">
                                                    {selectedReport.category?.category_group || "N/A"} ›{" "}
                                                    {selectedReport.category?.name || selectedReport.ai_category_name || "Uncategorized"}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Assigned Worker */}
                                    {selectedReport.assignment?.worker && (
                                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-info/5 border border-info/20">
                                            <UserPlus className="w-4 h-4 text-info" />
                                            <div>
                                                <p className="text-xs font-medium">Assigned to</p>
                                                <p className="text-[11px] text-muted-foreground">{selectedReport.assignment.worker.full_name}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Admin / Worker Notes */}
                                    {(selectedReport.assignment?.assignment_note || selectedReport.assignment?.worker_note) && (
                                        <div className="space-y-2">
                                            {selectedReport.assignment?.assignment_note && (
                                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
                                                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                                    <div>
                                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Admin Note</p>
                                                        <p className="text-xs mt-0.5">{selectedReport.assignment.assignment_note}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {selectedReport.assignment?.worker_note && (
                                                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/50 border border-border/50">
                                                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
                                                    <div>
                                                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Worker Note</p>
                                                        <p className="text-xs mt-0.5">{selectedReport.assignment.worker_note}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Rejection info */}
                                    {selectedReport.status === "rejected" && (
                                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                                            <XCircle className="w-4 h-4 text-destructive mt-0.5" />
                                            <div>
                                                <p className="text-xs font-medium text-destructive">Report Rejected</p>
                                                {selectedReport.assignment?.assignment_note && (
                                                    <p className="text-[11px] text-muted-foreground mt-0.5">{selectedReport.assignment.assignment_note}</p>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                </TabsContent>

                                <TabsContent value="ai" className="space-y-4 mt-4">
                                    <Card className="bg-primary/5 border-primary/20">
                                        <CardContent className="p-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                                    <span className="text-sm">🤖</span>
                                                </div>
                                                <div className="space-y-2">
                                                    <p className="text-xs font-medium">
                                                        AI Classification Result
                                                    </p>
                                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                                        {selectedReport.ai_description || "No AI analysis available"}
                                                    </p>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <div className="grid grid-cols-3 gap-3">
                                        <Card className="border-border/50">
                                            <CardContent className="p-3 flex flex-col items-center">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                    Confidence
                                                </p>
                                                {(() => {
                                                    const conf = selectedReport.ai_confidence || 0;
                                                    const color = conf >= 80 ? "stroke-success" : conf >= 50 ? "stroke-warning" : "stroke-destructive";
                                                    const textColor = conf >= 80 ? "text-success" : conf >= 50 ? "text-warning" : "text-destructive";
                                                    const circumference = 2 * Math.PI * 28;
                                                    const offset = circumference - (conf / 100) * circumference;
                                                    return (
                                                        <div className="relative w-16 h-16 mt-1">
                                                            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                                                                <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className="stroke-muted" />
                                                                <circle
                                                                    cx="32" cy="32" r="28" fill="none" strokeWidth="5"
                                                                    className={`${color} transition-all duration-1000 ease-out`}
                                                                    strokeLinecap="round"
                                                                    strokeDasharray={circumference}
                                                                    strokeDashoffset={offset}
                                                                />
                                                            </svg>
                                                            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${textColor}`}>
                                                                {conf.toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border/50">
                                            <CardContent className="p-3 flex flex-col items-center">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                    Severity
                                                </p>
                                                {(() => {
                                                    const sev = selectedReport.ai_severity || 0;
                                                    const color = sev >= 4 ? "stroke-destructive" : sev >= 3 ? "stroke-warning" : "stroke-success";
                                                    const textColor = sev >= 4 ? "text-destructive" : sev >= 3 ? "text-warning" : "text-success";
                                                    const circumference = 2 * Math.PI * 28;
                                                    const offset = circumference - (sev / 5) * circumference;
                                                    return (
                                                        <div className="relative w-16 h-16 mt-1">
                                                            <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
                                                                <circle cx="32" cy="32" r="28" fill="none" strokeWidth="5" className="stroke-muted" />
                                                                <circle
                                                                    cx="32" cy="32" r="28" fill="none" strokeWidth="5"
                                                                    className={`${color} transition-all duration-1000 ease-out`}
                                                                    strokeLinecap="round"
                                                                    strokeDasharray={circumference}
                                                                    strokeDashoffset={offset}
                                                                />
                                                            </svg>
                                                            <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${textColor}`}>
                                                                {sev}/5
                                                            </span>
                                                        </div>
                                                    );
                                                })()}
                                            </CardContent>
                                        </Card>
                                        <Card className="border-border/50">
                                            <CardContent className="p-3 text-center">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                                    Category
                                                </p>
                                                <div className="mt-2 flex flex-col items-center gap-1">
                                                    <span className="text-xl">{getCategoryIcon(selectedReport.category?.name, selectedReport.category?.category_group)}</span>
                                                    <p className="text-xs font-medium">
                                                        {selectedReport.category?.name || selectedReport.ai_category_name || "N/A"}
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>

                                <TabsContent value="activity" className="mt-4">
                                    <div className="space-y-4">
                                        {[
                                            {
                                                action: "Report submitted",
                                                by: selectedReport.citizen?.full_name || "Citizen",
                                                time: new Date(selectedReport.reported_at).toLocaleString(),
                                                dot: "bg-primary",
                                            },
                                            ...(selectedReport.ai_processed_at ? [{
                                                action: "AI analysis completed",
                                                by: "System",
                                                time: new Date(selectedReport.ai_processed_at).toLocaleString(),
                                                dot: "bg-info",
                                            }] : []),
                                            ...(selectedReport.ai_category_name ? [{
                                                action: `Classified as ${selectedReport.category?.name || selectedReport.ai_category_name}`,
                                                by: "AI Engine",
                                                time: selectedReport.ai_processed_at ? new Date(selectedReport.ai_processed_at).toLocaleString() : "",
                                                dot: "bg-success",
                                            }] : []),
                                            ...(selectedReport.assigned_at ? [{
                                                action: `Assigned to ${selectedReport.assignment?.worker?.full_name || "worker"}`,
                                                by: "Admin",
                                                time: new Date(selectedReport.assigned_at).toLocaleString(),
                                                dot: "bg-blue-500",
                                            }] : []),
                                            ...(selectedReport.resolved_at ? [{
                                                action: "Report resolved",
                                                by: selectedReport.assignment?.worker?.full_name || "Worker",
                                                time: new Date(selectedReport.resolved_at).toLocaleString(),
                                                dot: "bg-success",
                                            }] : []),
                                            ...(selectedReport.status === "rejected" && selectedReport.assignment?.rejected_at ? [{
                                                action: "Report rejected",
                                                by: "Admin",
                                                time: new Date(selectedReport.assignment.rejected_at).toLocaleString(),
                                                dot: "bg-destructive",
                                            }] : []),
                                        ].map((item, i, arr) => (
                                            <div
                                                key={i}
                                                className="flex items-start gap-3 relative"
                                            >
                                                <div
                                                    className={`w-2.5 h-2.5 rounded-full ${item.dot} mt-1.5 shrink-0 ring-4 ring-background`}
                                                />
                                                {i < arr.length - 1 && (
                                                    <div className="absolute left-1 top-4 w-px h-[calc(100%+8px)] bg-border" />
                                                )}
                                                <div>
                                                    <p className="text-sm font-medium">{item.action}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {item.by} · {item.time}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </TabsContent>

                                <TabsContent value="comments" className="mt-4">
                                    <div className="flex flex-col h-[400px]">
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                            {loadingComments ? (
                                                <div className="flex items-center justify-center h-full">
                                                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                                </div>
                                            ) : comments.length === 0 ? (
                                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                                    <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                                                    <p className="text-sm">No comments yet</p>
                                                    <p className="text-xs">Start a conversation about this report</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {comments.map((c) => {
                                                        const isAdmin = c.author_role === "admin" || c.user_id === adminId;
                                                        const displayName = c.author_name || (isAdmin ? "Admin" : "Worker");
                                                        const time = c.created_at
                                                            ? new Date(c.created_at).toLocaleString(undefined, {
                                                                  month: "short",
                                                                  day: "numeric",
                                                                  hour: "2-digit",
                                                                  minute: "2-digit",
                                                              })
                                                            : "";
                                                        return (
                                                            <div
                                                                key={c.id}
                                                                className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}
                                                            >
                                                                <div
                                                                    className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                                                                        isAdmin
                                                                            ? "bg-primary text-primary-foreground rounded-br-sm"
                                                                            : "bg-muted rounded-bl-sm"
                                                                    }`}
                                                                >
                                                                    {!isAdmin && (
                                                                        <p className="text-[10px] font-semibold text-primary mb-0.5">
                                                                            {displayName}
                                                                        </p>
                                                                    )}
                                                                    <p className="whitespace-pre-wrap break-words">{c.content}</p>
                                                                    <p
                                                                        className={`text-[10px] mt-1 ${
                                                                            isAdmin ? "text-primary-foreground/70" : "text-muted-foreground"
                                                                        }`}
                                                                    >
                                                                        {time}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    <div ref={commentsEndRef} />
                                                </>
                                            )}
                                        </div>
                                        <Separator className="my-3" />
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="Type a message..."
                                                className="text-sm h-9"
                                                value={commentText}
                                                onChange={(e) => setCommentText(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault();
                                                        handleSendComment();
                                                    }
                                                }}
                                                disabled={sendingComment}
                                            />
                                            <Button
                                                size="sm"
                                                className="h-9 px-3"
                                                disabled={!commentText.trim() || sendingComment}
                                                onClick={handleSendComment}
                                            >
                                                {sendingComment ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <MessageSquare className="w-4 h-4" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Reject Report Dialog */}
            <Dialog open={!!rejectDialog} onOpenChange={(open) => { if (!open) { setRejectDialog(null); setRejectNote(""); } }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-base flex items-center gap-2">
                            <XCircle className="w-4 h-4 text-destructive" />
                            Reject Report
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            {rejectDialog ? <>Rejecting <span className="font-medium text-foreground">RPT-{rejectDialog.report_number}</span></> : "Reject a report"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs">Rejection Reason</Label>
                            <textarea
                                className="w-full min-h-20 rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                                placeholder="Provide a reason for rejecting this report..."
                                value={rejectNote}
                                onChange={(e) => setRejectNote(e.target.value)}
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" className="text-xs h-8" onClick={() => { setRejectDialog(null); setRejectNote(""); }}>
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                className="text-xs h-8"
                                disabled={!rejectNote.trim() || rejecting}
                                onClick={handleRejectReport}
                            >
                                {rejecting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                                Reject Report
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign Worker Dialog */}
            <Dialog open={!!assignDialog} onOpenChange={(open) => !open && setAssignDialog(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-base">Assign Worker</DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground mt-1">
                            {assignDialog ? <>Assign a field worker to <span className="font-medium text-foreground">RPT-{assignDialog.report_number}</span></> : "Assign a worker to a report"}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 mt-2">
                        <Select value={assignPriority} onValueChange={(v) => setAssignPriority(v as AssignmentPriority)}>
                            <SelectTrigger className="h-9 text-xs">
                                <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="normal">Normal</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="critical">Critical</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            placeholder="Assignment note (optional)"
                            className="h-9 text-xs"
                            value={assignNote}
                            onChange={(e) => setAssignNote(e.target.value)}
                        />
                        <Separator />
                        <div className="space-y-2 max-h-70 overflow-y-auto">
                            {workers.length === 0 && (
                                <p className="text-xs text-muted-foreground text-center py-4">No workers found</p>
                            )}
                            {workers.map((worker) => (
                                <button
                                    key={worker.uid}
                                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all text-left group disabled:opacity-50"
                                    disabled={assigning}
                                    onClick={() => handleAssignWorker(worker.uid)}
                                >
                                    <div className="w-8 h-8 rounded-full bg-info/10 flex items-center justify-center text-info text-xs font-bold">
                                        {(worker.full_name || "W").split(" ").map((n) => n[0]).join("")}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium group-hover:text-primary transition-colors">{worker.full_name || "Unnamed"}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {worker.worker_profile?.service_area || "No area"} · {worker.worker_profile?.total_completed || 0} resolved
                                        </p>
                                    </div>
                                    {worker.worker_profile && (
                                        <span className="text-[10px] text-muted-foreground">
                                            {worker.worker_profile.current_task_count}/{worker.worker_profile.max_task_limit}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Image Lightbox */}
            {lightboxUrl && (
                <div
                    className="fixed inset-0 z-100 bg-black/90 flex items-center justify-center"
                    onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
                >
                    {/* Controls */}
                    <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 h-9 w-9 p-0"
                            onClick={() => setZoomLevel((z) => Math.min(5, z + 0.5))}
                        >
                            <ZoomIn className="w-5 h-5" />
                        </Button>
                        <span className="text-white/70 text-xs font-mono min-w-12 text-center">
                            {Math.round(zoomLevel * 100)}%
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 h-9 w-9 p-0"
                            onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.5))}
                        >
                            <ZoomOut className="w-5 h-5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 h-9 w-9 p-0 ml-2"
                            onClick={closeLightbox}
                        >
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    {/* Image container */}
                    <div
                        className="w-full h-full flex items-center justify-center overflow-hidden select-none"
                        onWheel={handleLightboxWheel}
                        onPointerDown={handleLightboxPointerDown}
                        onPointerMove={handleLightboxPointerMove}
                        onPointerUp={handleLightboxPointerUp}
                        style={{ cursor: zoomLevel > 1 ? (isPanning ? "grabbing" : "grab") : "zoom-in" }}
                    >
                        <img
                            src={lightboxUrl}
                            alt="Report full view"
                            className="max-w-none transition-transform duration-150 ease-out"
                            style={{
                                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                            }}
                            draggable={false}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (zoomLevel <= 1) {
                                    setZoomLevel(2.5);
                                    setPanOffset({ x: 0, y: 0 });
                                }
                            }}
                        />
                    </div>

                    {/* Hint */}
                    <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
                        Scroll to zoom · Click image to zoom in · Drag to pan · Click outside to close
                    </p>
                </div>
            )}
        </div>
    );
}
