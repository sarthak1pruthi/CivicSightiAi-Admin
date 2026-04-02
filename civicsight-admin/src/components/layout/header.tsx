"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Search, Moon, Sun, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

const pageTitles: Record<string, { title: string; description: string }> = {
    "/dashboard": {
        title: "Dashboard",
        description: "Overview of your civic operations",
    },
    "/dashboard/reports": {
        title: "Report Management",
        description: "View and manage all civic reports",
    },
    "/dashboard/users": {
        title: "User Management",
        description: "Manage citizens and field workers",
    },
    "/dashboard/map": {
        title: "Map View",
        description: "Geographic overview of all reports",
    },
    "/dashboard/analytics": {
        title: "Analytics",
        description: "Insights and trends",
    },
    "/dashboard/settings": {
        title: "Settings",
        description: "System configuration",
    },
};

const pageSearchItems = [
    { type: "page", label: "Dashboard", href: "/dashboard" },
    { type: "page", label: "Report Management", href: "/dashboard/reports" },
    { type: "page", label: "User Management", href: "/dashboard/users" },
    { type: "page", label: "Analytics", href: "/dashboard/analytics" },
    { type: "page", label: "Map View", href: "/dashboard/map" },
    { type: "page", label: "Settings", href: "/dashboard/settings" },
];

function getBreadcrumbs(pathname: string) {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];

    let path = "";
    for (const seg of segments) {
        path += `/${seg}`;
        const title = pageTitles[path]?.title || seg.charAt(0).toUpperCase() + seg.slice(1);
        crumbs.push({ label: title, href: path });
    }
    return crumbs;
}

type NotifType = {
    id: string;
    badgeVariant: string;
    badgeLabel: string;
    badgeClass?: string;
    time: string;
    message: string;
    read: boolean;
    reportId?: string;
};

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

