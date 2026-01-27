import React, { useMemo } from "react";
import { CalendarClock, RefreshCcw, Search, Zap, Play } from "lucide-react";

import { useCyberContext } from "@/contexts/CyberContext.jsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const TIME_RANGES = [
  { value: "15m", label: "15 мин" },
  { value: "1h", label: "1 час" },
  { value: "24h", label: "24 часа" },
  { value: "7d", label: "7 дней" },
  { value: "custom", label: "Custom" },
];

const SEVERITIES = ["low", "medium", "high", "critical"];

const SEGMENTS = ["dmz", "internal", "prod", "office", "cloud"];

const EVENT_TYPES = ["auth", "netflow", "waf", "ids", "endpoint", "dns", "custom"];

function toLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
}

export default function FiltersBar({ scenarios = [], onRunScenario }) {
  const { filters, updateFilters, resetFilters } = useCyberContext();

  const severitySet = useMemo(() => new Set(filters.severity), [filters.severity]);

  const handleRangeChange = (value) => {
    if (value === filters.timeRange) {
      return;
    }
    updateFilters({
      timeRange: value,
      customRange: value === "custom" ? filters.customRange ?? null : null,
    });
  };

  const toggleCollectionValue = (key, value) => {
    updateFilters((prev) => {
      const next = new Set(prev[key] ?? []);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, [key]: Array.from(next) };
    });
  };

  const handleCustomRangeChange = (part, rawValue) => {
    const iso = rawValue ? new Date(rawValue).toISOString() : null;
    updateFilters((prev) => ({
      ...prev,
      timeRange: "custom",
      customRange: {
        from: part === "from" ? iso : prev.customRange?.from ?? iso,
        to: part === "to" ? iso : prev.customRange?.to ?? iso,
      },
    }));
  };

  return (
    <Card className="p-4 lg:p-6 border border-slate-200 shadow-lg bg-white/90 space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-slate-600 font-medium">
          <CalendarClock className="w-5 h-5 text-slate-500" />
          <span>Диапазон времени</span>
        </div>
        <div className="flex items-center gap-2">
          <Zap className={`w-4 h-4 ${filters.live ? "text-emerald-500" : "text-slate-400"}`} />
          <Switch
            checked={filters.live}
            onCheckedChange={(checked) => updateFilters({ live: Boolean(checked) })}
            aria-label="Live режим"
          />
          <span className="text-sm text-slate-600">Live mode</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {TIME_RANGES.map((range) => (
          <Button
            key={range.value}
            variant={filters.timeRange === range.value ? "default" : "outline"}
            size="sm"
            onClick={() => handleRangeChange(range.value)}
          >
            {range.label}
          </Button>
        ))}
        {filters.timeRange === "custom" && (
          <div className="flex flex-wrap gap-2 items-center">
            <Input
              type="datetime-local"
              value={toLocalInput(filters.customRange?.from)}
              onChange={(event) => handleCustomRangeChange("from", event.target.value)}
            />
            <span className="text-slate-500 text-sm">—</span>
            <Input
              type="datetime-local"
              value={toLocalInput(filters.customRange?.to)}
              onChange={(event) => handleCustomRangeChange("to", event.target.value)}
            />
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-2">
          <RefreshCcw className="w-4 h-4" />
          Сбросить
        </Button>
      </div>
      <div className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Severity</p>
          <div className="flex flex-wrap gap-2">
            {SEVERITIES.map((level) => (
              <Badge
                key={level}
                variant={severitySet.has(level) ? "default" : "outline"}
                className="cursor-pointer capitalize"
                onClick={() => toggleCollectionValue("severity", level)}
              >
                {level}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Сегменты</p>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((segment) => (
              <Badge
                key={segment}
                variant={filters.segments.includes(segment) ? "default" : "outline"}
                className="cursor-pointer capitalize"
                onClick={() => toggleCollectionValue("segments", segment)}
              >
                {segment}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Тип события</p>
          <div className="flex flex-wrap gap-2">
            {EVENT_TYPES.map((type) => (
              <Badge
                key={type}
                variant={filters.eventTypes.includes(type) ? "default" : "outline"}
                className="cursor-pointer uppercase tracking-tight"
                onClick={() => toggleCollectionValue("eventTypes", type)}
              >
                {type}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            placeholder="Поиск по IP/hostname/user…"
            value={filters.search}
            onChange={(event) => updateFilters({ search: event.target.value })}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-lg px-3 py-2 text-sm bg-white text-slate-700"
            value={filters.scenarioId}
            onChange={(event) => updateFilters({ scenarioId: event.target.value })}
          >
            <option value="">Все сценарии</option>
            {scenarios.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!filters.scenarioId || !onRunScenario}
            onClick={() => filters.scenarioId && onRunScenario(filters.scenarioId)}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            Запуск
          </Button>
        </div>
      </div>
    </Card>
  );
}

FiltersBar.defaultProps = {
  scenarios: [],
  onRunScenario: undefined,
};
