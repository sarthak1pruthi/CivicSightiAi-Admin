"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
    Search,
    MoreHorizontal,
    UserCheck,
    UserX,
    Mail,
    Phone,
    Calendar,
    MapPin,
    FileText,
    Shield,
    Eye,
    Loader2,
    AlertTriangle,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    X,
    Download,
    Filter,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from "next/navigation";
import { fetchCitizens, fetchWorkers } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import type { DbUser, WorkerWithProfile } from "@/lib/types";

type CitizenWithProfile = DbUser & {
    citizen_profile?: {
        citizen_id: string;
        address: string | null;
        city: string | null;
        province: string | null;
        total_reports: number;
        created_at: string;
    };
};

type SortField = "name" | "reports" | "joined";
type SortDir = "asc" | "desc";

const roleColors: Record<string, string> = {
    citizen: "bg-primary/10 text-primary border-primary/20",
    worker: "bg-info/10 text-info border-info/20",
};

const statusColors: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20",
    inactive: "bg-muted text-muted-foreground border-border",
    banned: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function UsersPage() {
    const router = useRouter();
    const [citizens, setCitizens] = useState<CitizenWithProfile[]>([]);
    const [workers, setWorkers] = useState<WorkerWithProfile[]>([]);
    const [selectedUser, setSelectedUser] = useState<(CitizenWithProfile | WorkerWithProfile) | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sorting state
    const [sortField, setSortField] = useState<SortField>("name");
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    // Date filter state
    const [datePreset, setDatePreset] = useState("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const [citizensData, workersData] = await Promise.all([
                fetchCitizens(),
                fetchWorkers(),
            ]);
            setCitizens(citizensData);
            setWorkers(workersData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load users");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const toggleUserStatus = async (uid: string, currentStatus: string) => {
        const newStatus = currentStatus === "active" ? "banned" : "active";
        try {
            await apiFetch("/api/users", {
                method: "PATCH",
                body: JSON.stringify({ uid, status: newStatus }),
            });
            setCitizens((prev) => prev.map((u) => u.uid === uid ? { ...u, status: newStatus } : u));
            setWorkers((prev) => prev.map((u) => u.uid === uid ? { ...u, status: newStatus } : u));
            if (selectedUser?.uid === uid) {
                setSelectedUser((prev) => prev ? { ...prev, status: newStatus } : null);
            }
        } catch (err) {
            console.error("Failed to update user status:", err);
        }
    };

    const handleDatePreset = (value: string) => {
        setDatePreset(value);
        const now = new Date();
        if (value === "all") {
            setDateFrom("");
            setDateTo("");
        } else if (value === "7d") {
            const from = new Date(now);
            from.setDate(from.getDate() - 7);
            setDateFrom(from.toISOString().slice(0, 10));
            setDateTo(now.toISOString().slice(0, 10));
        } else if (value === "30d") {
            const from = new Date(now);
            from.setDate(from.getDate() - 30);
            setDateFrom(from.toISOString().slice(0, 10));
            setDateTo(now.toISOString().slice(0, 10));
        } else if (value === "90d") {
            const from = new Date(now);
            from.setDate(from.getDate() - 90);
            setDateFrom(from.toISOString().slice(0, 10));
            setDateTo(now.toISOString().slice(0, 10));
        } else if (value === "year") {
            setDateFrom(`${now.getFullYear()}-01-01`);
            setDateTo(now.toISOString().slice(0, 10));
        }
        // "custom" leaves dates as-is for manual input
    };

    const handleExportPDF = async () => {
        const { default: jsPDF } = await import("jspdf");
        const autoTable = (await import("jspdf-autotable")).default;

        const doc = new jsPDF({ orientation: "landscape" });

        doc.setFontSize(18);
        doc.setTextColor(40, 40, 40);
        doc.text("CivicSight AI - Citizens", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text(
            `Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}  |  ${filteredCitizens.length} citizens`,
            14, 28
        );

        const tableData = filteredCitizens.map((u) => [
            u.full_name || "Unnamed",
            u.email,
            (u.citizen_profile?.city || "N/A") + (u.citizen_profile?.province ? `, ${u.citizen_profile.province}` : ""),
            String(u.citizen_profile?.total_reports || 0),
            u.status,
            new Date(u.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
            u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Never",
        ]);

        autoTable(doc, {
            startY: 34,
            head: [["Name", "Email", "Location", "Reports", "Status", "Joined", "Last Active"]],
            body: tableData,
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [30, 30, 40], textColor: [255, 255, 255], fontStyle: "bold" },
            alternateRowStyles: { fillColor: [245, 245, 250] },
        });

        doc.save(`civicsight-citizens-${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const handleExportCSV = () => {
        const headers = ["Name", "Email", "Location", "Reports", "Auth", "Status", "Joined", "Last Active"];
        const rows = filteredCitizens.map((u) => [
            u.full_name || "Unnamed",
            u.email,
            (u.citizen_profile?.city || "N/A") + (u.citizen_profile?.province ? `, ${u.citizen_profile.province}` : ""),
            String(u.citizen_profile?.total_reports || 0),
            u.auth_provider,
            u.status,
            new Date(u.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
            u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "Never",
        ]);
        const csv = [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `civicsight-citizens-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortField(field);
            setSortDir("asc");
        }
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 text-muted-foreground/50" />;
        return sortDir === "asc"
            ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
            : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
    };

    const hasDateFilter = dateFrom || dateTo;

    const filteredCitizens = useMemo(() => {
        let result = citizens.filter(
            (u) =>
                !searchQuery ||
                (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                u.email.toLowerCase().includes(searchQuery.toLowerCase())
        );

        // Date range filter on created_at
        if (dateFrom) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            result = result.filter((u) => new Date(u.created_at) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            result = result.filter((u) => new Date(u.created_at) <= to);
        }

        // Sorting
        result.sort((a, b) => {
            let cmp = 0;
            if (sortField === "name") {
                cmp = (a.full_name || "").localeCompare(b.full_name || "");
            } else if (sortField === "reports") {
                cmp = (a.citizen_profile?.total_reports || 0) - (b.citizen_profile?.total_reports || 0);
            } else if (sortField === "joined") {
                cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            }
            return sortDir === "asc" ? cmp : -cmp;
        });

        return result;
    }, [citizens, searchQuery, dateFrom, dateTo, sortField, sortDir]);

    const filteredWorkers = workers.filter(
        (u) =>
            !searchQuery ||
            (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading users...</span>
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
            <Tabs defaultValue="citizens" className="w-full">
                <TabsList className="grid w-75 grid-cols-2 h-9">
                    <TabsTrigger value="citizens" className="text-xs">
                        Citizens ({citizens.length})
                    </TabsTrigger>
                    <TabsTrigger value="workers" className="text-xs">
                        Workers ({workers.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="citizens" className="mt-4 space-y-4">
                    {/* Search & Toolbar */}
                    <Card className="border-border/50">
                        <CardContent className="p-4">
                            <div className="flex flex-col sm:flex-row gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name or email..."
                                        className="pl-9 h-9 text-sm bg-muted/30 border-border/50"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Select value={datePreset} onValueChange={handleDatePreset}>
                                        <SelectTrigger className="w-35 h-9 text-xs">
                                            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                                            <SelectValue placeholder="Join Date" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Time</SelectItem>
                                            <SelectItem value="7d">Last 7 Days</SelectItem>
                                            <SelectItem value="30d">Last 30 Days</SelectItem>
                                            <SelectItem value="90d">Last 90 Days</SelectItem>
                                            <SelectItem value="year">This Year</SelectItem>
                                            <SelectItem value="custom">Custom Range</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {datePreset === "custom" && (
                                        <>
                                            <Input
                                                type="date"
                                                className="h-9 text-xs bg-muted/30 border-border/50 w-32.5"
                                                value={dateFrom}
                                                onChange={(e) => setDateFrom(e.target.value)}
                                            />
                                            <span className="text-xs text-muted-foreground">to</span>
                                            <Input
                                                type="date"
                                                className="h-9 text-xs bg-muted/30 border-border/50 w-32.5"
                                                value={dateTo}
                                                onChange={(e) => setDateTo(e.target.value)}
                                            />
                                        </>
                                    )}
                                    {hasDateFilter && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-9 w-9 shrink-0"
                                            onClick={() => { setDatePreset("all"); setDateFrom(""); setDateTo(""); }}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <Separator orientation="vertical" className="h-6" />
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="outline" size="sm" className="h-9 text-xs gap-1.5">
                                                <Download className="w-3.5 h-3.5" />
                                                Export
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={handleExportPDF}>
                                                <FileText className="w-3.5 h-3.5 mr-2" /> Export as PDF
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={handleExportCSV}>
                                                <Download className="w-3.5 h-3.5 mr-2" /> Export as CSV
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>
                            {(searchQuery || hasDateFilter) && (
                                <p className="text-xs text-muted-foreground mt-2">
                                    Showing {filteredCitizens.length} of {citizens.length} citizens
                                    {hasDateFilter && datePreset !== "custom" && datePreset !== "all" && (
                                        <span className="ml-1">({datePreset === "7d" ? "last 7 days" : datePreset === "30d" ? "last 30 days" : datePreset === "90d" ? "last 90 days" : "this year"})</span>
                                    )}
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="h-10 pl-6">
                                            <button className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleSort("name")}>
                                                User <SortIcon field="name" />
                                            </button>
                                        </TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Email</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Location</TableHead>
                                        <TableHead className="h-10">
                                            <button className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleSort("reports")}>
                                                Reports <SortIcon field="reports" />
                                            </button>
                                        </TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Auth</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Status</TableHead>
                                        <TableHead className="h-10">
                                            <button className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors" onClick={() => handleSort("joined")}>
                                                Joined <SortIcon field="joined" />
                                            </button>
                                        </TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Last Active</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10 pr-6 w-10">{" "}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredCitizens.map((user) => (
                                        <TableRow
                                            key={user.uid}
                                            className="cursor-pointer border-border/30 hover:bg-muted/50 transition-colors group"
                                            onClick={() => setSelectedUser(user)}
                                        >
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-3">
                                                    <Avatar className="w-8 h-8">
                                                        <AvatarFallback className="text-[10px] font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
                                                            {(user.full_name || "U").split(" ").map((n) => n[0]).join("")}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <span className="text-sm font-medium">{user.full_name || "Unnamed"}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{user.email}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {user.citizen_profile?.city || "N/A"}{user.citizen_profile?.province ? `, ${user.citizen_profile.province}` : ""}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <FileText className="w-3 h-3 text-muted-foreground" />
                                                    <span className="text-xs font-medium">{user.citizen_profile?.total_reports || 0}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="secondary" className="text-[10px] capitalize px-2 py-0.5">
                                                    {user.auth_provider}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] font-medium px-2 py-0.5 capitalize ${statusColors[user.status] || ""}`}
                                                >
                                                    {user.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Never"}
                                            </TableCell>
                                            <TableCell className="pr-6">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                                            <MoreHorizontal className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedUser(user); }}>
                                                            <Eye className="w-3.5 h-3.5 mr-2" /> View Profile
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        {user.status === "active" ? (
                                                            <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); toggleUserStatus(user.uid, user.status); }}>
                                                                <UserX className="w-3.5 h-3.5 mr-2" /> Suspend User
                                                            </DropdownMenuItem>
                                                        ) : (
                                                            <DropdownMenuItem className="text-success" onClick={(e) => { e.stopPropagation(); toggleUserStatus(user.uid, user.status); }}>
                                                                <UserCheck className="w-3.5 h-3.5 mr-2" /> Activate User
                                                            </DropdownMenuItem>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="workers" className="mt-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredWorkers.map((worker) => (
                            <Card
                                key={worker.uid}
                                className="border-border/50 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 hover:border-primary/20 cursor-pointer group"
                                onClick={() => setSelectedUser(worker)}
                            >
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="w-10 h-10">
                                                <AvatarFallback className="text-xs font-bold bg-linear-to-br from-info/20 to-info/5 text-info">
                                                    {(worker.full_name || "W").split(" ").map((n) => n[0]).join("")}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <p className="text-sm font-semibold">{worker.full_name || "Unnamed"}</p>
                                                <p className="text-[11px] text-muted-foreground">{worker.email}</p>
                                            </div>
                                        </div>
                                        <Badge variant="outline" className={`text-[10px] ${statusColors[worker.status] || ""}`}>
                                            {worker.status}
                                        </Badge>
                                    </div>

                                    <Separator className="my-3" />

                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground flex items-center gap-1.5">
                                                <MapPin className="w-3 h-3" /> Area
                                            </span>
                                            <span className="font-medium">{worker.worker_profile?.service_area || "Unassigned"}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground flex items-center gap-1.5">
                                                <FileText className="w-3 h-3" /> Resolved
                                            </span>
                                            <span className="font-medium">{worker.worker_profile?.total_completed || 0} resolved</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3" /> Last active
                                            </span>
                                            <span className="font-medium">
                                                {worker.last_login_at
                                                    ? new Date(worker.last_login_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                                                    : "Never"}
                                            </span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {/* User Detail Dialog */}
            <Dialog open={!!selectedUser} onOpenChange={(open) => !open && setSelectedUser(null)}>
                <DialogContent className="max-w-md">
                    {selectedUser && (
                        <>
                            <DialogHeader>
                                <div className="flex items-center gap-4">
                                    <Avatar className="w-14 h-14">
                                        <AvatarFallback className="text-lg font-bold bg-linear-to-br from-primary/20 to-primary/5 text-primary">
                                            {(selectedUser.full_name || "U").split(" ").map((n) => n[0]).join("")}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div>
                                        <DialogTitle>{selectedUser.full_name || "Unnamed"}</DialogTitle>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className={`text-[10px] capitalize ${roleColors[selectedUser.role]}`}>
                                                {selectedUser.role}
                                            </Badge>
                                            <Badge variant="outline" className={`text-[10px] capitalize ${statusColors[selectedUser.status] || ""}`}>
                                                {selectedUser.status}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </DialogHeader>

                            <div className="space-y-4 mt-4">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 text-sm">
                                        <Mail className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-muted-foreground">{selectedUser.email}</span>
                                    </div>
                                    {selectedUser.phone && (
                                        <div className="flex items-center gap-3 text-sm">
                                            <Phone className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-muted-foreground">{selectedUser.phone}</span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-3 text-sm">
                                        <Shield className="w-4 h-4 text-muted-foreground" />
                                        <span className="text-muted-foreground capitalize">{selectedUser.auth_provider} auth</span>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-3 gap-3">
                                    <Card className="border-border/50">
                                        <CardContent className="p-3 text-center">
                                            <p className="text-[10px] text-muted-foreground uppercase">
                                                {selectedUser.role === "worker" ? "Resolved" : "Reports"}
                                            </p>
                                            <p className="text-xl font-bold text-primary mt-1">
                                                {selectedUser.role === "worker"
                                                    ? (selectedUser as WorkerWithProfile).worker_profile?.total_completed || 0
                                                    : (selectedUser as CitizenWithProfile).citizen_profile?.total_reports || 0}
                                            </p>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-border/50">
                                        <CardContent className="p-3 text-center">
                                            <p className="text-[10px] text-muted-foreground uppercase">Joined</p>
                                            <p className="text-xs font-medium mt-2">
                                                {new Date(selectedUser.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                                            </p>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-border/50">
                                        <CardContent className="p-3 text-center">
                                            <p className="text-[10px] text-muted-foreground uppercase">Last Login</p>
                                            <p className="text-xs font-medium mt-2">
                                                {selectedUser.last_login_at
                                                    ? new Date(selectedUser.last_login_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                                    : "Never"}
                                            </p>
                                        </CardContent>
                                    </Card>
                                </div>

                                <div className="flex items-center gap-2 pt-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs flex-1"
                                        onClick={() => { const param = selectedUser.role === "worker" ? "worker" : "citizen"; setSelectedUser(null); router.push(`/dashboard/reports?${param}=${selectedUser.uid}`); }}
                                    >
                                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                                        View Reports
                                    </Button>
                                    {selectedUser.status === "active" ? (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs flex-1 text-destructive hover:text-destructive"
                                            onClick={() => toggleUserStatus(selectedUser.uid, selectedUser.status)}
                                        >
                                            <UserX className="w-3.5 h-3.5 mr-1.5" />
                                            Suspend
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-xs flex-1 text-success hover:text-success"
                                            onClick={() => toggleUserStatus(selectedUser.uid, selectedUser.status)}
                                        >
                                            <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                                            Activate
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
