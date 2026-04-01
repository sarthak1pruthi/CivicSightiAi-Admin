"use client";

import { useState, useCallback, useEffect } from "react";
import {
    APIProvider,
    Map,
    AdvancedMarker,
    InfoWindow,
    useMap,
} from "@vis.gl/react-google-maps";
import { Filter, Layers, CircleDot, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { fetchReports } from "@/lib/queries";
import type { ReportWithDetails } from "@/lib/types";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

type MapPin = {
    id: string;
    title: string;
    severity: string;
    category: string;
    status: string;
    lat: number;
    lng: number;
    time: string;
    reportNumber: number;
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

const severityColors: Record<string, string> = {
    Critical: "#ef4444",
    High: "#f97316",
    Medium: "#eab308",
    Low: "#22c55e",
};

const statusColors: Record<string, string> = {
    pending: "bg-warning/10 text-warning border-warning/20",
    in_progress: "bg-info/10 text-info border-info/20",
    resolved: "bg-success/10 text-success border-success/20",
    closed: "bg-muted text-muted-foreground border-border",
};

// Default center: Downtown Toronto
const DEFAULT_CENTER = { lat: 43.6532, lng: -79.3832 };
const DEFAULT_ZOOM = 14;

// Component to hide POIs after map loads (styles prop is ignored when mapId is set)
function HidePOIs() {
    const map = useMap();
    useEffect(() => {
        if (!map) return;
        map.setOptions({
            styles: [
                { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
                { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
            ],
        });
    }, [map]);
    return null;
}

function ReportMarker({
    report,
    isSelected,
    onClick,
}: {
    report: MapPin;
    isSelected: boolean;
    onClick: () => void;
}) {
    const color = severityColors[report.severity];

    return (
        <AdvancedMarker
            position={{ lat: report.lat, lng: report.lng }}
            onClick={onClick}
        >
            <div className="relative cursor-pointer group">
                {/* Animated pulse ring */}
                {(report.severity === "Critical" || report.severity === "High") &&
                    report.status !== "resolved" &&
                    report.status !== "closed" && (
                        <div
                            className="absolute inset-0 rounded-full animate-ping opacity-30"
                            style={{ backgroundColor: color, transform: "scale(2)" }}
                        />
                    )}
                {/* Pin dot – 1.5× size */}
                <div
                    className="w-6 h-6 rounded-full border-2 border-white shadow-lg transition-transform group-hover:scale-150"
                    style={{
                        backgroundColor: color,
                        boxShadow: `0 0 10px ${color}80`,
                    }}
                />
            </div>
        </AdvancedMarker>
    );
}

export default function MapPage() {
    const [reportPins, setReportPins] = useState<MapPin[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedReport, setSelectedReport] = useState<MapPin | null>(null);
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const reports = await fetchReports();
                const pins: MapPin[] = reports
                    .filter((r) => r.location?.latitude && r.location?.longitude)
                    .map((r) => ({
                        id: r.id,
                        title: r.description.slice(0, 80),
                        severity: getSeverityLabel(r.ai_severity),
                        category: r.category?.name || r.ai_category_name || "Uncategorized",
                        status: r.status,
                        lat: r.location!.latitude,
                        lng: r.location!.longitude,
                        time: timeAgo(r.reported_at),
                        reportNumber: r.report_number,
                    }));
                setReportPins(pins);
            } catch (err) {
                console.error("Failed to load map data:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const filteredPins =
        activeFilters.length === 0
            ? reportPins
            : reportPins.filter((p) => activeFilters.includes(p.severity));

    const toggleFilter = (severity: string) => {
        setActiveFilters((prev) =>
            prev.includes(severity)
                ? prev.filter((f) => f !== severity)
                : [...prev, severity]
        );
    };

    if (!GOOGLE_MAPS_API_KEY) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                <Card className="border-border/50 max-w-md">
                    <CardContent className="p-6 text-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center mx-auto">
                            <span className="text-xl">🗺️</span>
                        </div>
                        <h3 className="text-sm font-semibold">Google Maps API Key Required</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Add <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> to your <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">.env.local</code> file and restart the dev server.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-sm text-muted-foreground">Loading map data...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Map Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground mr-1">
                        Filter by severity:
                    </span>
                    {Object.entries(severityColors).map(([severity, color]) => {
                        const isActive =
                            activeFilters.length === 0 || activeFilters.includes(severity);
                        const count = reportPins.filter(
                            (p) => p.severity === severity
                        ).length;
                        return (
                            <Button
                                key={severity}
                                variant="outline"
                                size="sm"
                                className={`text-xs h-7 gap-1.5 transition-all ${isActive ? "" : "opacity-40"
                                    }`}
                                onClick={() => toggleFilter(severity)}
                            >
                                <div
                                    className="w-2.5 h-2.5 rounded-full"
                                    style={{ backgroundColor: color }}
                                />
                                {severity}
                                <Badge
                                    variant="secondary"
                                    className="text-[9px] px-1 py-0 min-w-4 justify-center"
                                >
                                    {count}
                                </Badge>
                            </Button>
                        );
                    })}
                </div>
                <div className="text-xs text-muted-foreground">
                    {filteredPins.length} reports shown
                </div>
            </div>

            {/* Map */}
            <Card className="border-border/50 overflow-hidden">
                <CardContent className="p-0">
                    <div className="w-full h-[calc(100vh-240px)]">
                        <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                            <Map
                                defaultCenter={DEFAULT_CENTER}
                                defaultZoom={DEFAULT_ZOOM}
                                mapId="civicsight-admin-map"
                                gestureHandling="greedy"
                                disableDefaultUI={false}
                                zoomControl={true}
                                streetViewControl={false}
                                mapTypeControl={true}
                                fullscreenControl={true}
                                clickableIcons={false}
                                style={{ width: "100%", height: "100%" }}
                                onClick={() => setSelectedReport(null)}
                            >
                                <HidePOIs />
                                {filteredPins.map((report) => (
                                    <ReportMarker
                                        key={report.id}
                                        report={report}
                                        isSelected={selectedReport?.id === report.id}
                                        onClick={() => setSelectedReport(report)}
                                    />
                                ))}

                                {selectedReport && (
                                    <InfoWindow
                                        position={{
                                            lat: selectedReport.lat,
                                            lng: selectedReport.lng,
                                        }}
                                        onCloseClick={() => setSelectedReport(null)}
                                        pixelOffset={[0, -20]}
                                    >
                                        <div className="p-1 min-w-50 font-sans">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-[10px] font-mono font-semibold text-blue-600">
                                                    RPT-{selectedReport.reportNumber}
                                                </span>
                                                <span
                                                    className="text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white capitalize"
                                                    style={{
                                                        backgroundColor:
                                                            severityColors[selectedReport.severity],
                                                    }}
                                                >
                                                    {selectedReport.severity}
                                                </span>
                                            </div>
                                            <p className="text-xs font-semibold text-gray-900 mb-1">
                                                {selectedReport.title}
                                            </p>
                                            <p className="text-[10px] text-gray-500 mb-1.5">
                                                {selectedReport.category}
                                            </p>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 capitalize">
                                                    {selectedReport.status.replace("_", " ")}
                                                </span>
                                                <span className="text-[10px] text-gray-400">
                                                    {selectedReport.time}
                                                </span>
                                            </div>
                                        </div>
                                    </InfoWindow>
                                )}
                            </Map>
                        </APIProvider>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
