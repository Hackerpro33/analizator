import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Grip,
  X,
  Eye,
  Save,
  Layout,
  Search,
  RotateCcw,
  Sparkles,
  LayoutDashboard,
  Compass,
  Target,
  PanelsTopLeft,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';
import Chart3D from "../charts/Chart3D";
import { generateForecastReport } from "@/utils/localAnalysis";

const STORAGE_KEY = 'dashboard-builder-state';

const NONE_DATASET_VALUE = '__none__';

const WIDGET_DRAG_TYPE = 'application/x-dashboard-widget';

const widgetDefaultsByType = {
  stats: { datasetId: '', metricLabel: 'Всего записей' },
  chart: { datasetId: '', chartVariant: 'line', xField: '', yField: '' },
  map: {
    datasetId: '',
    mapVariant: 'heatmap',
    mapRegion: 'world',
    locationField: '',
    valueField: '',
  },
  forecast: { datasetId: '', forecastHorizon: 12, targetField: '' },
  correlation: { datasetId: '', selectedColumns: [] },
  report: { datasetId: '', customTitle: '', notes: '', reportLayout: 'text' },
};

const chartVariants = [
  { value: 'line', label: 'Линейный график' },
  { value: 'bar', label: 'Столбчатая диаграмма' },
  { value: 'area', label: 'Область значений' },
  { value: 'scatter', label: 'Точечная диаграмма' },
  { value: 'pie', label: 'Круговая диаграмма' },
];

const mapVariants = [
  { value: 'heatmap', label: 'Тепловая карта' },
  { value: 'choropleth', label: 'Хороплет' },
  { value: 'clusters', label: 'Кластеры точек' },
];

const mapRegions = [
  { value: 'world', label: 'Весь мир' },
  { value: 'europe', label: 'Европа' },
  { value: 'asia', label: 'Азия' },
  { value: 'custom', label: 'Пользовательский регион' },
];

const reportLayouts = [
  { value: 'text', label: 'Текстовый блок' },
  { value: 'bullets', label: 'Список выводов' },
  { value: 'table', label: 'Табличное резюме' },
];

const TEMPLATE_PRESETS = [
  {
    id: 'executive-brief',
    title: 'Исполнительный обзор',
    description: 'Комбинирует KPI, тренды и текстовые выводы для быстрого доклада руководству.',
    icon: LayoutDashboard,
    accent: 'from-amber-500 to-orange-500',
    audience: 'C-level',
    highlights: ['3 KPI панели', 'Трендовая визуализация', 'Автонарратив'],
    steps: [
      {
        title: 'Фиксация ключевых метрик',
        description: 'Добавьте стат-блоки и назначьте источники данных, чтобы показать фактические KPI.',
        tip: 'Выберите датасеты с наиболее свежими цифрами — их легко поменять после вставки.',
      },
      {
        title: 'Визуализация тренда',
        description: 'Постройте линейный или площадной график с фокусом на 6–12 месяцев.',
        tip: 'Для роста задайте оси X/Y вручную — так проще сопоставлять сегменты.',
      },
      {
        title: 'Формулирование выводов',
        description: 'Заполните текстовый блок, чтобы зафиксировать главные инсайты и гипотезы.',
        tip: 'Используйте буллеты: руководители быстрее считывают структуру.',
      },
    ],
    widgets: [
      { type: 'stats', overrides: { metricLabel: 'Активные клиенты' } },
      { type: 'stats', overrides: { metricLabel: 'MRR' } },
      { type: 'chart', overrides: { title: 'Динамика показателей', chartVariant: 'area' } },
      {
        type: 'report',
        overrides: {
          customTitle: 'Резюме недели',
          reportLayout: 'bullets',
          notes: '• Рост удержания по кварталу\n• Потенциал апселла в Enterprise сегменте',
        },
      },
    ],
  },
  {
    id: 'geo-monitoring',
    title: 'Геомониторинг спроса',
    description: 'Подсвечивает различия по регионам и прогнозирует нагрузку.',
    icon: Compass,
    accent: 'from-blue-500 to-cyan-500',
    audience: 'Региональные команды',
    highlights: ['Карта интенсивности', 'Прогноз по регионам', 'Итеративные рекомендации'],
    steps: [
      {
        title: 'Снимок карты',
        description: 'Выберите набор данных с координатами и визуализируйте активность на карте.',
        tip: 'Укажите поле локаций — тогда подписи регионов появятся автоматически.',
      },
      {
        title: 'Прогноз нагрузки',
        description: 'Сконфигурируйте прогноз по ключевому показателю, чтобы планировать ресурсы.',
        tip: 'Горизонт прогноза держите в пределах 8–12 периодов для устойчивости.',
      },
      {
        title: 'Рекомендации',
        description: 'Зафиксируйте зоны роста или риска для конкретных территорий.',
        tip: 'Привяжите текстовый блок к тому же датасету — ссылки на данные будут кликабельными.',
      },
    ],
    widgets: [
      {
        type: 'map',
        overrides: {
          title: 'Тепловая карта регионов',
          mapVariant: 'choropleth',
          mapRegion: 'europe',
        },
      },
      { type: 'forecast', overrides: { title: 'Прогноз спроса', forecastHorizon: 8 } },
      {
        type: 'report',
        overrides: {
          customTitle: 'Региональные инсайты',
          notes: '• Запад усиливает отток\n• Юг требует перераспределения складов',
        },
      },
    ],
  },
  {
    id: 'experiment-review',
    title: 'Аналитика эксперимента',
    description: 'Показывает воронку, корреляции и конспект эксперимента.',
    icon: Target,
    accent: 'from-violet-500 to-indigo-500',
    audience: 'Команды продукта',
    highlights: ['Воронка метрик', 'Корреляционный анализ', 'Хронология эксперимента'],
    steps: [
      {
        title: 'Измерение основного сигнала',
        description: 'Добавьте чарты/стат-блоки для ключевого эффекта A/B.',
        tip: 'Подсветите базовый KPI и вторичные метрики отдельными карточками.',
      },
      {
        title: 'Поиск взаимосвязей',
        description: 'Постройте матрицу корреляций для вспомогательных метрик.',
        tip: 'Выберите минимум два столбца — подсказки в UI помогут не забыть про признаки.',
      },
      {
        title: 'Формулирование выводов',
        description: 'Добавьте текстовый блок с гипотезой, планом действий и таймлайном.',
        tip: 'Сохраняйте этапы эксперимента в списке — это ускоряет сравнение запусков.',
      },
    ],
    widgets: [
      { type: 'chart', overrides: { title: 'Тренд конверсии', chartVariant: 'line' } },
      { type: 'correlation', overrides: { title: 'Корреляции метрик' } },
      {
        type: 'report',
        overrides: {
          customTitle: 'Итоги эксперимента',
          reportLayout: 'table',
          notes: 'Группа B показывает +4.1 п.п. к конверсии, требуется rollout.',
        },
      },
    ],
  },
];

