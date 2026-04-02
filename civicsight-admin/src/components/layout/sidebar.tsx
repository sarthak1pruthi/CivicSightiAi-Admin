"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    LayoutDashboard,
    FileText,
    Users,
    Map,
    BarChart3,
    Settings,
    ChevronLeft,
    LogOut,
    Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useState, useEffect, useCallback } from "react";
import { getCurrentAdmin, adminLogout } from "@/lib/queries";
import { apiFetch } from "@/lib/api";
import { supabase } from "@/lib/supabase";

interface AdminInfo {
    full_name: string;
    email: string;
}

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [admin, setAdmin] = useState<AdminInfo | null>(null);
    const [pendingReportCount, setPendingReportCount] = useState<number>(0);

    const fetchPendingCount = useCallback(async () => {
        try {
            const data = await apiFetch<{ count: number }>("/api/reports?count=pending");
            setPendingReportCount(data.count);
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        getCurrentAdmin().then((u) => {
            if (u) setAdmin({ full_name: u.full_name, email: u.email });
        });
        fetchPendingCount();

        // Re-fetch when reports table changes
        const channel = supabase
            .channel("sidebar-reports")
            .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
                fetchPendingCount();
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchPendingCount]);

    const navItems = [
        { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, badge: null },
        { label: "Reports", href: "/dashboard/reports", icon: FileText, badge: pendingReportCount || null },
        { label: "Users", href: "/dashboard/users", icon: Users, badge: null },
        { label: "Map", href: "/dashboard/map", icon: Map, badge: null },
        { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3, badge: null },
        { label: "Settings", href: "/dashboard/settings", icon: Settings, badge: null },
    ];

    const handleLogout = async () => {
        await adminLogout();
        router.push("/");
    };

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 h-screen flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 ease-in-out",
                collapsed ? "w-[68px]" : "w-[260px]"
            )}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 h-16 flex-shrink-0">
                <div className="relative flex items-center justify-center w-9 h-9 rounded-lg overflow-hidden shadow-lg shadow-sidebar-primary/20">
                    <img src="/logo.png" alt="CivicSight AI" className="w-full h-full object-contain" />
                </div>
                {!collapsed && (
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold tracking-tight text-sidebar-foreground">
                            CivicSightAI
                        </span>
                        <span className="text-[10px] font-medium text-sidebar-foreground/50 uppercase tracking-widest">
                            Admin Portal
                        </span>
                    </div>
                )}
            </div>

            <Separator className="bg-sidebar-border mx-3" />

            {/* Navigation */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive =
                        pathname === item.href ||
                        (item.href !== "/dashboard" && pathname.startsWith(item.href));

                    const link = (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-smooth group relative",
                                isActive
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                            )}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-primary" />
                            )}
                            <item.icon
                                className={cn(
                                    "w-[18px] h-[18px] flex-shrink-0 transition-smooth",
                                    isActive
                                        ? "text-sidebar-primary"
                                        : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
                                )}
                            />
                            {!collapsed && (
                                <span className="flex-1">{item.label}</span>
                            )}
                            {!collapsed && item.badge && (
                                <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground animate-pulse-glow">
                                    {item.badge}
                                </span>
                            )}
                            {collapsed && item.badge && (
                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-sidebar" />
                            )}
                        </Link>
                    );

                    if (collapsed) {
                        return (
                            <Tooltip key={item.href} delayDuration={0}>
                                <TooltipTrigger asChild>{link}</TooltipTrigger>
                                <TooltipContent
                                    side="right"
                                    className="font-medium"
                                >
                                    {item.label}
                                </TooltipContent>
                            </Tooltip>
                        );
                    }

                    return link;
                })}
            </nav>

            <Separator className="bg-sidebar-border mx-3" />

            {/* Bottom section */}
            <div className="p-3 space-y-1">
                {!collapsed && (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-sidebar-accent/30">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-primary/60 flex items-center justify-center text-xs font-bold text-sidebar-primary-foreground shadow-sm">
                            {admin?.full_name?.charAt(0)?.toUpperCase() || "A"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-sidebar-foreground truncate">
                                {admin?.full_name || "Admin"}
                            </p>
                            <p className="text-[10px] text-sidebar-foreground/40 truncate">
                                {admin?.email || ""}
                            </p>
                        </div>
                    </div>
                )}

                <div className={cn("flex gap-1", collapsed ? "flex-col" : "flex-row")}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCollapsed(!collapsed)}
                        className={cn(
                            "flex-1 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                            collapsed ? "justify-center px-0" : "justify-start"
                        )}
                    >
                        <ChevronLeft
                            className={cn(
                                "w-4 h-4 transition-transform duration-300",
                                collapsed ? "rotate-180" : ""
                            )}
                        />
                        {!collapsed && <span className="ml-2 text-xs">Collapse</span>}
                    </Button>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className={cn(
                            "text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10",
                            collapsed ? "justify-center px-0" : "justify-start"
                        )}
                    >
                        <LogOut className="w-4 h-4" />
                        {!collapsed && <span className="ml-2 text-xs">Log Out</span>}
                    </Button>
                </div>
            </div>
        </aside>
    );
}
