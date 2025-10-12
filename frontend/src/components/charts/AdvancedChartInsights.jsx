import React, { useMemo, useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import { Sparkles, Layers, Filter, Activity } from "lucide-react";

const combinedSeries = [
  { period: "Янв", fact: 112, plan: 120, forecast: 125 },
  { period: "Фев", fact: 118, plan: 122, forecast: 127 },
  { period: "Мар", fact: 126, plan: 130, forecast: 134 },
  { period: "Апр", fact: 132, plan: 136, forecast: 140 },
  { period: "Май", fact: 141, plan: 142, forecast: 148 },
  { period: "Июн", fact: 149, plan: 150, forecast: 156 },
];

const contributionData = [
  { factor: "Продукт A", value: 34 },
  { factor: "Продукт B", value: 22 },
  { factor: "Продукт C", value: 18 },
  { factor: "Маркетинг", value: 14 },
  { factor: "Операции", value: 12 },
];

const seasonalityData = [
  { period: "Нед 1", trend: 100, seasonality: -4, residual: 2 },
  { period: "Нед 2", trend: 104, seasonality: 1, residual: -3 },
  { period: "Нед 3", trend: 108, seasonality: 3, residual: -1 },
  { period: "Нед 4", trend: 112, seasonality: -2, residual: 4 },
  { period: "Нед 5", trend: 116, seasonality: 2, residual: 0 },
];

const cohortMatrix = [
  { cohort: "Jan", m1: 100, m2: 82, m3: 73, m4: 68 },
  { cohort: "Feb", m1: 100, m2: 85, m3: 74, m4: 70 },
  { cohort: "Mar", m1: 100, m2: 88, m3: 79, m4: 74 },
  { cohort: "Apr", m1: 100, m2: 84, m3: 72, m4: 69 },
];

const anomalies = [
  { id: 1, date: "2024-04-15", metric: "Продажи", deviation: "+18%", context: "Сильная акция в канале e-commerce" },
  { id: 2, date: "2024-05-03", metric: "Конверсия", deviation: "-9%", context: "Перебои с оплатой у одного из партнёров" },
];

const segments = [
  { column: "segment", value: "Enterprise", label: "Enterprise" },
  { column: "segment", value: "SMB", label: "SMB" },
  { column: "channel", value: "Retail", label: "Retail" },
  { column: "channel", value: "Online", label: "Online" },
];

export default function AdvancedChartInsights({ onSegmentChange, activeSegment }) {
  const [selectedSegment, setSelectedSegment] = useState(activeSegment || null);

  useEffect(() => {
    setSelectedSegment(activeSegment || null);
  }, [activeSegment?.column, activeSegment?.value]);

  const handleSegmentClick = (segment) => {
    const isSame = selectedSegment?.column === segment.column && selectedSegment?.value === segment.value;
    const next = isSame ? null : segment;
    setSelectedSegment(next);
    if (onSegmentChange) {
      onSegmentChange(next);
    }
  };

  const cumulativeContribution = useMemo(() => {
    let total = 0;
    return contributionData.map((item) => {
      total += item.value;
      return { ...item, cumulative: total };
    });
  }, []);

  return (
    <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-xl">
      <CardHeader className="flex flex-col gap-2">
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Layers className="h-5 w-5 text-indigo-500" />
          Расширенная аналитика графиков
        </CardTitle>
        <p className="text-sm text-slate-600">
          Сопоставляйте факт, план и прогноз, выделяйте ключевые факторы и переключайте сегменты — данные на графиках, карте и в корреляциях обновятся синхронно.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Filter className="h-4 w-4" />
              Кросс-фильтры по сегментам
            </div>
            {selectedSegment && (
              <Button size="sm" variant="ghost" onClick={() => handleSegmentClick(selectedSegment)}>
                Сбросить
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {segments.map((segment) => {
              const isActive = selectedSegment?.column === segment.column && selectedSegment?.value === segment.value;
              return (
                <Button
                  key={`${segment.column}-${segment.value}`}
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  className={isActive ? "bg-indigo-600 text-white" : "border-indigo-200 text-indigo-700"}
                  onClick={() => handleSegmentClick(segment)}
                >
                  {segment.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border border-slate-200 bg-white/70 shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Факт, план и прогноз</CardTitle>
            </CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={combinedSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
                  <XAxis dataKey="period" stroke="#475569" fontSize={12} />
                  <YAxis stroke="#475569" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="fact" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 6 }} name="Факт" />
                  <Line type="monotone" dataKey="plan" stroke="#22c55e" strokeDasharray="5 5" name="План" />
                  <Line type="monotone" dataKey="forecast" stroke="#f97316" strokeDasharray="2 6" name="Прогноз" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white/70 shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Вклад факторов (Pareto)</CardTitle>
            </CardHeader>
            <CardContent className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cumulativeContribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="factor" stroke="#475569" fontSize={12} />
                  <YAxis stroke="#475569" fontSize={12} />
                  <Tooltip />
                  <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="cumulative" stroke="#f97316" strokeWidth={2} name="Накопленный вклад" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-slate-200 bg-white/70 shadow-sm">
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Декомпозиция сезонности
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seasonalityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="period" stroke="#475569" fontSize={12} />
                <YAxis stroke="#475569" fontSize={12} />
                <Tooltip />
                <Area type="monotone" dataKey="trend" stroke="#2563eb" fill="#bfdbfe" name="Тренд" />
                <Area type="monotone" dataKey="seasonality" stroke="#f59e0b" fill="#fde68a" name="Сезонность" />
                <Area type="monotone" dataKey="residual" stroke="#ef4444" fill="#fecaca" name="Остаток" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border border-slate-200 bg-white/70 shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Когортный анализ удержания</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-slate-200 text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-200 px-2 py-1 text-left">Когорта</th>
                      <th className="border border-slate-200 px-2 py-1">М1</th>
                      <th className="border border-slate-200 px-2 py-1">М2</th>
                      <th className="border border-slate-200 px-2 py-1">М3</th>
                      <th className="border border-slate-200 px-2 py-1">М4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cohortMatrix.map((row) => (
                      <tr key={row.cohort}>
                        <td className="border border-slate-200 px-2 py-1 font-semibold text-slate-700">{row.cohort}</td>
                        {(["m1", "m2", "m3", "m4"]).map((key) => (
                          <td key={key} className="border border-slate-200 px-2 py-1 text-center">
                            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                              {row[key]}%
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white/70 shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Activity className="h-4 w-4 text-amber-500" />
                Профили аномалий
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {anomalies.map((anomaly) => (
                <div key={anomaly.id} className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{anomaly.metric}</span>
                    <Badge className="bg-amber-500/10 text-amber-700">{anomaly.deviation}</Badge>
                  </div>
                  <div className="text-[11px] text-amber-700">{anomaly.date}</div>
                  <div className="mt-1 text-amber-800">{anomaly.context}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
