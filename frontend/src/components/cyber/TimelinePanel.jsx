import React, { useMemo, useRef, useState, useEffect } from "react";
import { Area, AreaChart, Brush, ResponsiveContainer, Tooltip } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const ROW_HEIGHT = 72;

function formatTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function severityColor(level) {
  switch (level) {
    case "critical":
      return "bg-rose-500";
    case "high":
      return "bg-orange-500";
    case "medium":
      return "bg-amber-500";
    default:
      return "bg-slate-500";
  }
}

function EventRow({ eventItem, isActive, onSelect }) {
  return (
    <button
      type="button"
      className={`w-full text-left border border-slate-100 rounded-xl p-3 mb-2 ${
        isActive ? "bg-indigo-50 border-indigo-200" : "bg-white"
      }`}
      onClick={() => onSelect?.({ type: "event", data: eventItem })}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">{formatTimestamp(eventItem.ts)}</div>
        <Badge className={`${severityColor(eventItem.severity)} text-white capitalize`}>{eventItem.severity}</Badge>
      </div>
      <div className="mt-2 text-sm font-medium text-slate-800">
        {eventItem.src_ip} → {eventItem.dst_host || eventItem.dst_ip || "unknown"}
      </div>
      <div className="text-xs text-slate-500 flex justify-between mt-1">
        <span>{eventItem.event_type?.toUpperCase()}</span>
        <span>{eventItem.action}</span>
      </div>
    </button>
  );
}

export default function TimelinePanel({ summary, events, selection, onSelect, onRangeSelect }) {
  const safeEvents = useMemo(
    () => ({
      items: events?.items ?? [],
      page: events?.page ?? 1,
      total: events?.total ?? events?.items?.length ?? 0,
    }),
    [events],
  );
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(320);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      setContainerHeight(entries[0]?.contentRect?.height ?? 320);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const chartData = useMemo(() => summary?.eps?.trend ?? [], [summary]);

  const totalHeight = (safeEvents.items?.length ?? 0) * ROW_HEIGHT;
  const visibleCount = Math.ceil(containerHeight / ROW_HEIGHT) + 4;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
  const endIndex = Math.min(safeEvents.items.length, startIndex + visibleCount);
  const visibleEvents = safeEvents.items.slice(startIndex, endIndex);

  const handleBrushChange = (range) => {
    if (!range || chartData.length === 0) return;
    const start = chartData[Math.max(range.startIndex ?? 0, 0)];
    const end = chartData[Math.min(range.endIndex ?? chartData.length - 1, chartData.length - 1)];
    if (start && end) {
      onRangeSelect?.({ from: start.bucket, to: end.bucket });
    }
  };

  return (
    <Card className="border border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-slate-700">Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="h-56">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <Tooltip
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                  formatter={(value) => [`${value} events`, "EPS"]}
                />
                <Area type="monotone" dataKey="value" stroke="#2563eb" fill="#93c5fd" />
                <Brush dataKey="bucket" height={20} stroke="#94a3b8" onChange={handleBrushChange} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-slate-500">Нет данных для выбранного диапазона.</div>
          )}
        </div>
        <div
          ref={containerRef}
          className="h-96 overflow-auto bg-slate-50/60 rounded-xl p-4 border border-slate-200"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div style={{ height: totalHeight, position: "relative" }}>
            <div style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}>
              {visibleEvents.map((eventItem) => (
                <EventRow
                  key={eventItem.id}
                  eventItem={eventItem}
                  isActive={selection?.type === "event" && selection?.data?.id === eventItem.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
          {!safeEvents.items.length && <p className="text-sm text-slate-500">События не найдены.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
