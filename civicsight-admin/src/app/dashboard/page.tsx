"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
    FileText,
    Users,
    CheckCircle2,
    Clock,
    TrendingUp,
    ArrowUpRight,
    CircleDot,
    Loader2,
    AlertTriangle,
    Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Sector,
} from "recharts";
import { fetchDashboardStats, fetchReports } from "@/lib/queries";
import type { ReportWithDetails } from "@/lib/types";

const PIE_COLORS = [
    "oklch(0.7 0.16 55)",
    "oklch(0.55 0.14 250)",
    "oklch(0.65 0.18 155)",
    "oklch(0.6 0.15 230)",
    "oklch(0.75 0.12 75)",
    "oklch(0.6 0.16 30)",
    "oklch(0.5 0.14 280)",
];

const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning border-warning/20",
    open: "bg-info/10 text-info border-info/20",
    assigned: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    in_progress: "bg-info/10 text-info border-info/20",
    resolved: "bg-success/10 text-success border-success/20",
    closed: "bg-muted text-muted-foreground border-border",
    rejected: "bg-destructive/10 text-destructive border-destructive/20",
};

const priorityColors: Record<string, string> = {
    Critical: "bg-destructive/10 text-destructive",
    High: "bg-destructive/10 text-destructive",
    Medium: "bg-warning/10 text-warning",
    Low: "bg-muted text-muted-foreground",
};

