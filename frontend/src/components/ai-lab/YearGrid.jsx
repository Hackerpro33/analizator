import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import clsx from "clsx";
import { computeDeltaMap } from "./utils";

const MONTH_LABELS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function formatValue(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function MonthTile({ item, delta, deltaMode, overlayForecast, isSelected, onSelect }) {
  if (!item) {
    return <div className="h-20 rounded-lg border border-dashed border-slate-200 bg-slate-50/70" />;
  }
  const primaryValue = item.actual ?? item.forecast;
  const showForecast = overlayForecast && item.actual !== null && item.forecast !== null;
  const deltaInfo = delta?.[deltaMode] || {};
  const deltaAbs = deltaInfo.abs;
  const deltaPct = deltaInfo.pct;
  let deltaColor = "text-slate-500";
  if (deltaAbs > 0) deltaColor = "text-emerald-600";
  if (deltaAbs < 0) deltaColor = "text-red-500";

  const handleClick = (event) => {
    if (onSelect) {
      onSelect(item.date, event);
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleClick}
            className={clsx(
              "w-full h-24 p-2 rounded-lg border text-left transition",
              isSelected ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white",
              item.isForecast && "border-dashed",
            )}
          >
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{item.label}</span>
              {item.isForecast && <Badge variant="outline">Прогноз</Badge>}
            </div>
            <div className="text-lg font-semibold text-slate-900">{formatValue(primaryValue)}</div>
            {showForecast && (
              <p className="text-[11px] text-slate-500">
                Прогноз: {formatValue(item.forecast)}
              </p>
            )}
            <div className={clsx("text-xs font-medium", deltaColor)}>
              {deltaAbs !== undefined && deltaAbs !== null ? (
                <>
                  Δ {deltaMode === "yoy" ? "г/г" : "м/м"}: {deltaAbs > 0 ? "+" : ""}
                  {deltaAbs.toFixed(1)} {deltaPct !== undefined && !Number.isNaN(deltaPct) && `(${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}
                </>
              ) : (
                <span className="text-slate-400">Нет базы для сравнения</span>
              )}
            </div>
          </button>
        </TooltipTrigger>
        {(item.lower !== null || item.upper !== null) && (
          <TooltipContent>
            <div className="text-xs space-y-1">
              <p>Доверительный интервал:</p>
              <p>
                {formatValue(item.lower)} — {formatValue(item.upper)}
              </p>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export default function YearGrid({
  timeline = [],
  years = [],
  selectedYears = [],
  selectedTiles = new Set(),
  onTileSelect,
  deltaMode = "mom",
  overlayForecast = false,
}) {
  const monthsByYear = useMemo(() => {
    const result = {};
    timeline.forEach((point) => {
      const date = new Date(point.date);
      const year = date.getFullYear();
      const monthIndex = date.getMonth();
      if (!result[year]) {
        result[year] = Array(12).fill(null);
      }
      result[year][monthIndex] = {
        ...point,
        label: MONTH_LABELS[monthIndex],
        isForecast: point.actual === null && point.forecast !== null,
      };
    });
    return result;
  }, [timeline]);

  const deltaMap = useMemo(() => computeDeltaMap(timeline), [timeline]);
  const visibleYears = selectedYears.length ? selectedYears : years;

  return (
    <div className="space-y-6">
      {visibleYears.map((year) => (
        <div key={year} className="space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-slate-700">{year}</h4>
            <Badge variant="outline">{(monthsByYear[year] || []).filter(Boolean).length} точек</Badge>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(monthsByYear[year] || Array(12).fill(null)).map((item, idx) => (
              <MonthTile
                key={`${year}-${idx}`}
                item={item}
                delta={item ? deltaMap[item.date] : null}
                deltaMode={deltaMode}
                overlayForecast={overlayForecast}
                isSelected={item ? selectedTiles.has(item.date) : false}
                onSelect={onTileSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
