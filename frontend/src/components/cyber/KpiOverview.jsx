import React, { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { Activity, RefreshCcw, ShieldAlert, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function TrendChart({ data }) {
  if (!data?.length) {
    return <div className="text-sm text-slate-500">Нет данных для отображения.</div>;
  }
  const chartData = data.map((item) => ({
    bucket: item.bucket,
    value: item.value,
  }));
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData}>
        <Tooltip
          labelFormatter={(value) => new Date(value).toLocaleString()}
          formatter={(value) => [`${value} eps`, "Events"]}
        />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function KpiOverview({ summary, loading, onRefresh }) {
  const topSources = summary?.top_sources ?? [];
  const topTargets = summary?.top_targets ?? [];
  const severity = summary?.severity ?? {};
  const incidents = summary?.incidents;

  const severityItems = useMemo(() => {
    const entries = Object.entries(severity);
    if (!entries.length) return [];
    const total = entries.reduce((acc, [, count]) => acc + count, 0);
    return entries.map(([level, count]) => ({
      level,
      count,
      percentage: total ? Math.round((count / total) * 100) : 0,
    }));
  }, [severity]);

  return (
    <div className="grid xl:grid-cols-4 gap-4">
      <Card className="xl:col-span-2 border border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Activity className="w-4 h-4 text-slate-500" />
            EPS (events per second)
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onRefresh} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>{loading ? <Skeleton className="h-40 w-full" /> : <TrendChart data={summary?.eps?.trend} />}</CardContent>
      </Card>
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            Severity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && <Skeleton className="h-28 w-full" />}
          {!loading &&
            (severityItems.length ? (
              severityItems.map((item) => (
                <div key={item.level}>
                  <div className="flex justify-between text-sm text-slate-500 capitalize">
                    <span>{item.level}</span>
                    <span>{item.count}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 mt-1 overflow-hidden">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                      style={{ width: `${item.percentage}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">Нет данных</p>
            ))}
        </CardContent>
      </Card>
      <Card className="border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Incidents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          {incidents ? (
            <>
              <div className="flex justify-between">
                <span>Количество</span>
                <span className="font-semibold">{incidents.count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span>MTTD</span>
                <span className="font-semibold">
                  {incidents.mttd ? `${formatNumber(incidents.mttd.minutes)} мин` : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>MTTR</span>
                <span className="font-semibold">
                  {incidents.mttr ? `${formatNumber(incidents.mttr.minutes)} мин` : "—"}
                </span>
              </div>
            </>
          ) : (
            <p className="text-slate-500 text-sm">Coming soon</p>
          )}
        </CardContent>
      </Card>
      <Card className="xl:col-span-4 border border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-700">Топ источники и цели</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Источники</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {topSources.length ? (
                topSources.map((item) => (
                  <li key={item.label} className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count}</span>
                  </li>
                ))
              ) : (
                <li className="text-slate-400">Нет данных</li>
              )}
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Цели</p>
            <ul className="space-y-1 text-sm text-slate-600">
              {topTargets.length ? (
                topTargets.map((item) => (
                  <li key={item.label} className="flex justify-between">
                    <span>{item.label}</span>
                    <span className="font-semibold">{item.count}</span>
                  </li>
                ))
              ) : (
                <li className="text-slate-400">Нет данных</li>
              )}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