function getSeverityLabel(severity: number | null): string {
    if (!severity) return "Low";
    if (severity >= 5) return "Critical";
    if (severity >= 4) return "High";
    if (severity >= 3) return "Medium";
    return "Low";
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

export default function DashboardPage() {
    const [activePieIndex, setActivePieIndex] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<{
        totalReports: number;
        activeCitizens: number;
        totalWorkers: number;
        resolvedToday: number;
        statusCounts: Record<string, number>;
        categoryCounts: Record<string, number>;
        last7Days: { date: string; count: number }[];
        avgResolutionHours: number;
    } | null>(null);
    const [recentReports, setRecentReports] = useState<ReportWithDetails[]>([]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [statsData, reportsData] = await Promise.all([
                fetchDashboardStats(),
                fetchReports(),
            ]);
            setStats(statsData);
            setRecentReports(reportsData.slice(0, 5));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading dashboard...</span>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <p className="text-sm text-destructive">{error || "Failed to load"}</p>
                <Button size="sm" onClick={loadData}>Retry</Button>
            </div>
        );
    }

    // Build KPI cards from real data
    const kpiCards = [
        { title: "Total Reports", value: stats.totalReports.toLocaleString(), icon: FileText, color: "text-primary", bgColor: "bg-primary/10" },
        { title: "Active Citizens", value: stats.activeCitizens.toLocaleString(), icon: Users, color: "text-info", bgColor: "bg-info/10" },
        { title: "Completed Today", value: stats.resolvedToday.toString(), icon: CheckCircle2, color: "text-success", bgColor: "bg-success/10" },
        { title: "Avg Resolution", value: `${stats.avgResolutionHours.toFixed(1)}h`, icon: Clock, color: "text-warning", bgColor: "bg-warning/10" },
    ];

    // Build chart data from last 7 days
    const chartData = stats.last7Days.map((d) => {
        const dayName = new Date(d.date).toLocaleDateString("en-US", { weekday: "short" });
        return { name: dayName, reports: d.count, resolved: 0 };
    });

    // Build pie data from category counts (already keyed by name from backend)
    const totalCatReports = Object.values(stats.categoryCounts).reduce((a, b) => a + b, 0) || 1;
    const categoryData = Object.entries(stats.categoryCounts)
        .map(([catName, count], i) => ({
            name: catName,
            value: Math.round((count / totalCatReports) * 100),
            color: PIE_COLORS[i % PIE_COLORS.length],
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpiCards.map((stat, index) => (
                    <Card
                        key={stat.title}
                        className={`group hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 border-border/50 hover:border-primary/20 hover-glow animate-fade-in-up stagger-${index + 1}`}
                    >
                        <CardContent className="p-5">
                            <div className="flex items-start justify-between">
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                        {stat.title}
                                    </p>
                                    <p className="text-2xl font-bold tracking-tight">
                                        {stat.value}
                                    </p>
                                </div>
                                <div className={`p-2.5 rounded-xl ${stat.bgColor} group-hover:scale-110 transition-transform duration-300`}>
                                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 border-border/50">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-semibold">Reports This Week</CardTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">New reports over the last 7 days</p>
                            </div>
                            <div className="flex items-center gap-4 text-xs">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                                    <span className="text-muted-foreground">New</span>
                                </div>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                        <div className="h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="reportGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="oklch(0.7 0.16 55)" stopOpacity={0.3} />
                                            <stop offset="100%" stopColor="oklch(0.7 0.16 55)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.5 0 0 / 10%)" vertical={false} />
                                    <XAxis dataKey="name" fontSize={11} tickLine={false} axisLine={false} stroke="oklch(0.5 0 0 / 40%)" />
                                    <YAxis fontSize={11} tickLine={false} axisLine={false} stroke="oklch(0.5 0 0 / 40%)" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e", borderRadius: "8px", fontSize: "12px", color: "#e8e4df" }}
                                        labelStyle={{ color: "#e8e4df" }}
                                        itemStyle={{ color: "#c4c0ba" }}
                                    />
                                    <Area type="monotone" dataKey="reports" stroke="oklch(0.7 0.16 55)" strokeWidth={2} fill="url(#reportGradient)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-border/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold">By Category</CardTitle>
                        <p className="text-xs text-muted-foreground">Report distribution</p>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[180px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={categoryData}
                                        cx="50%" cy="50%"
                                        innerRadius={50} outerRadius={75}
                                        paddingAngle={4} dataKey="value" strokeWidth={0}
                                        // @ts-expect-error activeIndex is a valid Recharts prop
                                        activeIndex={activePieIndex ?? undefined}
                                        activeShape={(props: any) => {
                                            const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
                                            return (
                                                <Sector cx={cx} cy={cy} innerRadius={innerRadius - 2} outerRadius={(outerRadius as number) + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} strokeWidth={0} />
                                            );
                                        }}
                                        onMouseEnter={(_, index) => setActivePieIndex(index)}
                                        onMouseLeave={() => setActivePieIndex(null)}
                                    >
                                        {categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} opacity={activePieIndex === null || activePieIndex === index ? 1 : 0.3} style={{ transition: "opacity 0.2s ease" }} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: "#1a1d2e", border: "1px solid #2a2d3e", borderRadius: "8px", fontSize: "12px", color: "#e8e4df" }}
                                        labelStyle={{ color: "#e8e4df" }}
                                        itemStyle={{ color: "#c4c0ba" }}
                                        formatter={(value: number | undefined, name?: string) => [`${value ?? 0}%`, name ?? ""]}
                                        cursor={false}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="space-y-2 mt-2">
                            {categoryData.map((cat) => (
                                <div key={cat.name} className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                                        <span className="text-muted-foreground">{cat.name}</span>
                                    </div>
                                    <span className="font-medium">{cat.value}%</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Reports Table */}
            <Card className="border-border/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-semibold">Recent Reports</CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">Latest civic reports submitted by citizens</p>
                        </div>
                        <Link href="/dashboard/reports">
                            <Button variant="ghost" size="sm" className="text-xs text-primary hover:text-primary">
                                View All <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                        </Link>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent border-border/50">
                                <TableHead className="text-xs font-medium text-muted-foreground h-9 pl-6">Report ID</TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-9">Title</TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-9">Category</TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-9">Severity</TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-9">Status</TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-9">Citizen</TableHead>
                                <TableHead className="text-xs font-medium text-muted-foreground h-9 pr-6">Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {recentReports.map((report) => (
                                <TableRow key={report.id} className="cursor-pointer border-border/30 hover:bg-muted/50 transition-colors">
                                    <TableCell className="text-xs font-mono font-medium text-primary pl-6">RPT-{report.report_number}</TableCell>
                                    <TableCell className="text-sm font-medium max-w-[200px] truncate">
                                        {report.description.slice(0, 60)}{report.description.length > 60 ? "..." : ""}
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{report.category?.name || report.ai_category_name || "N/A"}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className={`text-[10px] font-medium px-2 py-0.5 ${priorityColors[getSeverityLabel(report.ai_severity)]}`}>
                                            {getSeverityLabel(report.ai_severity)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className={`text-[10px] font-medium px-2 py-0.5 capitalize ${statusColors[report.status]}`}>
                                            <CircleDot className="w-2.5 h-2.5 mr-1" />
                                            {report.status.replace("_", " ")}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-xs text-muted-foreground">{report.citizen?.full_name || "Unknown"}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground pr-6">{timeAgo(report.reported_at)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
