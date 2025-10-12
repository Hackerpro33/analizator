
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  LineChart, 
  ScatterChart,
  TrendingUp,
  Edit,
  Star,
  Calendar,
  Box,
  Eye,
  FileText
} from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart as ReLineChart, Line, BarChart as ReBarChart, Bar, ScatterChart as ReScatterChart, Scatter, AreaChart as ReAreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import PDFExporter from "../utils/PDFExporter";

const matchesSegment = (dataset, segment) => {
  if (!segment || !dataset) {
    return true;
  }
  const column = segment.column;
  if (!column) {
    return true;
  }
  const rows = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];
  if (!rows.length) {
    return true;
  }
  return rows.some((row) => row?.[column] === segment.value);
};

export default function ChartGallery({ visualizations, datasets, isLoading, onEdit, onView, activeSegment }) {
  const getChartIcon = (type) => {
    const icons = {
      line: LineChart,
      bar: BarChart3,
      scatter: ScatterChart,
      area: TrendingUp,
      '3d': Box
    };
    return icons[type] || BarChart3;
  };

  const getChartColor = (type) => {
    const colors = {
      line: "from-blue-500 to-cyan-600",
      bar: "from-emerald-500 to-teal-600", 
      scatter: "from-purple-500 to-indigo-600",
      area: "from-orange-500 to-red-600",
      '3d': "from-pink-500 to-rose-600"
    };
    return colors[type] || "from-blue-500 to-cyan-600";
  };

  const renderMiniChart = (viz, dataset) => {
    if (!dataset || !dataset.sample_data) {
      return <div className="text-xs text-center text-slate-400">Нет данных для предпросмотра</div>;
    }

    // Используем реальные сохраненные данные из визуализации
    let chartData = dataset.sample_data;
    
    // Если нет sample_data, создаем тестовые данные на основе конфигурации
    if (!chartData || chartData.length === 0) {
      const mockData = [];
      for (let i = 0; i < 8; i++) {
        const dataPoint = {};
        dataPoint[viz.x_axis] = viz.x_axis.includes('date') ? `2024-01-${i + 1}` : `Item ${i + 1}`;
        dataPoint[viz.y_axis] = Math.floor(Math.random() * 100) + 10;
        mockData.push(dataPoint);
      }
      chartData = mockData;
    }

    // Применяем фильтры если они есть
    const filter = viz.config?.filterConfig;
    if (filter && filter.date_range && filter.date_range.from) {
        chartData = chartData.filter(item => {
            if (!item[viz.x_axis]) return true;
            try {
                const itemDate = new Date(item[viz.x_axis]);
                const fromDate = filter.date_range.from;
                const toDate = filter.date_range.to;
                
                if (toDate) {
                    return itemDate >= fromDate && itemDate <= toDate;
                }
                return itemDate >= fromDate;
            } catch (e) {
                return true;
            }
        });
    }

    // Обрезаем данные для мини-графика
    chartData = chartData.slice(0, 8);

    const chartProps = {
      data: chartData,
      width: 200,
      height: 80
    };

    switch (viz.type) {
      case 'bar':
        return (
          <ReBarChart {...chartProps}>
            <Bar dataKey={viz.y_axis} fill={viz.config?.color || "#10B981"} />
            <Tooltip 
              wrapperStyle={{ fontSize: '10px' }}
              formatter={(value, name) => [value, viz.y_axis]}
              labelFormatter={(label) => `${viz.x_axis}: ${label}`}
            />
          </ReBarChart>
        );
      case 'scatter':
        return (
          <ReScatterChart {...chartProps}>
            <XAxis type="number" dataKey={viz.x_axis} hide />
            <YAxis type="number" dataKey={viz.y_axis} hide />
            <Scatter data={chartData} fill={viz.config?.color || "#8B5CF6"} />
            <Tooltip 
              wrapperStyle={{ fontSize: '10px' }}
              formatter={(value, name) => [value, name]}
            />
          </ReScatterChart>
        );
      case 'area':
        return (
          <ReAreaChart {...chartProps}>
            <Area 
              type="monotone" 
              dataKey={viz.y_axis} 
              stroke={viz.config?.color || "#F97316"} 
              fill={viz.config?.color || "#FDBA74"}
              fillOpacity={0.3}
            />
            <Tooltip 
              wrapperStyle={{ fontSize: '10px' }}
              formatter={(value, name) => [value, viz.y_axis]}
            />
          </ReAreaChart>
        );
      case '3d':
        return (
          <div className="text-xs text-center text-slate-400 py-6">
            <Box className="w-8 h-8 mx-auto mb-1 text-pink-500" />
            3D График
          </div>
        );
      default: // line chart
        return (
          <ReLineChart {...chartProps}>
            <Line 
              type="monotone" 
              dataKey={viz.y_axis} 
              stroke={viz.config?.color || "#3B82F6"} 
              strokeWidth={2} 
              dot={false} 
            />
            <Tooltip 
              wrapperStyle={{ fontSize: '10px' }}
              formatter={(value, name) => [value, viz.y_axis]}
              labelFormatter={(label) => `${viz.x_axis}: ${label}`}
            />
          </ReLineChart>
        );
    }
  };

  // Переводы типов графиков
  const typeTranslations = {
    line: "Линейный",
    bar: "Столбчатый", 
    scatter: "Рассеяние",
    area: "С областями",
    '3d': "3D График"
  };

  const exportToPDF = (viz) => {
    // Создаем временный элемент для экспорта конкретного графика
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h2 style="color: #1f2937; margin-bottom: 10px;">${viz.title}</h2>
        <p style="color: #6b7280; margin-bottom: 20px;">Тип: ${typeTranslations[viz.type] || viz.type}</p>
        <p style="color: #6b7280;">Оси: ${viz.x_axis} × ${viz.y_axis}</p>
        <p style="color: #6b7280;">Создан: ${format(new Date(viz.created_date), "d MMM yyyy")}</p>
      </div>
    `;
    document.body.appendChild(tempDiv);
    
    // Имитация PDF экспорта (в реальном приложении здесь был бы реальный PDF генератор)
    setTimeout(() => {
      alert(`График "${viz.title}" подготовлен к экспорту в PDF`);
      document.body.removeChild(tempDiv);
    }, 500);
  };

  const segmentMatchMap = useMemo(() => {
    if (!activeSegment) {
      return null;
    }
    return visualizations.reduce((acc, viz) => {
      const dataset = datasets.find((d) => d.id === viz.dataset_id);
      acc[viz.id] = matchesSegment(dataset, activeSegment);
      return acc;
    }, {});
  }, [visualizations, datasets, activeSegment]);

  const hasSegmentMatches = activeSegment
    ? Object.values(segmentMatchMap || {}).some(Boolean)
    : true;

  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            Ваши графики
          </CardTitle>
          {visualizations.length > 0 && (
            <PDFExporter
              title="Отчет по графикам Анализатор"
              elementId="charts-gallery"
            />
          )}
        </div>
      </CardHeader>
      <CardContent id="charts-gallery">
        {activeSegment && (
          <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-700">
            Активен фильтр по сегменту
            <span className="ml-1 font-semibold">
              {activeSegment.label || `${activeSegment.column}: ${activeSegment.value}`}
            </span>
          </div>
        )}
        {activeSegment && !hasSegmentMatches && !isLoading && visualizations.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
            Ни один из сохранённых графиков не содержит выбранный сегмент. Создайте новую визуализацию или выберите другой фильтр.
          </div>
        )}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(6).fill(0).map((_, i) => (
              <Card key={i} className="border-0 bg-white/50 shadow-lg animate-pulse">
                <CardContent className="p-6 space-y-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-32 w-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : visualizations.length === 0 ? (
          <div className="text-center py-12">
            <BarChart3 className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2 heading-text">Графики ещё не созданы</h3>
            <p className="text-slate-500 elegant-text">Создайте свой первый график для начала визуализации данных</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visualizations.map((viz) => {
              const Icon = getChartIcon(viz.type);
              const dataset = datasets.find(d => d.id === viz.dataset_id);
              const matchesFilter = activeSegment ? segmentMatchMap?.[viz.id] !== false : true;
              return (
                <Card
                  key={viz.id}
                  className={`group border-0 bg-white/70 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-105 ${
                    matchesFilter ? '' : 'opacity-40'
                  }`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg bg-gradient-to-r ${getChartColor(viz.type)}`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <Badge variant="secondary" className="text-xs elegant-text">
                          {typeTranslations[viz.type] || viz.type}
                        </Badge>
                      </div>
                      {viz.is_favorite && (
                        <Star className="w-4 h-4 text-yellow-500 fill-current" />
                      )}
                    </div>

                    <h3 className="font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors heading-text break-words">
                      {viz.title}
                    </h3>

                    <div className="h-24 mb-4 bg-slate-50 rounded-lg p-2">
                      <ResponsiveContainer width="100%" height="100%">
                        {renderMiniChart(viz, dataset)}
                      </ResponsiveContainer>
                    </div>

                    <div className="flex items-center justify-between text-sm text-slate-500 mb-4 elegant-text">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(viz.created_date), "d MMM yyyy")}
                      </div>
                      <span className="text-xs">
                        {viz.x_axis} × {viz.y_axis}
                      </span>
                    </div>

                    <div className="space-y-2 pt-2">
                      {/* Первый ряд кнопок */}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => onView(viz)} className="flex-1 gap-2 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 elegant-text">
                          <Eye className="w-4 h-4" />
                          Просмотр
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onEdit(viz)} className="flex-1 gap-2 hover:bg-green-50 hover:border-green-200 hover:text-green-600 elegant-text">
                          <Edit className="w-4 h-4" />
                          Изменить
                        </Button>
                      </div>
                      
                      {/* Второй ряд с кнопкой PDF по центру */}
                      <div className="flex justify-center">
                        <Button variant="outline" size="sm" onClick={() => exportToPDF(viz)} className="px-6 gap-2 hover:bg-red-50 hover:border-red-200 hover:text-red-600 elegant-text">
                          <FileText className="w-4 h-4" />
                          Экспорт в PDF
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
