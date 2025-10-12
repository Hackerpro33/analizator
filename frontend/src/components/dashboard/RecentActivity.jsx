
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Clock, Database, BarChart3, Map, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function RecentActivity({ datasets, visualizations, isLoading }) {
  const getIcon = (type) => {
    const icons = {
      dataset: Database,
      line: BarChart3,
      bar: BarChart3,
      scatter: BarChart3,
      area: BarChart3,
      map: Map,
      forecast: TrendingUp
    };
    return icons[type] || BarChart3;
  };

  const getTypeColor = (type) => {
    const colors = {
      dataset: "bg-emerald-100 text-emerald-700 border-emerald-200",
      line: "bg-blue-100 text-blue-700 border-blue-200",
      bar: "bg-purple-100 text-purple-700 border-purple-200",
      scatter: "bg-cyan-100 text-cyan-700 border-cyan-200",
      area: "bg-indigo-100 text-indigo-700 border-indigo-200",
      map: "bg-pink-100 text-pink-700 border-pink-200",
      forecast: "bg-orange-100 text-orange-700 border-orange-200"
    };
    return colors[type] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  const recentItems = [
    ...datasets.map(d => ({ ...d, type: 'dataset', title: d.name })),
    ...visualizations.map(v => ({ ...v, type: v.type }))
  ].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).slice(0, 8);
  
  const typeTranslations = {
      dataset: "Набор данных",
      line: "Лин. график",
      bar: "Столб. диаграмма",
      scatter: "Диаграмма рассеяния",
      area: "Диаграмма с областями",
      map: "Карта",
      forecast: "Прогноз"
  }

  const now = new Date();
  const last7DaysUpdates = [...datasets, ...visualizations].filter((item) => {
    const createdAt = item?.created_date || item?.created_at || item?.createdAt;
    if (!createdAt) return false;
    const created = new Date(createdAt);
    if (Number.isNaN(created.valueOf())) return false;
    return (now - created) / (1000 * 60 * 60 * 24) <= 7;
  }).length;

  const datasetsUpdatedToday = datasets.filter((dataset) => {
    const createdAt = dataset.created_date || dataset.created_at || dataset.createdAt;
    if (!createdAt) return false;
    const created = new Date(createdAt);
    if (Number.isNaN(created.valueOf())) return false;
    return (now - created) / (1000 * 60 * 60) <= 24;
  }).length;

  const visualizationTypeCounts = visualizations.reduce((acc, visualization) => {
    const type = visualization.type || "other";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const dominantVisualizationType = Object.entries(visualizationTypeCounts)
    .sort(([, countA], [, countB]) => countB - countA)[0];

  const dominantVisualizationLabel = dominantVisualizationType
    ? typeTranslations[dominantVisualizationType[0]] || dominantVisualizationType[0]
    : "—";

  const forecastShare = visualizations.length
    ? Math.round((visualizations.filter((v) => v.type === "forecast").length / visualizations.length) * 100)
    : 0;

  const metrics = [
    {
      value: last7DaysUpdates,
      label: "Событий за 7 дней",
      description: "индикатор активности команды",
    },
    {
      value: datasetsUpdatedToday,
      label: "Обновления за 24 часа",
      description: "качество и свежесть данных",
    },
    {
      value: dominantVisualizationLabel,
      label: "Популярный тип",
      description: "наиболее востребованный формат",
    },
    {
      value: `${forecastShare}%`,
      label: "Прогнозная аналитика",
      description: "доля от всех визуализаций",
    },
  ];

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Clock className="w-5 h-5 text-blue-500" />
          Недавняя активность
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 pb-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{metric.label}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{metric.value}</div>
              <div className="text-[11px] text-slate-500">{metric.description}</div>
            </div>
          ))}
        </div>
        {isLoading ? (
          <div className="space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-48 mb-2" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {recentItems.map((item, index) => {
              const Icon = getIcon(item.type);
              return (
                <div key={item.id} className="group flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50/50 transition-colors duration-200">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-slate-100 to-slate-200 flex items-center justify-center group-hover:from-slate-200 group-hover:to-slate-300 transition-all">
                    <Icon className="w-5 h-5 text-slate-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {item.title || item.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {format(new Date(item.created_date), "d MMM yyyy 'в' HH:mm")}
                    </p>
                  </div>
                  <Badge className={`${getTypeColor(item.type)} border font-medium`}>
                    {typeTranslations[item.type] || item.type}
                  </Badge>
                </div>
              );
            })}
            {recentItems.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Нет недавней активности</p>
                <p className="text-sm mt-1">Начните с загрузки набора данных или создания визуализации</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