export function Header() {
    const pathname = usePathname();
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        setDarkMode(document.documentElement.classList.contains("dark"));
    }, []);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);
    const [searchResults, setSearchResults] = useState<{ type: string; label: string; href: string }[]>([]);
    const [searching, setSearching] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const router = useRouter();
    const [notifications, setNotifications] = useState<NotifType[]>([]);

    const performSearch = useCallback(async (query: string) => {
        if (query.length < 2) { setSearchResults([]); return; }
        setSearching(true);
        try {
            const q = query.toLowerCase();

            // Search pages locally
            const matchedPages = pageSearchItems.filter((p) => p.label.toLowerCase().includes(q));

            // Search reports and users via backend
            const apiResults = await apiFetch<{ type: string; label: string; href: string }[]>(
                `/api/search?q=${encodeURIComponent(query)}`
            );

            setSearchResults([...apiResults, ...matchedPages].slice(0, 10));
        } catch {
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    }, []);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => performSearch(value), 300);
    };

    useEffect(() => {
        async function loadNotifications() {
            try {
                const data = await apiFetch<Array<{
                    id: string;
                    report_number: number;
                    status: string;
                    ai_severity: number | null;
                    reported_at: string;
                    resolved_at: string | null;
                }>>("/api/dashboard?type=notifications");

                const notifs: NotifType[] = [];

                // Count today's reports by category
                let highSeverityCount = 0;
                let pendingCount = 0;
                let resolvedCount = 0;
                let totalToday = data.length;

                for (const r of data) {
                    const isResolved = ["resolved", "closed"].includes(r.status);
                    if ((r.ai_severity ?? 0) >= 4 && !isResolved) highSeverityCount++;
                    if ((r.status === "pending" || r.status === "open") && !isResolved) pendingCount++;
                    if (isResolved) resolvedCount++;
                }

                if (highSeverityCount > 0) {
                    notifs.push({ id: "today-high", badgeVariant: "destructive", badgeLabel: "High", time: "today", message: `${highSeverityCount} high-severity report${highSeverityCount > 1 ? "s" : ""} logged today`, read: false });
                }
                if (pendingCount > 0) {
                    notifs.push({ id: "today-pending", badgeVariant: "secondary", badgeLabel: "Pending", time: "today", message: `${pendingCount} report${pendingCount > 1 ? "s" : ""} awaiting assignment today`, read: false });
                }
                if (resolvedCount > 0) {
                    notifs.push({ id: "today-resolved", badgeVariant: "default", badgeLabel: "Resolved", badgeClass: "bg-success text-white", time: "today", message: `${resolvedCount} report${resolvedCount > 1 ? "s" : ""} resolved today`, read: false });
                }
                if (totalToday > 0 && highSeverityCount === 0 && pendingCount === 0 && resolvedCount === 0) {
                    notifs.push({ id: "today-total", badgeVariant: "secondary", badgeLabel: "Info", time: "today", message: `${totalToday} report${totalToday > 1 ? "s" : ""} logged today`, read: false });
                }

                setNotifications(notifs);
            } catch {
                // silent
            }
        }
        loadNotifications();

        // ─── Realtime: listen for new worker comment notifications ───
        const channel = supabase
            .channel("header-notifications")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "notifications" },
                (payload: { new: { id: number; message: string; created_at: string; type: string; report_id?: string } }) => {
                    const row = payload.new;
                    const isStatusChange = row.type === "status_change";
                    setNotifications((prev) => [
                        {
                            id: `notif-${row.id}`,
                            badgeVariant: isStatusChange ? "secondary" : "default",
                            badgeLabel: isStatusChange ? "Status" : "Comment",
                            badgeClass: isStatusChange ? "bg-orange-500 text-white" : "bg-blue-500 text-white",
                            time: timeAgo(row.created_at),
                            message: row.message,
                            read: false,
                            reportId: row.report_id,
                        },
                        ...prev,
                    ].slice(0, 15));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const pageInfo = pageTitles[pathname] || {
        title: "Dashboard",
        description: "",
    };

    const breadcrumbs = getBreadcrumbs(pathname);

    const showDropdown = searchFocused && searchQuery.length >= 2;

    const toggleTheme = () => {
        setDarkMode(!darkMode);
        document.documentElement.classList.toggle("dark");
    };

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setSearchFocused(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return (
        <header className="sticky top-0 z-30 flex flex-col justify-center min-h-16 px-6 bg-background/80 backdrop-blur-xl border-b border-border">
            <div className="flex items-center justify-between h-16">
                {/* Left side - Page title + breadcrumbs */}
                <div>
                    {/* Breadcrumbs */}
                    {breadcrumbs.length > 1 && (
                        <nav className="flex items-center gap-1 mb-0.5">
                            {breadcrumbs.map((crumb, i) => (
                                <div key={crumb.href} className="flex items-center gap-1">
                                    {i > 0 && (
                                        <ChevronRight className="w-3 h-3 text-muted-foreground/40" />
                                    )}
                                    {i < breadcrumbs.length - 1 ? (
                                        <Link
                                            href={crumb.href}
                                            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider font-medium"
                                        >
                                            {crumb.label}
                                        </Link>
                                    ) : (
                                        <span className="text-[10px] text-primary uppercase tracking-wider font-semibold">
                                            {crumb.label}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </nav>
                    )}
                    <h1 className="text-lg font-bold tracking-tight">{pageInfo.title}</h1>
                    <p className="text-xs text-muted-foreground">{pageInfo.description}</p>
                </div>

                {/* Right side - Actions */}
                <div className="flex items-center gap-2">
                    {/* Search with dropdown */}
                    <div className="relative hidden md:block" ref={searchRef}>
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search reports, users..."
                            className="w-64 pl-9 h-9 text-sm bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30"
                            value={searchQuery}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                        />

                        {/* Search Dropdown */}
                        {showDropdown && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden animate-scale-in z-50">
                                {searching ? (
                                    <div className="px-3 py-4 text-center">
                                        <p className="text-xs text-muted-foreground">Searching...</p>
                                    </div>
                                ) : searchResults.length > 0 ? (
                                    <div className="py-1 max-h-[280px] overflow-y-auto">
                                        {searchResults.map((item, i) => (
                                            <Link
                                                key={i}
                                                href={item.href}
                                                onClick={() => {
                                                    setSearchQuery("");
                                                    setSearchFocused(false);
                                                }}
                                                className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer"
                                            >
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[9px] px-1.5 py-0 uppercase tracking-wide shrink-0"
                                                >
                                                    {item.type}
                                                </Badge>
                                                <span className="text-xs text-foreground truncate">
                                                    {item.label}
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="px-3 py-4 text-center">
                                        <p className="text-xs text-muted-foreground">
                                            No results for &ldquo;{searchQuery}&rdquo;
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Theme toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="w-9 h-9 text-muted-foreground hover:text-foreground"
                        onClick={toggleTheme}
                    >
                        {darkMode ? (
                            <Sun className="w-4 h-4" />
                        ) : (
                            <Moon className="w-4 h-4" />
                        )}
                    </Button>

                    {/* Notifications */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="w-9 h-9 relative text-muted-foreground hover:text-foreground"
                            >
                                <Bell className="w-4 h-4" />
                                {notifications.filter((n) => !n.read).length > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full ring-2 ring-background" />
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80">
                            <div className="flex items-center justify-between px-3 py-2">
                                <div>
                                    <p className="text-sm font-semibold">Notifications</p>
                                    <p className="text-xs text-muted-foreground">
                                        {notifications.filter((n) => !n.read).length > 0
                                            ? `You have ${notifications.filter((n) => !n.read).length} unread`
                                            : "All caught up!"}
                                    </p>
                                </div>
                                {notifications.some((n) => !n.read) && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-[10px] h-6 px-2 text-primary hover:text-primary"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setNotifications((prev) =>
                                                prev.map((n) => ({ ...n, read: true }))
                                            );
                                        }}
                                    >
                                        Mark all as read
                                    </Button>
                                )}
                            </div>
                            <DropdownMenuSeparator />
                            {notifications.map((notif) => (
                                <DropdownMenuItem
                                    key={notif.id}
                                    className={`flex items-start gap-2 p-3 cursor-pointer ${
                                        notif.read ? "opacity-60" : ""
                                    }`}
                                    onClick={() => {
                                        setNotifications((prev) =>
                                            prev.map((n) =>
                                                n.id === notif.id ? { ...n, read: true } : n
                                            )
                                        );
                                        if (notif.reportId) {
                                            router.push("/dashboard/reports");
                                        } else if (notif.id === "today-high") {
                                            router.push("/dashboard/reports?severity=high");
                                        } else if (notif.id === "today-pending") {
                                            router.push("/dashboard/reports?status=pending");
                                        } else if (notif.id === "today-resolved") {
                                            router.push("/dashboard/reports?status=resolved");
                                        } else {
                                            router.push("/dashboard/reports");
                                        }
                                    }}
                                >
                                    {/* Unread dot indicator */}
                                    <div className="flex-shrink-0 mt-1.5">
                                        <div
                                            className={`w-2 h-2 rounded-full ${
                                                notif.read
                                                    ? "bg-transparent"
                                                    : "bg-primary"
                                            }`}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Badge
                                                variant={notif.badgeVariant as "destructive" | "secondary" | "default"}
                                                className={`text-[10px] px-1.5 py-0 ${
                                                    notif.badgeClass || ""
                                                }`}
                                            >
                                                {notif.badgeLabel}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {notif.time}
                                            </span>
                                        </div>
                                        <p
                                            className={`text-sm mt-1 ${
                                                notif.read
                                                    ? "text-muted-foreground font-normal"
                                                    : "text-foreground font-medium"
                                            }`}
                                        >
                                            {notif.message}
                                        </p>
                                    </div>
                                    {/* Per-item mark as read eye icon */}
                                    <button
                                        className="flex-shrink-0 mt-1 p-0.5 rounded hover:bg-muted transition-colors"
                                        title={notif.read ? "Mark as unread" : "Mark as read"}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setNotifications((prev) =>
                                                prev.map((n) =>
                                                    n.id === notif.id
                                                        ? { ...n, read: !n.read }
                                                        : n
                                                )
                                            );
                                        }}
                                    >
                                        {notif.read ? (
                                            <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                                        ) : (
                                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                                        )}
                                    </button>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>
        </header>
    );
}
