import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, CircleMarker, Polyline, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import HeatmapGrid from "./HeatmapGrid.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const severityColors = {
  low: "#a5b4fc",
  medium: "#60a5fa",
  high: "#f97316",
  critical: "#ef4444",
};

function buildLatLng(point) {
  if (!point) return null;
  if (typeof point.lat !== "number" || typeof point.lon !== "number") {
    return null;
  }
  return [point.lat, point.lon];
}

function LocalTileLayer() {
  const map = useMap();
  useEffect(() => {
    const layer = L.gridLayer({ tileSize: 256 });
    layer.createTile = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      const gradient = ctx.createLinearGradient(0, 0, 256, 256);
      gradient.addColorStop(0, "#0f172a");
      gradient.addColorStop(1, "#172554");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 256, 256);
      return canvas;
    };
    layer.addTo(map);
    return () => {
      layer.remove();
    };
  }, [map]);
  return null;
}

function AttackMap({ connections, selection, onSelect }) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      zoomControl={false}
      className="h-[420px] w-full rounded-xl overflow-hidden border border-slate-200"
      scrollWheelZoom={false}
      doubleClickZoom={false}
    >
      <LocalTileLayer />
      {connections.map((connection) => {
        const source = buildLatLng(connection.source);
        const target = buildLatLng(connection.target);
        if (!source || !target) {
          return null;
        }
        const key = connection.id ?? `${connection.source?.asn || ""}-${connection.target?.asn || ""}-${connection.count}`;
        const severityColor = severityColors[connection.severity] ?? severityColors.low;
        const isActive = selection?.type === "connection" && selection?.data?.id === connection.id;
        return (
          <React.Fragment key={key}>
            <Polyline
              positions={[source, target]}
              pathOptions={{
                color: severityColor,
                weight: isActive ? 5 : Math.min(Math.max(connection.count, 1), 6),
                opacity: isActive ? 0.9 : 0.6,
              }}
              eventHandlers={{
                click: () => onSelect?.({ type: "connection", data: connection }),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]} opacity={0.9}>
                <div className="text-xs">
                  <p>Src: {connection.source?.asn || connection.source?.country || "Unknown"}</p>
                  <p>Dst: {connection.target?.city || "Unknown"}</p>
                  <p>Count: {connection.count}</p>
                  <p>Severity: {connection.severity}</p>
                </div>
              </Tooltip>
            </Polyline>
            <CircleMarker center={source} radius={5} pathOptions={{ color: "#22d3ee" }} />
            <CircleMarker center={target} radius={5} pathOptions={{ color: "#f97316" }} />
          </React.Fragment>
        );
      })}
    </MapContainer>
  );
}

export default function AttackMapPanel({ mapData, heatmapData, selection, onSelect, onDrilldown }) {
  const [view, setView] = useState("map");
  const connections = useMemo(
    () => (mapData?.connections ?? []).filter((item) => buildLatLng(item.source) && buildLatLng(item.target)),
    [mapData],
  );

  return (
    <Card className="h-full border border-slate-200 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-slate-700">Attack Map</CardTitle>
        <div className="flex gap-2">
          <Button variant={view === "map" ? "default" : "outline"} size="sm" onClick={() => setView("map")}>
            Map
          </Button>
          <Button variant={view === "heatmap" ? "default" : "outline"} size="sm" onClick={() => setView("heatmap")}>
            Heatmap
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {view === "map" ? (
          connections.length ? (
            <AttackMap connections={connections} selection={selection} onSelect={onSelect} />
          ) : (
            <div className="text-sm text-slate-500">Нет данных для карты атак.</div>
          )
        ) : (
          <HeatmapGrid data={heatmapData} onSelect={onSelect} onDrilldown={onDrilldown} />
        )}
        <div className="flex items-center gap-2 mt-3 text-xs text-slate-500 flex-wrap">
          <span>Severity:</span>
          {Object.entries(severityColors).map(([level, color]) => (
            <Badge key={level} style={{ background: color }} className="capitalize">
              {level}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
