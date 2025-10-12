import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const formatNumber = (value) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return value.toLocaleString("ru-RU");
  }

  return value.toString();
};

function TrendingCharts({ data = [], summary = {}, isLoading = false }) {
  const hasData = Array.isArray(data) && data.some((item) => (item?.datasets || 0) > 0 || (item?.visualizations || 0) > 0);

  const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
  const totalValue = data.reduce((sum, point) => sum + (point.value || 0), 0);
  const totalGrowth = data.reduce((sum, point) => sum + (point.growth || 0), 0);
  const averageValue = data.length ? totalValue / data.length : 0;
  const averageGrowth = data.length ? totalGrowth / data.length : 0;
  const firstPoint = data[0] || {};
  const lastPoint = data[data.length - 1] || {};
  const growthMomentum = (lastPoint.value || 0) - (firstPoint.value || 0);
  const stabilityIndex = data.length > 1
    ? Math.max(0, 100 - (Math.abs(growthMomentum) / Math.max(lastPoint.value || 1, 1)) * 35)
    : 100;

  const summaryMetrics = [
    {
      value: `${numberFormatter.format(averageValue)}`,
      label: "Средняя нагрузка",
      description: "обработка данных за период",
    },
    {
      value: `${numberFormatter.format(averageGrowth)}`,
      label: "Средний рост",
      description: "увеличение метрик день к дню",
    },
    {
      value: `${numberFormatter.format(growthMomentum)} ед.`,
      label: "Импульс",
      description: "изменение от начала периода",
    },
    {
      value: `${numberFormatter.format(stabilityIndex)}%`,
      label: "Индекс стабильности",
      description: "колебания процессов обработки",
    },
  ];

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Activity className="w-5 h-5 text-green-500" />
          Динамика активности
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full" />
            <div className="grid grid-cols-2 gap-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full col-span-2" />
            </div>
          </div>
        ) : (
          <>
            <div className="h-56">
              {hasData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="datasetsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#6366F1" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="visualizationsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0EA5E9" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#0EA5E9" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#CBD5F5" />
                    <XAxis dataKey="period" tickLine={false} axisLine={false} stroke="#94A3B8" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="#94A3B8" width={32} />
                    <Tooltip
                      formatter={(value, name) => [value, name === 'datasets' ? 'Наборы данных' : 'Визуализации']}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #E2E8F0' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="datasets"
                      name="Наборы данных"
                      stroke="#6366F1"
                      strokeWidth={2}
                      fill="url(#datasetsGradient)"
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="visualizations"
                      name="Визуализации"
                      stroke="#0EA5E9"
                      strokeWidth={2}
                      fill="url(#visualizationsGradient)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Недостаточно данных для отображения динамики
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Наборы данных</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.datasetCount ?? 0}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Новых за 7 дней: {summary.weeklyNewDatasets ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Визуализации</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{summary.visualizationCount ?? 0}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Новых за 7 дней: {summary.weeklyNewVisualizations ?? 0}
                </p>
              </div>

              <div className="sm:col-span-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Общее количество строк: </span>
                  {formatNumber(typeof summary.totalRows === "number" ? summary.totalRows : Number.NaN)}
                </div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-700">Последнее обновление: </span>
                  {summary.lastUpdate || "Не зафиксировано"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
              {summaryMetrics.map((metric) => (
                <div key={metric.label} className="rounded-xl bg-slate-50/70 p-3 text-center">
                  <div className="text-xl font-semibold text-slate-900">{metric.value}</div>
                  <div className="text-xs font-medium text-slate-600">{metric.label}</div>
                  <div className="mt-1 text-[11px] text-slate-500">{metric.description}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default TrendingCharts;

