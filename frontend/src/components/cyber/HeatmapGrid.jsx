import React, { useMemo } from "react";

const UNKNOWN_LABEL = "unknown";

function buildColor(value, max) {
  if (!max) return "rgba(148, 163, 184, 0.3)";
  const ratio = Math.min(value / max, 1);
  const hue = 210 - ratio * 180;
  const alpha = 0.2 + ratio * 0.8;
  return `hsla(${hue}, 90%, 55%, ${alpha})`;
}

export default function HeatmapGrid({ data, onSelect, onDrilldown }) {
  const normalized = data?.matrix ?? [];
  const rows = useMemo(() => {
    return Array.from(new Set(normalized.map((item) => item.row || UNKNOWN_LABEL)));
  }, [normalized]);
  const cols = useMemo(() => {
    return Array.from(new Set(normalized.map((item) => item.col || UNKNOWN_LABEL)));
  }, [normalized]);
  const matrixMap = useMemo(() => {
    const map = {};
    normalized.forEach((item) => {
      const key = `${item.row || UNKNOWN_LABEL}:${item.col || UNKNOWN_LABEL}`;
      map[key] = item.value;
    });
    return map;
  }, [normalized]);
  const maxValue = useMemo(() => normalized.reduce((acc, item) => Math.max(acc, item.value ?? 0), 0), [normalized]);

  if (!rows.length || !cols.length) {
    return <div className="text-sm text-slate-500">Нет данных для тепловой карты.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs uppercase tracking-wide text-slate-500 p-2">Row</th>
              {cols.map((col) => (
                <th key={col} className="text-xs text-slate-500 p-2 capitalize min-w-[60px]">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row}>
                <td className="text-xs uppercase tracking-wide text-slate-500 p-2">{row}</td>
                {cols.map((col) => {
                  const key = `${row}:${col}`;
                  const value = matrixMap[key] ?? 0;
                  return (
                    <td key={key} className="p-1 text-center">
                      <button
                        type="button"
                        className="w-full rounded-md text-xs font-semibold text-slate-800 transition-colors h-11 flex flex-col items-center justify-center"
                        style={{ background: buildColor(value, maxValue) }}
                        onClick={() => {
                          onSelect?.({ type: "heatmap", row, col, value });
                          if (onDrilldown) {
                            if (data?.mode === "segment_time" && row !== UNKNOWN_LABEL) {
                              onDrilldown("segment", row);
                            } else if (data?.mode === "technique_segment") {
                              if (row !== UNKNOWN_LABEL) {
                                onDrilldown("phase", row);
                              }
                              if (col !== UNKNOWN_LABEL) {
                                onDrilldown("segment", col);
                              }
                            }
                          }
                        }}
                      >
                        <span>{value}</span>
                        <span className="text-[10px] text-slate-600">{col}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-500 flex items-center gap-2">
        <span>Legend:</span>
        <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-slate-200 via-sky-300 to-blue-700" />
        <span>0</span>
        <span>{maxValue}</span>
      </div>
    </div>
  );
}
