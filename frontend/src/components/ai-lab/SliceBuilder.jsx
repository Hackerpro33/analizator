import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { computeDeltaMap, aggregateValues } from "./utils";

const AGGREGATIONS = [
  { id: "sum", label: "Сумма" },
  { id: "avg", label: "Среднее" },
  { id: "min", label: "Минимум" },
  { id: "max", label: "Максимум" },
];

const MODES = [
  { id: "years", label: "Годы целиком" },
  { id: "single-month", label: "Один месяц по годам" },
  { id: "custom", label: "Произвольные месяцы" },
];

export default function SliceBuilder({
  timeline = [],
  selectedYears = [],
  selectedTiles = new Set(),
  onClearSelection,
  onSummaryChange,
}) {
  const [mode, setMode] = useState("years");
  const [aggregation, setAggregation] = useState("sum");
  const [deltaMode, setDeltaMode] = useState("mom");
  const [singleMonth, setSingleMonth] = useState("0");

  const deltaMap = useMemo(() => computeDeltaMap(timeline), [timeline]);

  const includedMonths = useMemo(() => {
    const years = selectedYears.length ? selectedYears : Array.from(
      new Set(timeline.map((point) => new Date(point.date).getFullYear())),
    );
    if (mode === "years") {
      return timeline.filter((point) => years.includes(new Date(point.date).getFullYear()));
    }
    if (mode === "single-month") {
      const monthIndex = Number(singleMonth);
      return timeline.filter((point) => {
        const date = new Date(point.date);
        return years.includes(date.getFullYear()) && date.getMonth() === monthIndex;
      });
    }
    return timeline.filter((point) => selectedTiles.has(point.date));
  }, [mode, selectedYears, timeline, selectedTiles, singleMonth]);

  const aggregationResult = useMemo(() => aggregateValues(includedMonths, aggregation), [includedMonths, aggregation]);

  const aggregateDelta = useMemo(() => {
    if (!includedMonths.length) return null;
    const lastPoint = includedMonths[includedMonths.length - 1];
    const delta = deltaMap[lastPoint.date]?.[deltaMode];
    return delta || null;
  }, [includedMonths, deltaMap, deltaMode]);

  useEffect(() => {
    if (onSummaryChange) {
      onSummaryChange({
        aggregate: {
          value: aggregationResult,
          label: AGGREGATIONS.find((agg) => agg.id === aggregation)?.label,
        },
        delta: aggregateDelta
          ? { abs: aggregateDelta.abs, pct: aggregateDelta.pct, type: deltaMode }
          : null,
        selectionCount: includedMonths.length,
      });
    }
  }, [aggregationResult, aggregateDelta, deltaMode, aggregation, includedMonths.length, onSummaryChange]);

  return (
    <Card className="border-dashed border-slate-200 bg-white/80">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={mode} onValueChange={setMode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Режим среза" />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {mode === "single-month" && (
            <Select value={singleMonth} onValueChange={setSingleMonth}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Месяц" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }).map((_, index) => (
                  <SelectItem key={index} value={String(index)}>
                    {index + 1} месяц
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={aggregation} onValueChange={setAggregation}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Агрегация" />
            </SelectTrigger>
            <SelectContent>
              {AGGREGATIONS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deltaMode} onValueChange={setDeltaMode}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="База сравнения" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mom">Месяц к месяцу</SelectItem>
              <SelectItem value="yoy">Год к году</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline">{includedMonths.length} месяцев</Badge>
          {mode === "custom" && (
            <Button variant="ghost" size="sm" onClick={onClearSelection}>
              Очистить выбор
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-500">Агрегированное значение</p>
            <p className="text-xl font-semibold">
              {aggregationResult !== null ? aggregationResult.toFixed(2) : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Δ ({deltaMode === "yoy" ? "г/г" : "м/м"})</p>
            {aggregateDelta ? (
              <p className="text-lg font-medium">
                {aggregateDelta.abs > 0 ? "+" : ""}
                {aggregateDelta.abs?.toFixed(1)} ({aggregateDelta.pct ? `${aggregateDelta.pct.toFixed(1)}%` : "—"})
              </p>
            ) : (
              <p className="text-lg text-slate-400">—</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white overflow-auto max-h-72">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Месяц</TableHead>
                <TableHead>Факт</TableHead>
                <TableHead>Прогноз</TableHead>
                <TableHead>Выбранное</TableHead>
                <TableHead>Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {includedMonths.map((row) => {
                const delta = deltaMap[row.date]?.[deltaMode];
                const primary = row.actual ?? row.forecast;
                return (
                  <TableRow key={row.date}>
                    <TableCell>{new Date(row.date).toLocaleDateString("ru-RU", { year: "numeric", month: "short" })}</TableCell>
                    <TableCell>{row.actual !== null && row.actual !== undefined ? row.actual.toFixed(2) : "—"}</TableCell>
                    <TableCell>{row.forecast !== null && row.forecast !== undefined ? row.forecast.toFixed(2) : "—"}</TableCell>
                    <TableCell className="font-medium">{primary !== null && primary !== undefined ? primary.toFixed(2) : "—"}</TableCell>
                    <TableCell>
                      {delta?.abs !== null && delta?.abs !== undefined ? (
                        <>
                          {delta.abs > 0 ? "+" : ""}
                          {delta.abs.toFixed(2)} {delta.pct !== null && delta.pct !== undefined && `(${delta.pct.toFixed(1)}%)`}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!includedMonths.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-slate-500">
                    Нет выбранных месяцев.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
