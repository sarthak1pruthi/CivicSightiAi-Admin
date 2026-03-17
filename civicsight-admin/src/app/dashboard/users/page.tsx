"use client";

import { useState, useEffect, useCallback } from "react";
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

    const filteredCitizens = citizens.filter(
        (u) =>
            !searchQuery ||
            (u.full_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                <TabsList className="grid w-[300px] grid-cols-2 h-9">
                    <TabsTrigger value="citizens" className="text-xs">
                        Citizens ({citizens.length})
                    </TabsTrigger>
                    <TabsTrigger value="workers" className="text-xs">
                        Workers ({workers.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="citizens" className="mt-4 space-y-4">
                    <Card className="border-border/50">
                        <CardContent className="p-4">
                            <div className="flex gap-3">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search citizens by name, email..."
                                        className="pl-9 h-9 text-sm bg-muted/30 border-border/50"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/50">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent border-border/50">
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10 pl-6">User</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Email</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Location</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Reports</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Auth</TableHead>
                                        <TableHead className="text-xs font-medium text-muted-foreground h-10">Status</TableHead>
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
                                                        <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
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
                                                <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-info/20 to-info/5 text-info">
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
                                        <AvatarFallback className="text-lg font-bold bg-gradient-to-br from-primary/20 to-primary/5 text-primary">
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
