
import React, { useState, useEffect, useMemo } from "react";
import { getDatasets, getVisualizations } from "@/api/entities";
import { Activity, Zap } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from 'recharts';

import StatsGrid from "../components/dashboard/StatsGrid";
import QuickActions from "../components/dashboard/QuickActions";
import RecentActivity from "../components/dashboard/RecentActivity";
import TrendingCharts from "../components/dashboard/TrendingCharts";
import PageContainer from "@/components/layout/PageContainer";

export default function Dashboard() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const formatNumber = (value, options = {}) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "—";
    }
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1, ...options }).format(value);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        getDatasets(),
        getVisualizations(),
      ]);
      setDatasets(Array.isArray(datasetsData) ? datasetsData : []);
      setVisualizations(Array.isArray(visualizationsData) ? visualizationsData : []);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    } finally {
      setIsLoading(false);
    }
  };


  const metrics = useMemo(() => {
    const parseDate = (item) => {
      if (!item) return null;
      if (item.created_date) {
        const date = new Date(item.created_date);
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }
      if (item.created_at) {
        const date = new Date(item.created_at * 1000);
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
      }
      return null;
    };

    const calculateWeeklyChange = (items, filterFn = () => true) => {
      const now = new Date();
      const startCurrent = new Date(now);
      startCurrent.setDate(startCurrent.getDate() - 7);
      const startPrevious = new Date(startCurrent);
      startPrevious.setDate(startPrevious.getDate() - 7);

      let current = 0;
      let previous = 0;

      items.forEach((item) => {
        if (!filterFn(item)) return;
        const itemDate = parseDate(item);
        if (!itemDate) return;
        if (itemDate >= startCurrent) {
          current += 1;
          return;
        }
        if (itemDate >= startPrevious && itemDate < startCurrent) {
          previous += 1;
        }
      });

      let text = "Нет данных";
      let trend = "neutral";

      if (current === 0 && previous === 0) {
        text = "Без изменений";
      } else if (current === previous) {
        text = "Без изменений";
      } else {
        const diff = current - previous;
        trend = diff > 0 ? "up" : "down";
        const sign = diff > 0 ? "+" : "−";
        text = `${sign}${Math.abs(diff)} за 7 дней`;
      }

      return { text, trend, current, previous };
    };

    const buildTrendData = (datasetsList, visualizationsList, monthsCount = 6) => {
      const formatter = new Intl.DateTimeFormat("ru-RU", { month: "short" });
      const result = [];
      const now = new Date();

      for (let offset = monthsCount - 1; offset >= 0; offset -= 1) {
        const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
        const start = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1));
        const end = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1));

        const datasetsCount = datasetsList.reduce((acc, item) => {
          const itemDate = parseDate(item);
          if (!itemDate) return acc;
          if (itemDate >= start && itemDate < end) {
            return acc + 1;
          }
          return acc;
        }, 0);

        const visualizationsCount = visualizationsList.reduce((acc, item) => {
          const itemDate = parseDate(item);
          if (!itemDate) return acc;
          if (itemDate >= start && itemDate < end) {
            return acc + 1;
          }
          return acc;
        }, 0);

        result.push({
          period: formatter.format(monthDate).replace(".", ""),
          datasets: datasetsCount,
          visualizations: visualizationsCount,
        });
      }

      return result;
    };

    const datasetsChange = calculateWeeklyChange(datasets);
    const visualizationsChange = calculateWeeklyChange(visualizations);
    const mapChange = calculateWeeklyChange(visualizations, (item) => item?.type === "map");
    const forecastChange = calculateWeeklyChange(visualizations, (item) => item?.type === "forecast");

    const totalRows = datasets.reduce((acc, dataset) => {
      if (typeof dataset?.row_count === "number" && Number.isFinite(dataset.row_count)) {
        return acc + dataset.row_count;
      }
      return acc;
    }, 0);

    const combinedItems = [...datasets, ...visualizations];
    const latestDate = combinedItems
      .map(parseDate)
      .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const lastUpdate = latestDate
      ? new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(latestDate)
      : null;

    const trendData = buildTrendData(datasets, visualizations);

    return {
      changes: {
        dataset: datasetsChange,
        visualization: visualizationsChange,
        map: mapChange,
        forecast: forecastChange,
      },
      trendData,
      summary: {
        datasetCount: datasets.length,
        visualizationCount: visualizations.length,
        totalRows,
        lastUpdate,
        weeklyNewDatasets: datasetsChange.current,
        weeklyNewVisualizations: visualizationsChange.current,
        hasTrendData: trendData.some((item) => item.datasets > 0 || item.visualizations > 0),
      },
    };
  }, [datasets, visualizations]);

  const heroChartData = useMemo(() => {
    const data = metrics.trendData || [];
    const prepared = data.slice(-4).map((item, index) => ({
      name: item?.period || `${index + 1}`,
      value: (item?.datasets || 0) + (item?.visualizations || 0),
    }));
    if (prepared.length === 0) {
      return [{ name: "—", value: 0 }];
    }
    return prepared;
  }, [metrics.trendData]);

  const now = new Date();
  const datasetsWithDates = datasets
    .map((dataset) => {
      const createdAt = dataset.created_date || dataset.created_at || dataset.createdAt;
      return createdAt ? new Date(createdAt) : null;
    })
    .filter((date) => date instanceof Date && !Number.isNaN(date.valueOf()));

  const averageDatasetAgeDays = datasetsWithDates.length
    ? datasetsWithDates.reduce((sum, date) => sum + (now - date) / (1000 * 60 * 60 * 24), 0) / datasetsWithDates.length
    : null;

  const recentUpdatesCount = [...datasets, ...visualizations].filter((item) => {
    const createdAt = item?.created_date || item?.created_at || item?.createdAt;
    if (!createdAt) return false;
    const created = new Date(createdAt);
    if (Number.isNaN(created.valueOf())) return false;
    return (now - created) / (1000 * 60 * 60) <= 24;
  }).length;

  const totalRecords = datasets.reduce(
    (sum, dataset) => sum + (dataset.row_count || dataset.rows || dataset.record_count || 0),
    0
  );

  const forecastVisualizations = visualizations.filter((v) => v.type === "forecast");
  const forecastShare = visualizations.length
    ? (forecastVisualizations.length / visualizations.length) * 100
    : null;

  const heroMetrics = [
    {
      label: "Активные обновления",
      value: formatNumber(recentUpdatesCount),
      description: "действий за последние 24 часа",
    },
    {
      label: "Объем записей",
      value: formatNumber(totalRecords, { notation: "compact" }),
      description: "обработанных локально строк",
    },
    {
      label: "Возраст данных",
      value: averageDatasetAgeDays !== null ? `${formatNumber(averageDatasetAgeDays)} дн.` : "—",
      description: "средний срок актуальности",
    },
    {
      label: "Прогнозные модели",
      value: forecastShare !== null ? `${formatNumber(forecastShare)}%` : "0%",
      description: "доля от всех визуализаций",
    },
  ];

  return (
    <PageContainer className="space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-purple-900 to-slate-900 p-8 text-white">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-pink-600/20" />
          <div className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-white via-blue-100 to-purple-100 bg-clip-text text-transparent">
                  Панель аналитики
                </h1>
                <p className="text-xl text-slate-300 max-w-2xl leading-relaxed">
                  Превратите ваши данные в полезные инсайты с помощью локальных визуализаций и прогнозирования
                </p>
                <div className="flex items-center gap-6 mt-6 text-sm">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-green-400" />
                    <span className="text-slate-300">Обработка в реальном времени</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    <span className="text-slate-300">Локальный ассистент</span>
                  </div>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4 text-left">
                  {heroMetrics.map((metric) => (
                    <div
                      key={metric.label}
                      className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md"
                    >
                      <div className="text-xs uppercase tracking-wide text-slate-300">{metric.label}</div>
                      <div className="mt-2 text-2xl font-semibold text-white">{metric.value}</div>
                      <div className="mt-1 text-xs text-slate-300/80">{metric.description}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex-shrink-0">
                <div className="w-32 h-32 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-xl border border-white/10 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={heroChartData}>
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="url(#gradient)" 
                        strokeWidth={3}
                        dot={false}
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#60A5FA" />
                          <stop offset="100%" stopColor="#A78BFA" />
                        </linearGradient>
                      </defs>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* Stats Grid */}
      <StatsGrid
        datasets={datasets}
        visualizations={visualizations}
        isLoading={isLoading}
        changes={metrics.changes}
      />

      {/* Quick Actions */}
      <QuickActions />

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2">
          <RecentActivity
            datasets={datasets}
            visualizations={visualizations}
            isLoading={isLoading}
          />
        </div>

        {/* Trending Charts */}
        <div>
          <TrendingCharts
            data={metrics.trendData}
            summary={metrics.summary}
            isLoading={isLoading}
          />
        </div>
      </div>
    </PageContainer>
  );
}