const DEFAULT_CHART_COLOR = '#2563eb';

const safeNumberValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeChartData = (data = [], fields = []) =>
  data.map((row) => {
    const next = { ...row };
    fields.forEach((field) => {
      if (field && row?.[field] !== undefined) {
        const numeric = safeNumberValue(row[field]);
        if (numeric !== null) {
          next[field] = numeric;
        }
      }
    });
    return next;
  });

const buildHistoricalSeries = (dataset, field) => {
  if (!dataset || !field) {
    return [];
  }
  const rows = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];
  if (!rows.length) {
    return [];
  }
  const startDate = new Date();
  return rows
    .map((row, index) => {
      const value = safeNumberValue(row[field]);
      if (value === null) {
        return null;
      }
      const date = new Date(startDate);
      date.setDate(date.getDate() - (rows.length - index));
      return {
        date: date.toISOString().split("T")[0],
        value,
      };
    })
    .filter(Boolean);
};

const renderChartPreview = ({
  chartType,
  dataset,
  xKey,
  yKey,
  zKey,
  color = DEFAULT_CHART_COLOR,
  height = 240,
}) => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!dataset) {
    return (
      <div className="h-48 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
        Выберите набор данных, чтобы увидеть график.
      </div>
    );
  }

  if (!xKey || !yKey) {
    return (
      <div className="h-48 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 flex items-center justify-center text-sm text-amber-700">
        Настройте оси X и Y, чтобы построить визуализацию.
      </div>
    );
  }

  const rows = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];
  if (!rows.length) {
    return (
      <div className="h-48 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
        В наборе данных пока нет примеров — добавьте sample_data, чтобы увидеть график.
      </div>
    );
  }

  const normalized = normalizeChartData(rows, [xKey, yKey, zKey].filter(Boolean));
  const chartProps = { data: normalized, margin: { top: 16, right: 24, left: 8, bottom: 8 } };
  const containerStyle = { height };

  const placeholder = (
    <div className="h-48 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
      Тип визуализации пока не поддерживается в предпросмотре.
    </div>
  );
  const errorFallback = (
    <div className="h-48 rounded-lg border border-dashed border-red-200 bg-red-50/60 flex items-center justify-center text-sm text-red-700">
      Не удалось отрендерить визуализацию — проверьте выбранные столбцы.
    </div>
  );

  try {
    switch (chartType) {
      case 'line':
        return (
          <div style={containerStyle}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey={xKey} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        );
    case 'bar':
      return (
        <div style={containerStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={yKey} fill={color} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    case 'area':
      return (
        <div style={containerStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey={yKey}
                stroke={color}
                fill={color}
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      );
    case 'scatter': {
      const scatterData = normalizeChartData(rows, [xKey, yKey]);
      const numeric = scatterData.filter((row) => Number.isFinite(row[xKey]) && Number.isFinite(row[yKey]));
      if (!numeric.length) {
        return (
          <div className="h-48 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 flex items-center justify-center text-sm text-amber-700">
            Для точечной диаграммы нужны числовые значения по осям.
          </div>
        );
      }
      return (
        <div style={containerStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart data={numeric} margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} type="number" />
              <YAxis dataKey={yKey} type="number" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter dataKey={yKey} fill={color} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      );
    }
    case 'pie': {
      const pieData = rows
        .map((row) => ({
          name: row[xKey] ?? '—',
          value: safeNumberValue(row[yKey]),
        }))
        .filter((entry) => entry.value !== null)
        .slice(0, 8);
      if (!pieData.length) {
        return (
          <div className="h-48 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 flex items-center justify-center text-sm text-amber-700">
            Нет числовых данных для построения круговой диаграммы.
          </div>
        );
      }
      const colors = ['#0ea5e9', '#2563eb', '#7c3aed', '#ec4899', '#f97316', '#14b8a6', '#f43f5e', '#22c55e'];
      return (
        <div style={containerStyle}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                {pieData.map((entry, index) => (
                  <Cell key={`slice-${entry.name}-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }
      case '3d': {
        if (!zKey) {
          return (
            <div className="h-48 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 flex items-center justify-center text-sm text-amber-700">
              Укажите поле для оси Z, чтобы построить 3D-диаграмму.
            </div>
          );
        }
        return (
          <div style={containerStyle} className="rounded-xl border border-slate-200">
            <Chart3D data={normalized} config={{ x_axis: xKey, y_axis: yKey, z_axis: zKey, color }} />
          </div>
        );
      }
      default:
        return placeholder;
    }
  } catch (error) {
    console.error('Ошибка рендера предпросмотра графика', error); // eslint-disable-line no-console
    return errorFallback;
  }
};

const renderDatasetSampleTable = (dataset) => {
  if (!dataset) {
    return null;
  }
  const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
  const rows = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];
  if (!columns.length || !rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
        Нет примеров данных — загрузите sample_data, чтобы таблица отобразилась автоматически.
      </div>
    );
  }

  const visibleColumns = columns.slice(0, 6);
  const visibleRows = rows.slice(0, 6);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-xs text-slate-600">
          <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {visibleColumns.map((column) => (
                <th key={column.name} className="px-3 py-2 text-left border-b border-slate-200">
                  <div className="flex flex-col">
                    <span>{column.name}</span>
                    {column.type && <span className="text-[10px] text-slate-400 normal-case">{column.type}</span>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => (
              <tr key={`sample-row-${index}`} className="even:bg-slate-50/50">
                {visibleColumns.map((column) => (
                  <td key={`${column.name}-${index}`} className="px-3 py-2 border-b border-slate-100">
                    <span className="font-mono text-[11px] text-slate-700">
                      {row?.[column.name] !== undefined && row?.[column.name] !== null
                        ? String(row[column.name]).slice(0, 24)
                        : '—'}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const renderForecastPreview = ({ dataset, targetField, horizon }) => {
  if (!dataset || !targetField) {
    return (
      <div className="h-48 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
        Выберите набор данных и целевую метрику для прогноза.
      </div>
    );
  }
  const historical = buildHistoricalSeries(dataset, targetField);
  if (!historical.length) {
    return (
      <div className="h-48 rounded-lg border border-dashed border-slate-200 flex items-center justify-center text-sm text-slate-500">
        Для выбранного набора данных нет числовых примеров — добавьте sample_data, чтобы построить прогноз.
      </div>
    );
  }
  const report = generateForecastReport({ historical, horizon });
  const combined = [
    ...historical.map((entry) => ({
      date: entry.date,
      actual: entry.value,
    })),
    ...report.forecast_data.map((entry) => ({
      date: entry.date,
      predicted: entry.predicted_value,
      lower: entry.confidence_lower,
      upper: entry.confidence_upper,
    })),
  ];

  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={combined} margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Area
            type="monotone"
            dataKey="predicted"
            stroke="#8b5cf6"
            fill="#c4b5fd"
            fillOpacity={0.2}
            name="Прогноз"
          />
          <Line type="monotone" dataKey="actual" stroke="#0ea5e9" strokeWidth={2} name="История" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const describeCorrelationStrength = (value) => {
  const absValue = Math.abs(value);
  if (absValue >= 0.9) return 'Практически линейная зависимость';
  if (absValue >= 0.7) return 'Сильная взаимосвязь';
  if (absValue >= 0.5) return 'Умеренная взаимосвязь';
  if (absValue >= 0.3) return 'Слабая взаимосвязь';
  if (absValue > 0) return 'Очень слабая взаимосвязь';
  return 'Нет корреляции';
};

const getCorrelationCellStyle = (value) => {
  if (typeof value !== 'number') {
    return { backgroundColor: '#f8fafc', color: '#0f172a' };
  }
  const absValue = Math.min(Math.abs(value), 1);
  const hue = value >= 0 ? 150 : 0;
  const lightness = 95 - absValue * 35;
  const backgroundColor = `hsl(${hue} 70% ${lightness}%)`;
  const color = absValue > 0.6 ? '#fff' : '#0f172a';
  return { backgroundColor, color };
};

const renderForecastVisualizationWidget = (visualization) => {
  const forecastResult = visualization?.config?.forecast_result;
  const historicalSeries = visualization?.config?.historical_series || [];
  if (!forecastResult || !Array.isArray(forecastResult.forecast_data)) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
        В сохранённом прогнозе отсутствуют данные. Повторно сгенерируйте результат на вкладке «Прогнозирование».
      </div>
    );
  }

  const idBase = visualization?.id || visualization?.title || 'forecast';
  const chartData = [
    ...historicalSeries.map((entry) => ({
      date: entry.date,
      actual: entry.value,
    })),
    ...forecastResult.forecast_data.map((entry) => ({
      date: entry.date,
      predicted: entry.predicted_value,
      lower: entry.confidence_lower,
      upper: entry.confidence_upper,
    })),
  ];

  return (
    <div className="space-y-4">
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 16, right: 24, bottom: 16, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="predicted"
              name="Прогноз"
              stroke="#7c3aed"
              fill="#c4b5fd"
              fillOpacity={0.3}
            />
            <Line type="monotone" dataKey="actual" name="История" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {forecastResult.summary?.key_insights?.length ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Ключевые выводы</p>
          <ul className="text-sm text-slate-600 space-y-1 list-disc list-inside">
            {forecastResult.summary.key_insights.slice(0, 3).map((item, index) => (
              <li key={`${idBase}-insight-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const renderCorrelationVisualizationWidget = (visualization) => {
  const correlationResult = visualization?.config?.correlation_result;
  if (!correlationResult) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
        В сохранённой матрице нет данных. Пересчитайте корреляции во вкладке анализа.
      </div>
    );
  }

  const idBase = visualization?.id || visualization?.title || 'correlation';
  const strongest = (correlationResult.strongest_correlations || []).slice(0, 4);
  const matrixSlice = (correlationResult.correlation_matrix || []).slice(0, 4);
  const columnHeaders = matrixSlice.length
    ? Object.keys(matrixSlice[0].correlations || {}).slice(0, 4)
    : [];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Сильные взаимосвязи</p>
        {strongest.length ? (
          <div className="space-y-2">
            {strongest.map((item, index) => (
              <div
                key={`${idBase}-strong-${index}`}
                className="rounded-xl border border-slate-200 bg-white/80 p-3 text-sm"
              >
                <div className="font-semibold text-slate-800">
                  {item.feature1} ↔ {item.feature2}
                </div>
                <div className="text-xs text-slate-500">
                  {describeCorrelationStrength(item.correlation)} ({item.correlation.toFixed(2)})
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Нет ярко выраженных корреляций.</p>
        )}
      </div>
      {columnHeaders.length ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Фрагмент матрицы</p>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-[11px] text-slate-600">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-2 py-1 text-left text-slate-500">Показатель</th>
                  {columnHeaders.map((header) => (
                    <th key={`${idBase}-header-${header}`} className="px-2 py-1 text-left text-slate-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrixSlice.map((row) => (
                  <tr key={`${idBase}-${row.feature}`}>
                    <td className="px-2 py-1 font-medium text-slate-700 border-t border-slate-100">{row.feature}</td>
                    {columnHeaders.map((header) => {
                      const value = row.correlations?.[header];
                      const style = getCorrelationCellStyle(value);
                      return (
                        <td
                          key={`${idBase}-${row.feature}-${header}`}
                          className="px-2 py-1 border-t border-slate-100 text-center font-medium"
                          style={style}
                        >
                          {typeof value === 'number' ? value.toFixed(2) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

function SummaryContent({ content }) {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    return <p className="text-xs text-slate-500 mt-2">{content}</p>;
  }

  if (Array.isArray(content)) {
    return (
      <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
        {content.slice(0, 3).map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }

  if (typeof content === 'object') {
    if (Array.isArray(content.insights) && content.insights.length > 0) {
      return (
        <ul className="text-xs text-slate-500 mt-2 space-y-1 list-disc list-inside">
          {content.insights.slice(0, 3).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      );
    }

    const firstValue = Object.values(content).find((value) => typeof value === 'string');
    if (firstValue) {
      return <p className="text-xs text-slate-500 mt-2">{firstValue}</p>;
    }
  }

  return null;
}

const renderTagBadges = (tags) => {
  if (!tags || tags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {tags.slice(0, 4).map((tag) => (
        <Badge key={tag} variant="outline" className="text-[10px] uppercase tracking-wide">
          {tag}
        </Badge>
      ))}
    </div>
  );
};

export default function DashboardBuilder({
  datasets = [],
  visualizations = [],
  availableWidgets = [],
  onSave,
  isLoading,
}) {
  const { toast } = useToast();
  const [dashboardName, setDashboardName] = useState('Мой дашборд');
  const [selectedWidgets, setSelectedWidgets] = useState([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [isCanvasDragOver, setIsCanvasDragOver] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return;
      }

      const parsed = JSON.parse(stored);
      if (parsed?.name) {
        setDashboardName(parsed.name);
      }
      if (Array.isArray(parsed?.widgets)) {
        setSelectedWidgets(parsed.widgets);
      }
    } catch (error) {
      console.warn('Не удалось восстановить сохранённый дашборд из localStorage', error);
    }
  }, []);

  const datasetMap = useMemo(() => {
    const map = new Map();
    datasets.forEach((dataset) => {
      if (dataset?.id) {
        map.set(dataset.id, dataset);
      }
    });
    return map;
  }, [datasets]);

  const visualizationMap = useMemo(() => {
    const map = new Map();
    visualizations.forEach((viz) => {
      if (viz?.id) {
        map.set(viz.id, viz);
      }
    });
    return map;
  }, [visualizations]);

  const filteredWidgets = useMemo(() => {
    if (!librarySearch.trim()) {
      return availableWidgets;
    }

    const query = librarySearch.trim().toLowerCase();
    return availableWidgets.filter((widget) => {
      const haystack = [
        widget.title,
        widget.type,
        ...(Array.isArray(widget.tags) ? widget.tags : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [availableWidgets, librarySearch]);

  const availableWidgetMap = useMemo(() => {
    const map = new Map();
    availableWidgets.forEach((widget) => {
      if (widget?.id) {
        map.set(widget.id, widget);
      }
    });
    return map;
  }, [availableWidgets]);

  const widgetTypeMap = useMemo(() => {
    const map = new Map();
    availableWidgets.forEach((widget) => {
      if (widget?.type && !map.has(widget.type)) {
        map.set(widget.type, widget);
      }
    });
    return map;
  }, [availableWidgets]);

  const templateWidgetsCount = (template) => template?.widgets?.length || 0;

  const isWidgetDragEvent = (event) => {
    const types = event?.dataTransfer?.types;
    if (!types) {
      return false;
    }

    if (typeof types.includes === 'function') {
      return types.includes(WIDGET_DRAG_TYPE);
    }

    if (typeof types.contains === 'function') {
      return types.contains(WIDGET_DRAG_TYPE);
    }

    return Array.from(types).includes(WIDGET_DRAG_TYPE);
  };

  const handleLibraryDragStart = (event, widgetId) => {
    if (!event.dataTransfer) {
      return;
    }
    event.dataTransfer.effectAllowed = 'copy';
    try {
      event.dataTransfer.setData(WIDGET_DRAG_TYPE, widgetId);
    } catch (error) {
      console.warn('Не удалось инициировать перетаскивание виджета', error);
    }
  };

  const handleLibraryDragEnd = () => {
    setIsCanvasDragOver(false);
  };

  const handleCanvasDragOver = (event) => {
    if (!isWidgetDragEvent(event)) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    if (!isCanvasDragOver) {
      setIsCanvasDragOver(true);
    }
  };

  const handleCanvasDragLeave = (event) => {
    if (!isWidgetDragEvent(event)) {
      return;
    }
    const relatedTarget = event.relatedTarget;
    if (!relatedTarget || !event.currentTarget.contains(relatedTarget)) {
      setIsCanvasDragOver(false);
    }
  };

  const handleCanvasDrop = (event) => {
    if (!isWidgetDragEvent(event)) {
      return;
    }
    event.preventDefault();
    setIsCanvasDragOver(false);

    const widgetId = event.dataTransfer?.getData(WIDGET_DRAG_TYPE);
    if (!widgetId) {
      return;
    }

    const widgetToAdd = availableWidgetMap.get(widgetId);
    if (widgetToAdd) {
      addWidget(widgetToAdd);
    }
  };

  const updateWidget = (widgetId, updates) => {
    setSelectedWidgets((prev) =>
      prev.map((widget) =>
        widget.id === widgetId
          ? {
              ...widget,
              ...updates,
            }
          : widget
      )
    );
  };

  const renderDatasetSelector = (
    widget,
    { label = 'Источник данных', onDatasetChange } = {}
  ) => {
    const handleChange = (value) => {
      const datasetId = value === NONE_DATASET_VALUE ? '' : value;
      const extraUpdates = onDatasetChange?.(datasetId, widget) || {};
      updateWidget(widget.id, { datasetId, ...extraUpdates });
    };

    return (
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </Label>
        <Select
          value={widget.datasetId ? widget.datasetId : NONE_DATASET_VALUE}
          onValueChange={handleChange}
        >
          <SelectTrigger className="text-sm">
            <SelectValue placeholder="Выберите набор данных" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_DATASET_VALUE}>Без источника</SelectItem>
            {datasets.map((dataset) => (
              <SelectItem key={dataset.id} value={dataset.id}>
                {dataset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const toggleWidgetColumn = (widget, columnName, isChecked) => {
    const normalized = Array.isArray(widget.selectedColumns)
      ? widget.selectedColumns
      : [];
    const nextColumns = isChecked
      ? Array.from(new Set([...normalized, columnName]))
      : normalized.filter((name) => name !== columnName);

    updateWidget(widget.id, { selectedColumns: nextColumns });
  };

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(selectedWidgets);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSelectedWidgets(items);
  };

  const addWidget = (widget) => {
    const defaults = widgetDefaultsByType[widget.type];
    const preparedDefaults = defaults
      ? Object.fromEntries(
          Object.entries(defaults).map(([key, value]) => [
            key,
            Array.isArray(value) ? [...value] : value,
          ])
        )
      : {};

    const newWidget = {
      ...widget,
      ...preparedDefaults,
      id: `${widget.id}_${Date.now()}`,
      sourceId: widget.id,
      x: 0,
      y: 0,
      width: 4,
      height: 3,
    };
    setSelectedWidgets((prev) => [...prev, newWidget]);
  };

  const removeWidget = (widgetId) => {
    setSelectedWidgets((prev) => prev.filter((w) => w.id !== widgetId));
  };

  const handleApplyTemplate = (template) => {
    const widgetsCount = templateWidgetsCount(template);
    if (!widgetsCount) {
      toast({
        title: 'Нет элементов в шаблоне',
        description: 'Выбранный шаблон не содержит виджетов для добавления.',
        variant: 'destructive',
      });
      return;
    }

    template.widgets.forEach((templateWidget) => {
      const baseWidget = widgetTypeMap.get(templateWidget.type);
      const fallbackWidget = {
        id: `template-${template.id}-${templateWidget.type}`,
        type: templateWidget.type,
        title: templateWidget.title || 'Виджет шаблона',
        icon: PanelsTopLeft,
      };
      const widgetPayload = {
        ...(baseWidget || fallbackWidget),
        ...templateWidget.overrides,
      };
      addWidget(widgetPayload);
    });

    toast({
      title: `Шаблон «${template.title}» добавлен`,
      description: `${widgetsCount} виджета появилось на холсте — настройте источники данных и сохраните дашборд.`,
    });
  };

  const handleSave = () => {
    const trimmedName = dashboardName.trim() || 'Без названия';

    if (selectedWidgets.length === 0) {
      toast({
        title: 'Добавьте виджеты',
        description: 'Чтобы сохранить дашборд, добавьте на холст хотя бы один элемент.',
        variant: 'destructive',
      });
      return;
    }

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ name: trimmedName, widgets: selectedWidgets })
        );
      } catch (error) {
        console.warn('Не удалось сохранить дашборд в localStorage', error);
      }
    }

    setDashboardName(trimmedName);
    toast({
      title: 'Дашборд сохранён',
      description: 'Конфигурация сохранена локально. Можно вернуться к редактированию в любое время.',
    });

    onSave?.({ name: trimmedName, widgets: selectedWidgets });
  };

  const handlePreview = () => {
    toast({
      title: 'Предпросмотр в разработке',
      description: 'Сборка интерактивного предпросмотра появится в следующей версии.',
    });
  };

  const handleClear = () => {
    setSelectedWidgets([]);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    toast({
      title: 'Холст очищен',
      description: 'Все виджеты удалены из текущего дашборда.',
    });
  };

  const renderWidgetContent = (widget) => {
    const IconComponent = widget.icon || Layout;
    const datasetInfo = widget.datasetId ? datasetMap.get(widget.datasetId) : undefined;
    const visualizationInfo = widget.visualizationId
      ? visualizationMap.get(widget.visualizationId)
      : undefined;

    switch (widget.type) {
      case 'stats': {
        const metricLabel = widget.metricLabel || 'Всего записей';
        return (
          <div className="space-y-4">
            {renderDatasetSelector(widget, { label: 'Источник для расчёта' })}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Подпись показателя
              </Label>
              <Input
                value={widget.metricLabel || ''}
                onChange={(event) =>
                  updateWidget(widget.id, { metricLabel: event.target.value })
                }
                placeholder="Например: Количество клиентов"
                className="text-sm"
              />
            </div>
            <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 p-6 text-center">
              <div className="text-sm font-medium text-blue-700">
                {datasetInfo?.name || 'Выберите набор данных'}
              </div>
              <div className="mt-3 text-4xl font-semibold text-blue-900">
                {datasetInfo?.row_count !== undefined
                  ? datasetInfo.row_count.toLocaleString('ru-RU')
                  : '—'}
              </div>
              <div className="text-xs text-blue-700/80">
                {metricLabel}
              </div>
            </div>
          </div>
        );
      }
      case 'chart': {
        const chartType = widget.chartVariant || 'line';
        const columns = Array.isArray(datasetInfo?.columns)
          ? datasetInfo.columns
          : [];
        return (
          <div className="space-y-4">
            {renderDatasetSelector(widget, {
              onDatasetChange: () => ({ xField: '', yField: '' }),
            })}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Тип визуализации
              </Label>
              <Select
                value={chartType}
                onValueChange={(value) => updateWidget(widget.id, { chartVariant: value })}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chartVariants.map((variant) => (
                    <SelectItem key={variant.value} value={variant.value}>
                      {variant.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {columns.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ось X
                  </Label>
                  <Select
                    value={widget.xField || ''}
                    onValueChange={(value) => updateWidget(widget.id, { xField: value })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Авто" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Авто</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} {column.type ? `(${column.type})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ось Y
                  </Label>
                  <Select
                    value={widget.yField || ''}
                    onValueChange={(value) => updateWidget(widget.id, { yField: value })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Авто" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Авто</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name} {column.type ? `(${column.type})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {datasetInfo && widget.xField && widget.yField && (
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
                  Предпросмотр визуализации
                </Label>
                {renderChartPreview({
                  chartType,
                  dataset: datasetInfo,
                  xKey: widget.xField,
                  yKey: widget.yField,
                  zKey: widget.zField || widget.z_axis,
                  color: widget.color || DEFAULT_CHART_COLOR,
                })}
              </div>
            )}
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50 p-6 text-center">
              <IconComponent className="w-10 h-10 mx-auto text-emerald-500 mb-3" />
              <div className="text-sm font-semibold text-emerald-700">
                {chartVariants.find((variant) => variant.value === chartType)?.label || 'График'}
              </div>
              <div className="text-xs text-emerald-600 mt-1">
                {datasetInfo?.name
                  ? `Источник: ${datasetInfo.name}`
                  : 'Выберите набор данных для визуализации'}
              </div>
            </div>
          </div>
        );
      }
      case 'map': {
        const columns = Array.isArray(datasetInfo?.columns)
          ? datasetInfo.columns
          : [];
        return (
          <div className="space-y-4">
            {renderDatasetSelector(widget, {
              label: 'Набор данных для карты',
              onDatasetChange: () => ({ locationField: '', valueField: '' }),
            })}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Тип отображения
                </Label>
                <Select
                  value={widget.mapVariant || 'heatmap'}
                  onValueChange={(value) => updateWidget(widget.id, { mapVariant: value })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mapVariants.map((variant) => (
                      <SelectItem key={variant.value} value={variant.value}>
                        {variant.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Регион
                </Label>
                <Select
                  value={widget.mapRegion || 'world'}
                  onValueChange={(value) => updateWidget(widget.id, { mapRegion: value })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mapRegions.map((region) => (
                      <SelectItem key={region.value} value={region.value}>
                        {region.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {columns.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Поле с локациями
                  </Label>
                  <Select
                    value={widget.locationField || ''}
                    onValueChange={(value) => updateWidget(widget.id, { locationField: value })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Авто" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Авто</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Показатель интенсивности
                  </Label>
                  <Select
                    value={widget.valueField || ''}
                    onValueChange={(value) => updateWidget(widget.id, { valueField: value })}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Авто" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Авто</SelectItem>
                      {columns.map((column) => (
                        <SelectItem key={column.name} value={column.name}>
                          {column.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 via-indigo-50 to-slate-50 p-6 text-center">
              <IconComponent className="w-10 h-10 mx-auto text-purple-500 mb-3" />
              <div className="text-sm font-semibold text-purple-700">
                {datasetInfo?.name
                  ? `Карта по набору ${datasetInfo.name}`
                  : 'Выберите данные для отображения на карте'}
              </div>
              <div className="text-xs text-purple-600 mt-1">
                {widget.locationField
                  ? `Локации: ${widget.locationField}`
                  : 'Поле локаций определяется автоматически'}
              </div>
            </div>
          </div>
        );
      }
      case 'forecast': {
        const columns = Array.isArray(datasetInfo?.columns)
          ? datasetInfo.columns
          : [];
        return (
          <div className="space-y-4">
            {renderDatasetSelector(widget, {
              label: 'Данные для прогноза',
              onDatasetChange: () => ({ targetField: '' }),
            })}
            {columns.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Целевая метрика
                </Label>
                <Select
                  value={widget.targetField || ''}
                  onValueChange={(value) => updateWidget(widget.id, { targetField: value })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Выберите показатель" />
                  </SelectTrigger>
                  <SelectContent>
                    {columns.map((column) => (
                      <SelectItem key={column.name} value={column.name}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Горизонт (периодов)
              </Label>
              <Input
                type="number"
                min={1}
                value={widget.forecastHorizon ?? 12}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  updateWidget(widget.id, {
                    forecastHorizon: Number.isNaN(parsed)
                      ? 1
                      : Math.max(1, parsed),
                  });
                }}
                className="text-sm"
              />
            </div>
            <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 p-6 text-center">
              <IconComponent className="w-10 h-10 mx-auto text-orange-500 mb-3" />
              <div className="text-sm font-semibold text-orange-700">
                {datasetInfo?.name
                  ? `Прогноз по набору ${datasetInfo.name}`
                  : 'Выберите набор данных для прогноза'}
              </div>
              <div className="text-xs text-orange-600 mt-1">
                Горизонт: {widget.forecastHorizon ?? 12} периодов
              </div>
              {widget.targetField && (
                <div className="text-xs text-orange-600 mt-1">
                  Целевая метрика: {widget.targetField}
                </div>
              )}
            </div>
            {widget.targetField && datasetInfo && (
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
                  Предпросмотр прогноза
                </Label>
                {renderForecastPreview({
                  dataset: datasetInfo,
                  targetField: widget.targetField,
                  horizon: widget.forecastHorizon ?? 12,
                })}
              </div>
            )}
          </div>
        );
      }
      case 'correlation': {
        const columns = Array.isArray(datasetInfo?.columns)
          ? datasetInfo.columns
          : [];
        const selectedColumns = Array.isArray(widget.selectedColumns)
          ? widget.selectedColumns
          : [];
        return (
          <div className="space-y-4">
            {renderDatasetSelector(widget, {
              label: 'Набор данных',
              onDatasetChange: () => ({ selectedColumns: [] }),
            })}
            {datasetInfo && columns.length === 0 && (
              <p className="text-xs text-slate-500">
                В выбранном наборе пока нет описания столбцов. Добавьте метаданные, чтобы построить матрицу.
              </p>
            )}
            {columns.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Показатели для анализа
                </Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {columns.map((column) => {
                    const checked = selectedColumns.includes(column.name);
                    return (
                      <label
                        key={column.name}
                        className="flex items-center gap-2 rounded-md border border-slate-200/80 bg-slate-50/60 px-2 py-2 text-sm text-slate-600"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) =>
                            toggleWidgetColumn(widget, column.name, Boolean(value))
                          }
                        />
                        <span className="flex-1">
                          {column.name}
                          {column.type ? (
                            <span className="ml-1 text-xs uppercase tracking-wide text-slate-400">
                              {column.type}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">
                  Выбрано: {selectedColumns.length} / {columns.length}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 p-6 text-center">
              <IconComponent className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <div className="text-sm font-semibold text-slate-700">
                {datasetInfo?.name
                  ? `Матрица корреляции по набору ${datasetInfo.name}`
                  : 'Выберите набор данных для анализа корреляций'}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                {selectedColumns.length > 1
                  ? `Будет рассчитано ${selectedColumns.length ** 2} значений корреляции`
                  : 'Выберите минимум два показателя для расчёта'}
              </div>
            </div>
          </div>
        );
      }
      case 'report': {
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Название раздела
              </Label>
              <Input
                value={widget.customTitle || ''}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => updateWidget(widget.id, { customTitle: clampName(event.target.value) })}
                placeholder="Например: Итоги квартала"
                className="text-sm"
              />
            </div>
            {renderDatasetSelector(widget, {
              label: 'Источник (опционально)',
            })}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Формат блока
                </Label>
                <Select
                  value={widget.reportLayout || 'text'}
                  onValueChange={(value) => updateWidget(widget.id, { reportLayout: value })}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reportLayouts.map((layout) => (
                      <SelectItem key={layout.value} value={layout.value}>
                        {layout.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ключевые выводы
              </Label>
              <Textarea
                value={widget.notes || ''}
                onChange={(event) => updateWidget(widget.id, { notes: event.target.value })}
                placeholder="Опишите основные выводы, гипотезы или рекомендации"
                className="min-h-[120px] text-sm"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6">
              <div className="text-sm font-semibold text-slate-700">
                {(widget.customTitle && widget.customTitle.trim()) || 'Новый раздел отчёта'}
              </div>
              <div className="mt-2 text-xs text-slate-500 leading-relaxed">
                {widget.notes?.trim()
                  ? widget.notes
                  : 'Добавьте описание, чтобы подготовить автоматический отчёт.'}
              </div>
              {datasetInfo?.name && (
                <div className="mt-3 text-xs text-slate-400">
                  Источник данных: {datasetInfo.name}
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'dataset': {
        const columnsCount = datasetInfo?.columns?.length;
        const tags = datasetInfo?.tags?.length ? datasetInfo.tags : widget.tags;
        return (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <IconComponent className="w-6 h-6 text-blue-600 mt-1" />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {datasetInfo?.name || widget.title}
                </div>
                {(datasetInfo?.description || widget.description) && (
                  <p className="text-xs text-slate-500">
                    {datasetInfo?.description || widget.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                  {datasetInfo?.row_count && (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      {datasetInfo.row_count.toLocaleString('ru-RU')} записей
                    </Badge>
                  )}
                  {typeof columnsCount === 'number' && columnsCount > 0 && (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                      {columnsCount} колонок
                    </Badge>
                  )}
                </div>
                {renderTagBadges(tags)}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Пример данных
              </Label>
              {renderDatasetSampleTable(datasetInfo || widget)}
            </div>
          </div>
        );
      }
      case 'visualization': {
        const chartType = widget.chartType || visualizationInfo?.type;
        const tags = visualizationInfo?.tags?.length ? visualizationInfo.tags : widget.tags;
        const summary = widget.summary || visualizationInfo?.summary;
        const relatedDataset = widget.datasetId
          ? datasetMap.get(widget.datasetId)
          : visualizationInfo?.dataset_id
            ? datasetMap.get(visualizationInfo.dataset_id)
            : undefined;
        const xKey = visualizationInfo?.x_axis || visualizationInfo?.config?.x_axis;
        const yKey = visualizationInfo?.y_axis || visualizationInfo?.config?.y_axis;
        const zKey = visualizationInfo?.config?.z_axis;

        const renderVisualizationPreview = () => {
          if (chartType === 'forecast') {
            return renderForecastVisualizationWidget(visualizationInfo || widget);
          }
          if (chartType === 'correlation') {
            return renderCorrelationVisualizationWidget(visualizationInfo || widget);
          }
          if (relatedDataset && xKey && yKey) {
            return renderChartPreview({
              chartType,
              dataset: relatedDataset,
              xKey,
              yKey,
              zKey,
              color: visualizationInfo?.config?.color || DEFAULT_CHART_COLOR,
            });
          }
          return (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-sm text-slate-500">
              Добавьте пример данных к набору, чтобы увидеть предпросмотр визуализации.
            </div>
          );
        };

        return (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <IconComponent className="w-6 h-6 text-emerald-600 mt-1" />
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-800">
                  {visualizationInfo?.title || widget.title}
                </div>
                {chartType && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-emerald-700 border-emerald-200">
                    {chartType}
                  </Badge>
                )}
                {relatedDataset?.name && (
                  <p className="text-xs text-slate-500">
                    Основано на наборе: <span className="font-medium text-slate-700">{relatedDataset.name}</span>
                  </p>
                )}
                <SummaryContent content={summary} />
                {renderTagBadges(tags)}
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2 block">
                Живой предпросмотр
              </Label>
              {renderVisualizationPreview()}
            </div>
          </div>
        );
      }
      default:
        return (
          <div className="h-32 bg-slate-50 rounded-lg p-4 flex items-center justify-center">
            <span className="text-slate-500">Виджет {widget.title}</span>
          </div>
        );
    }
  };

  const renderWidget = (widget) => {
    try {
      return renderWidgetContent(widget);
    } catch (error) {
      console.error('Ошибка рендера виджета', widget?.type, error); // eslint-disable-line no-console
      return (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm text-red-800">
          Не удалось отобразить содержимое этого виджета. Проверьте выбранные данные или попробуйте добавить элемент заново.
        </div>
      );
    }
  };

  const isCanvasEmpty = selectedWidgets.length === 0;
  const canvasColumnRef = useRef(null);
  const [libraryHeight, setLibraryHeight] = useState(null);

  useLayoutEffect(() => {
    const updateHeight = () => {
      const isDesktop = typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
      if (!isDesktop || !canvasColumnRef.current) {
        setLibraryHeight(null);
        return;
      }
      const nextHeight = canvasColumnRef.current.getBoundingClientRect().height;
      setLibraryHeight(nextHeight);
    };

    updateHeight();

    const hasWindow = typeof window !== 'undefined';
    if (hasWindow) {
      window.addEventListener('resize', updateHeight);
    }

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined' && canvasColumnRef.current) {
      resizeObserver = new ResizeObserver(updateHeight);
      resizeObserver.observe(canvasColumnRef.current);
    }

    return () => {
      if (hasWindow) {
        window.removeEventListener('resize', updateHeight);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [selectedWidgets, isCanvasEmpty]);

  return (
    <div className="grid gap-8 lg:grid-cols-[320px,1fr] lg:items-stretch">
      {/* Widget Library */}
      <Card
        className="border-0 bg-white/70 backdrop-blur-xl shadow-xl h-full flex flex-col"
        style={libraryHeight ? { height: `${libraryHeight}px` } : undefined}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <Plus className="w-5 h-5 text-emerald-500" />
            Библиотека виджетов
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex min-h-0 flex-col space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              value={librarySearch}
              onChange={(event) => setLibrarySearch(event.target.value)}
              placeholder="Поиск виджетов"
              className="pl-9"
            />
          </div>

          <div className="flex-1 min-h-0">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-3">
                {isLoading && (
                  <>
                    {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="p-3 border rounded-lg bg-white/60">
                      <Skeleton className="h-4 w-1/3 mb-2" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </>
              )}

              {!isLoading && filteredWidgets.length === 0 && (
                <div className="p-4 border rounded-lg text-sm text-slate-500 bg-slate-50">
                  Ничего не найдено. Попробуйте изменить запрос поиска или загрузите новые данные.
                </div>
              )}

                {!isLoading &&
                  filteredWidgets.map((widget) => {
                    const IconComponent = widget.icon || Layout;
                    const details = [];
                    if (widget.type === 'dataset' && widget.rowCount) {
                      details.push(`${widget.rowCount.toLocaleString('ru-RU')} записей`);
                    }
                    if (widget.type === 'visualization' && widget.chartType) {
                      details.push(`Тип: ${widget.chartType}`);
                    }

                    return (
                      <div
                        key={widget.id}
                        className="p-3 border rounded-lg bg-white/60 hover:bg-blue-50/60 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => addWidget(widget)}
                          className="w-full text-left cursor-grab active:cursor-grabbing"
                          draggable
                          onDragStart={(event) => handleLibraryDragStart(event, widget.id)}
                          onDragEnd={handleLibraryDragEnd}
                        >
                          <div className="flex items-start gap-3">
                            <IconComponent className="w-5 h-5 text-slate-600 mt-1" />
                            <div className="space-y-1">
                              <div className="font-medium text-sm text-slate-800">{widget.title}</div>
                              <div className="text-[11px] uppercase tracking-wide text-slate-400">
                                {widget.type}
                              </div>
                              {widget.description && (
                                <p className="text-xs text-slate-500">
                                  {widget.description}
                                </p>
                              )}
                              {details.length > 0 && (
                                <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                                  {details.map((detail) => (
                                    <span key={detail}>{detail}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </div>

          <div className="pt-4 border-t">
            <div className="space-y-2 text-xs text-slate-500">
              <div className="text-sm font-medium text-slate-700">Доступные данные</div>
              <div className="flex flex-col gap-1">
                <span>{datasets.length} наборов данных</span>
                <span>{visualizations.length} визуализаций</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Canvas */}
      <div className="space-y-6" ref={canvasColumnRef}>
        {/* Dashboard Header */}
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <Input
                value={dashboardName}
                onChange={(e) => setDashboardName(e.target.value)}
                className="text-lg font-bold border-0 shadow-none focus-visible:ring-0"
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handlePreview}
                >
                  <Eye className="w-4 h-4" />
                  Предпросмотр
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={handleClear}
                  disabled={isCanvasEmpty}
                >
                  <RotateCcw className="w-4 h-4" />
                  Очистить холст
                </Button>
                <Button size="sm" className="gap-2" onClick={handleSave}>
                  <Save className="w-4 h-4" />
                  Сохранить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Grid */}
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl min-h-96">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
              <Layout className="w-5 h-5 text-blue-500" />
              Холст дашборда
              <Badge variant="secondary" className="ml-2 bg-blue-50 text-blue-700">
                {selectedWidgets.length} элементов
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent
            onDragOver={handleCanvasDragOver}
            onDragLeave={handleCanvasDragLeave}
            onDrop={handleCanvasDrop}
            className={`transition-colors ${
              isCanvasDragOver ? 'bg-blue-50/40 rounded-xl' : ''
            }`}
          >
            {isCanvasEmpty ? (
              <div
                className={`py-12 px-6 rounded-xl border-2 border-dashed transition-colors ${
                  isCanvasDragOver
                    ? 'border-blue-400 bg-blue-50/50 text-slate-600'
                    : 'border-slate-200/60 bg-slate-50/60 text-slate-600'
                }`}
              >
                <div className="max-w-3xl mx-auto text-center space-y-4">
                  <Layout className="w-16 h-16 mx-auto mb-2 opacity-40 text-blue-400" />
                  <h3 className="text-2xl font-semibold text-slate-800">Холст пока пуст</h3>
                  <p className="text-sm text-slate-500">
                    Добавьте виджеты из библиотеки слева или вставьте готовый шаблон, чтобы начать сборку дашборда.
                  </p>
                </div>
                <div className="mt-10 space-y-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500 text-center">
                    Быстрый старт со встроенных шаблонов
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {TEMPLATE_PRESETS.map((template) => {
                      const IconComponent = template.icon || LayoutDashboard;
                      const widgetsCount = templateWidgetsCount(template);
                      return (
                        <div
                          key={template.id}
                          className="rounded-3xl border border-slate-200 bg-white/90 p-4 space-y-3 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`rounded-2xl bg-gradient-to-r ${template.accent} p-3 text-white shadow`}>
                              <IconComponent className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900">{template.title}</p>
                              <p className="text-xs text-slate-500">{template.description}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                            {template.audience && (
                              <Badge variant="outline" className="uppercase tracking-wide">
                                {template.audience}
                              </Badge>
                            )}
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                              {widgetsCount} виджета
                            </Badge>
                          </div>
                          {template.highlights?.length ? (
                            <div className="flex flex-wrap gap-2">
                              {template.highlights.slice(0, 3).map((entry) => (
                                <Badge key={entry} variant="outline" className="text-[10px] text-blue-600 border-blue-200">
                                  {entry}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => handleApplyTemplate(template)}
                            disabled={!widgetsCount}
                          >
                            <Sparkles className="w-4 h-4" />
                            Вставить шаблон
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="dashboard">
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 rounded-xl transition-shadow ${
                        isCanvasDragOver
                          ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-blue-50 bg-blue-50/40'
                          : ''
                      }`}
                    >
                      {selectedWidgets.map((widget, index) => (
                        <Draggable key={widget.id} draggableId={widget.id} index={index}>
                          {(provided, snapshot) => {
                            const displayTitle =
                              (widget.customTitle && widget.customTitle.trim()) ||
                              (widget.type === 'stats' && widget.metricLabel
                                ? widget.metricLabel
                                : widget.title);

                            return (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`relative group transition-shadow ${
                                  snapshot.isDragging ? 'shadow-lg shadow-blue-100' : ''
                                }`}
                              >
                                <Card className="overflow-hidden">
                                  <CardHeader className="p-3 bg-slate-50 border-b">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-sm font-medium">
                                        {displayTitle}
                                      </CardTitle>
                                      <div className="flex items-center gap-1">
                                        <div
                                          {...provided.dragHandleProps}
                                          className="p-1 hover:bg-slate-200 rounded cursor-move"
                                        >
                                          <Grip className="w-3 h-3 text-slate-400" />
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => removeWidget(widget.id)}
                                          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                                        >
                                          <X className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </CardHeader>
                                  <CardContent className="p-4">
                                    {renderWidget(widget)}
                                  </CardContent>
                                </Card>
                              </div>
                            );
                          }}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
