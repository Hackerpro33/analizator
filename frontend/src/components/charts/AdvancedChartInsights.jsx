import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { Sparkles, Layers, Filter, Activity, Database, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { startModelRun, getModelRunResults, listModelRuns, getModelRunAlerts } from "@/api/ml";
import TimeWindowSelector from "@/components/common/TimeWindowSelector";

const DEFAULT_SEGMENTS = [
  { column: "crime_type", value: "theft", label: "Кражи" },
  { column: "crime_type", value: "violence", label: "Насильственные" },
  { column: "precinct", value: "central", label: "Центральный округ" },
  { column: "precinct", value: "industrial", label: "Промзона" },
];

const DEFAULT_INSIGHTS = {
  combinedSeriesByMethod: {
    sarima: [
      { period: "Янв", fact: 320, plan: 310, forecast: 300 },
      { period: "Фев", fact: 295, plan: 305, forecast: 288 },
      { period: "Мар", fact: 280, plan: 295, forecast: 276 },
      { period: "Апр", fact: 270, plan: 285, forecast: 266 },
      { period: "Май", fact: 250, plan: 270, forecast: 252 },
      { period: "Июн", fact: 240, plan: 260, forecast: 244 },
    ],
    sarimax: [
      { period: "Янв", fact: 320, plan: 310, forecast: 302 },
      { period: "Фев", fact: 295, plan: 305, forecast: 290 },
      { period: "Мар", fact: 280, plan: 295, forecast: 281 },
      { period: "Апр", fact: 270, plan: 285, forecast: 273 },
      { period: "Май", fact: 250, plan: 270, forecast: 261 },
      { period: "Июн", fact: 240, plan: 260, forecast: 255 },
    ],
    prophet: [
      { period: "Янв", fact: 320, plan: 310, forecast: 298 },
      { period: "Фев", fact: 295, plan: 305, forecast: 286 },
      { period: "Мар", fact: 280, plan: 295, forecast: 279 },
      { period: "Апр", fact: 270, plan: 285, forecast: 270 },
      { period: "Май", fact: 250, plan: 270, forecast: 260 },
      { period: "Июн", fact: 240, plan: 260, forecast: 249 },
    ],
  },
  contributionData: [
    { factor: "Патруль ночной", value: 34 },
    { factor: "Камеры и сенсоры", value: 22 },
    { factor: "Работа с сообществом", value: 18 },
    { factor: "Оперативные сводки", value: 14 },
    { factor: "Совместные рейды", value: 12 },
  ],
  anomalies: [
    { id: 1, date: "2024-04-15", metric: "Инциденты в центре", deviation: "+18%", context: "Всплеск карманных краж во время массового мероприятия" },
    { id: 2, date: "2024-05-03", metric: "Реакция патрулей", deviation: "-9%", context: "Перевод нарядов на крупную спецоперацию в соседнем районе" },
  ],
  seasonalityData: [
    { period: "Нед 1", trend: 100, seasonality: -4, residual: 2 },
    { period: "Нед 2", trend: 104, seasonality: 1, residual: -3 },
    { period: "Нед 3", trend: 108, seasonality: 3, residual: -1 },
    { period: "Нед 4", trend: 112, seasonality: -2, residual: 4 },
    { period: "Нед 5", trend: 116, seasonality: 2, residual: 0 },
  ],
  logisticCurve: [
    { score: -4, probability: 0.02 },
    { score: -3, probability: 0.05 },
    { score: -2, probability: 0.12 },
    { score: -1, probability: 0.27 },
    { score: 0, probability: 0.5 },
    { score: 1, probability: 0.73 },
    { score: 2, probability: 0.88 },
    { score: 3, probability: 0.95 },
    { score: 4, probability: 0.98 },
  ],
  residualDiagnostics: [
    { obs: 1, residual: -5 },
    { obs: 2, residual: 3 },
    { obs: 3, residual: -2 },
    { obs: 4, residual: 6 },
    { obs: 5, residual: -1 },
    { obs: 6, residual: 2 },
  ],
  panelEffects: [
    { period: "T1", fixed: 2.3, random: 1.7, diff: 1.2 },
    { period: "T2", fixed: 2.1, random: 1.6, diff: 1.1 },
    { period: "T3", fixed: 1.9, random: 1.5, diff: 0.9 },
    { period: "T4", fixed: 1.6, random: 1.2, diff: 0.7 },
  ],
  diffInDiffData: [
    { period: "До", treated: 30, control: 31 },
    { period: "После", treated: 18, control: 28 },
  ],
};

const MODEL_DESCRIPTIONS = {
  regression: [
    { title: "Линейная OLS", detail: "Оценка базового влияния факторов на частоту инцидентов и построение доверительных интервалов." },
    { title: "Логит/Пробит", detail: "Вероятность конкретного типа преступления при заданных факторах среды." },
    { title: "Ridge/Lasso", detail: "Стабильные модели при мультиколлинеарности; автоматически отбирают факторы риска." },
    { title: "Инструментальные переменные", detail: "Учитывают скрытые смещения, например зависимость патрулей от прошлых инцидентов." },
    { title: "Диагностика остатков", detail: "Проверка гетероскедастичности, автокорреляции и гипотезы нормальности." },
  ],
  timeseries: [
    { title: "ARIMA/SARIMA", detail: "Сезонные паттерны по районам с учётом автокорреляции событий." },
    { title: "SARIMAX", detail: "Включение погодных, социальных и инфраструктурных факторов в прогноз." },
    { title: "Prophet", detail: "Гибкое моделирование праздников и трендов при нехватке данных." },
    { title: "Поиск сезонности", detail: "Автоопределение периода волн преступности и сглаживание выбросов." },
    { title: "Декомпозиция трендов", detail: "Отделение долгосрочных сдвигов от циклов." },
  ],
  causal: [
    { title: "Fixed / Random effects", detail: "Сравнение районов с постоянными и случайными отличиями." },
    { title: "Difference-in-Differences", detail: "Оценка эффекта кампаний по профилактике относительно контрольных зон." },
    { title: "GMM", detail: "Нелинейные инструменты для сложных панельных зависимостей." },
    { title: "Тест Грейнджера", detail: "Проверка причинности между типами преступлений." },
    { title: "Коинтеграция (ADF, KPSS)", detail: "Диагностика долгосрочных связей в панельных рядах." },
  ],
};

const NUMBER_TYPES = ["int", "integer", "float", "double", "decimal", "number", "numeric"];
const DATE_HINTS = ["date", "дата", "period", "month", "time"];
const MODEL_ALGORITHMS = [
  { value: "ols", label: "OLS (регрессия)" },
  { value: "ridge", label: "Ridge" },
  { value: "lasso", label: "Lasso" },
  { value: "logit", label: "Логит" },
  { value: "probit", label: "Пробит" },
  { value: "iv", label: "Инструментальные переменные" },
  { value: "gmm", label: "GMM" },
  { value: "fixed_effects", label: "Fixed Effects" },
  { value: "random_effects", label: "Random Effects" },
  { value: "diff_in_diff", label: "Difference-in-Differences" },
  { value: "granger", label: "Тест Грейнджера" },
  { value: "cointegration", label: "Коинтеграция" },
  { value: "arima", label: "ARIMA/SARIMAX" },
  { value: "prophet", label: "Prophet" },
];

const computeStdDev = (values) => {
  if (!values.length) {
    return 0;
  }
  const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
  const variance = values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
};

const formatPeriod = (value, fallback) => {
  if (!value && value !== 0) {
    return fallback;
  }
  const date = new Date(value);
  if (!isNaN(date)) {
    return date.toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
  }
  return String(value);
};

const movingAverage = (series, idx, window = 3) => {
  const start = Math.max(0, idx - window + 1);
  const slice = series.slice(start, idx + 1);
  if (!slice.length) {
    return 0;
  }
  const sum = slice.reduce((acc, item) => acc + (item.fact || 0), 0);
  return sum / slice.length;
};

const linearRegression = (points) => {
  if (!points.length) {
    return { slope: 0, intercept: 0 };
  }
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const [x, y] of points) {
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n || 0 };
  }
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
};

const detectNumericColumns = (dataset) => {
  const columns = dataset?.columns || [];
  const sample = dataset?.sample_data || [];
  const numeric = columns
    .filter((col) => NUMBER_TYPES.includes((col.type || "").toLowerCase()))
    .map((col) => col.name);

  if (numeric.length || !sample.length) {
    return numeric;
  }

  const firstRow = sample[0];
  if (!firstRow) {
    return [];
  }
  return Object.keys(firstRow).filter((key) => sample.some((row) => typeof row?.[key] === "number"));
};

const detectDateKey = (dataset) => {
  const columns = dataset?.columns || [];
  for (const col of columns) {
    if ((col.type || "").toLowerCase().includes("date")) {
      return col.name;
    }
    if (DATE_HINTS.some((hint) => (col.name || "").toLowerCase().includes(hint))) {
      return col.name;
    }
  }

  const sample = dataset?.sample_data || [];
  if (!sample.length) {
    return null;
  }
  const firstRow = sample[0];
  return Object.keys(firstRow).find((key) => {
    const value = firstRow[key];
    return value && !isNaN(new Date(value));
  });
};

const detectCategoryColumns = (dataset) => {
  const columns = dataset?.columns || [];
  const categorical = columns
    .filter((col) => (col.type || "").toLowerCase().includes("string") || (col.type || "").toLowerCase().includes("category"))
    .map((col) => col.name);

  if (categorical.length) {
    return categorical;
  }

  const sample = dataset?.sample_data || [];
  if (!sample.length) {
    return [];
  }
  const firstRow = sample[0];
  return Object.keys(firstRow).filter((key) => typeof firstRow[key] === "string");
};

const parseDateValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const toNumberValue = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const filterRecordsByWindow = (records, window) => {
  if (!window?.column || (!window.start && !window.end)) {
    return records;
  }
  const { column, start, end } = window;
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  const startNumber = toNumberValue(start);
  const endNumber = toNumberValue(end);
  return records.filter((row) => {
    const raw = row?.[column];
    if (raw === undefined || raw === null || raw === "") {
      return false;
    }
    const asDate = parseDateValue(raw);
    if (asDate && (startDate || endDate)) {
      if (startDate && asDate < startDate) return false;
      if (endDate && asDate > endDate) return false;
      return true;
    }
    const asNumber = toNumberValue(raw);
    if (asNumber !== null && (startNumber !== null || endNumber !== null)) {
      if (startNumber !== null && asNumber < startNumber) return false;
      if (endNumber !== null && asNumber > endNumber) return false;
      return true;
    }
    const textValue = String(raw).toLowerCase();
    const startText = start ? String(start).toLowerCase() : null;
    const endText = end ? String(end).toLowerCase() : null;
    if (startText && textValue < startText) return false;
    if (endText && textValue > endText) return false;
    return true;
  });
};

const uniqueList = (items = []) => Array.from(new Set(items.filter((item) => item)));

const detectBinaryColumns = (dataset) => {
  const sample = dataset?.sample_data || [];
  if (!sample.length) {
    return [];
  }
  const columns = Object.keys(sample[0]);
  const binary = [];
  for (const column of columns) {
    const unique = new Set(
      sample
        .map((row) => row?.[column])
        .filter((value) => value !== null && value !== undefined && value !== "")
    );
    if (unique.size > 0 && unique.size <= 2) {
      binary.push(column);
    }
  }
  return binary;
};

const guessTreatmentColumn = (dataset, binaryColumns) => {
  const hints = ["treatment", "интервен", "кампан", "pilot", "program", "policy"];
  const columns = dataset?.columns || [];
  const hinted = columns.find((col) =>
    hints.some((hint) => (col.name || "").toLowerCase().includes(hint))
  );
  if (hinted) {
    return hinted.name;
  }
  return binaryColumns[0] || null;
};

const guessInstrumentColumns = (numericColumns, targetColumn) => {
  return numericColumns.filter((column) => column !== targetColumn).slice(0, 2);
};

const guessCauseColumn = (numericColumns, valueColumn) => {
  return numericColumns.find((column) => column !== valueColumn) || null;
};

const buildCombinedSeries = (records, dateKey, valueKey) => {
  const baseSeries = records
    .map((row, idx) => ({
      period: formatPeriod(dateKey ? row[dateKey] : `T${idx + 1}`, `T${idx + 1}`),
      fact: Number(row[valueKey]) || 0,
    }))
    .filter((item) => !Number.isNaN(item.fact));

  if (!baseSeries.length) {
    return DEFAULT_INSIGHTS.combinedSeriesByMethod.sarima;
  }

  const regression = linearRegression(baseSeries.map((point, idx) => [idx, point.fact]));

  return baseSeries.map((point, idx) => {
    const plan = movingAverage(baseSeries, idx, 3);
    const forecast = regression.slope * (idx + 1) + regression.intercept;
    return {
      ...point,
      plan: Number(plan.toFixed(1)),
      forecast: Number(forecast.toFixed(1)),
    };
  });
};

const adjustForecastSeries = (series, factor) => {
  return series.map((point, idx) => ({
    ...point,
    forecast: Number((point.forecast * factor ** (idx / series.length)).toFixed(1)),
  }));
};

const buildSeasonality = (series) => {
  if (!series?.length) {
    return DEFAULT_INSIGHTS.seasonalityData;
  }

  return series.map((point, idx) => {
    const trend = movingAverage(series, idx, 4);
    const seasonality = point.fact - trend;
    const residual = point.fact - trend - seasonality * 0.4;
    return {
      period: point.period,
      trend: Number(trend.toFixed(1)),
      seasonality: Number(seasonality.toFixed(1)),
      residual: Number(residual.toFixed(1)),
    };
  });
};

const buildContributions = (records, categoryKey, valueKey) => {
  if (!categoryKey) {
    return DEFAULT_INSIGHTS.contributionData;
  }
  const totals = {};
  records.forEach((row) => {
    const key = row?.[categoryKey] || "Не указано";
    const value = Number(row?.[valueKey]) || 0;
    totals[key] = (totals[key] || 0) + value;
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([factor, value]) => ({ factor, value: Number(value.toFixed(1)) }));
};

const buildLogisticCurve = (series) => {
  if (!series?.length) {
    return DEFAULT_INSIGHTS.logisticCurve;
  }
  const facts = series.map((item) => item.fact);
  const min = Math.min(...facts);
  const max = Math.max(...facts);
  const denominator = max - min || 1;
  const step = Math.max(1, Math.floor(series.length / 8));
  return series
    .filter((_, idx) => idx % step === 0)
    .slice(0, 9)
    .map((point) => {
      const normalized = (point.fact - min) / denominator;
      const score = normalized * 10 - 5;
      const probability = 1 / (1 + Math.exp(-score));
      return {
        score: Number(score.toFixed(2)),
        probability: Number(probability.toFixed(2)),
      };
    });
};

const buildResidualDiagnostics = (series) => {
  if (!series?.length) {
    return DEFAULT_INSIGHTS.residualDiagnostics;
  }
  return series.slice(0, 12).map((point, idx) => ({
    obs: idx + 1,
    residual: Number((point.fact - point.plan).toFixed(2)),
  }));
};

const buildAnomalies = (series) => {
  if (!series?.length) {
    return DEFAULT_INSIGHTS.anomalies;
  }
  const residuals = series.map((point) => ({
    ...point,
    residual: point.fact - point.plan,
  }));
  return residuals
    .sort((a, b) => Math.abs(b.residual) - Math.abs(a.residual))
    .slice(0, 2)
    .map((item, idx) => ({
      id: idx + 1,
      date: item.period,
      metric: "Инциденты",
      deviation: `${item.residual >= 0 ? "+" : ""}${((item.residual / (item.plan || 1)) * 100).toFixed(1)}%`,
      context: item.residual >= 0 ? "Рост относительно плана" : "Падение относительно плана",
    }));
};

const buildPanelEffects = (records, categoryKey, dateKey, valueKey) => {
  if (!categoryKey) {
    return DEFAULT_INSIGHTS.panelEffects;
  }
  const periodMap = new Map();
  records.forEach((row, idx) => {
    const period = formatPeriod(dateKey ? row[dateKey] : `T${idx + 1}`, `T${idx + 1}`);
    if (!periodMap.has(period)) {
      periodMap.set(period, []);
    }
    periodMap.get(period).push({
      category: row?.[categoryKey] || "Не указано",
      value: Number(row?.[valueKey]) || 0,
    });
  });
  const periods = Array.from(periodMap.keys()).slice(0, 4);
  if (!periods.length) {
    return DEFAULT_INSIGHTS.panelEffects;
  }
  return periods.map((period) => {
    const entries = periodMap.get(period) || [];
    const groupMap = {};
    entries.forEach((entry) => {
      if (!groupMap[entry.category]) {
        groupMap[entry.category] = { sum: 0, count: 0 };
      }
      groupMap[entry.category].sum += entry.value;
      groupMap[entry.category].count += 1;
    });
    const means = Object.values(groupMap).map((item) => (item.sum || 0) / (item.count || 1));
    if (!means.length) {
      return { period, fixed: 0, random: 0, diff: 0 };
    }
    const fixed = Math.max(...means);
    const random = means.reduce((acc, value) => acc + value, 0) / means.length;
    return {
      period,
      fixed: Number(fixed.toFixed(1)),
      random: Number(random.toFixed(1)),
      diff: Number((fixed - random).toFixed(1)),
    };
  });
};

const buildDiffInDiff = (records, categoryKey, valueKey) => {
  if (!categoryKey) {
    return DEFAULT_INSIGHTS.diffInDiffData;
  }
  const categories = Array.from(new Set(records.map((row) => row?.[categoryKey]).filter(Boolean)));
  if (categories.length < 2) {
    return DEFAULT_INSIGHTS.diffInDiffData;
  }
  const treated = categories[0];
  const control = categories[1];
  const midpoint = Math.max(1, Math.floor(records.length / 2));

  const avg = (category, start, end) => {
    const slice = records.slice(start, end + 1).filter((row) => row?.[categoryKey] === category);
    if (!slice.length) {
      return 0;
    }
    const sum = slice.reduce((acc, row) => acc + (Number(row?.[valueKey]) || 0), 0);
    return sum / slice.length;
  };

  const treatedBefore = avg(treated, 0, midpoint - 1);
  const treatedAfter = avg(treated, midpoint, records.length - 1);
  const controlBefore = avg(control, 0, midpoint - 1);
  const controlAfter = avg(control, midpoint, records.length - 1);

  return [
    {
      period: "До",
      treated: Number(treatedBefore.toFixed(1)),
      control: Number(controlBefore.toFixed(1)),
    },
    {
      period: "После",
      treated: Number(treatedAfter.toFixed(1)),
      control: Number(controlAfter.toFixed(1)),
    },
  ];
};

const buildSegments = (categoryKey, records) => {
  if (!categoryKey) {
    return DEFAULT_SEGMENTS;
  }
  const values = Array.from(new Set(records.map((row) => row?.[categoryKey]).filter(Boolean))).slice(0, 4);
  if (!values.length) {
    return DEFAULT_SEGMENTS;
  }
  return values.map((value) => ({
    column: categoryKey,
    value,
    label: value,
  }));
};

const buildInsights = (dataset) => {
  if (!dataset || !dataset.sample_data?.length) {
    return { ...DEFAULT_INSIGHTS, segments: DEFAULT_SEGMENTS };
  }

  const numericColumns = detectNumericColumns(dataset);
  if (!numericColumns.length) {
    return { ...DEFAULT_INSIGHTS, segments: DEFAULT_SEGMENTS };
  }
  const valueKey = numericColumns[0];
  const dateKey = detectDateKey(dataset);
  const categoryColumns = detectCategoryColumns(dataset);
  const categoryKey = categoryColumns[0];
  const binaryColumns = detectBinaryColumns(dataset);
  const records = dataset.sample_data || [];

  const baseSeries = buildCombinedSeries(records, dateKey, valueKey);
  const combinedSeriesByMethod = {
    sarima: baseSeries,
    sarimax: adjustForecastSeries(baseSeries, 1.02),
    prophet: adjustForecastSeries(baseSeries, 0.98),
  };

  const numeric_values = valueKey
    ? records
        .map((row) => Number(row?.[valueKey]))
        .filter((value) => Number.isFinite(value))
    : [];
  const std = computeStdDev(numeric_values);
  const thresholds =
    std > 0
      ? {
          rmse: Number((std * 1.5).toFixed(3)),
          mae: Number((std * 1.2).toFixed(3)),
        }
      : null;

  const instrumentColumns = guessInstrumentColumns(numericColumns, valueKey);
  const treatmentColumn = guessTreatmentColumn(dataset, binaryColumns);
  const causeColumn = guessCauseColumn(numericColumns, valueKey);
  const cointegrationColumns = numericColumns.slice(0, 2);

  return {
    combinedSeriesByMethod,
    contributionData: buildContributions(records, categoryKey, valueKey),
    anomalies: buildAnomalies(baseSeries),
    seasonalityData: buildSeasonality(baseSeries),
    logisticCurve: buildLogisticCurve(baseSeries),
    residualDiagnostics: buildResidualDiagnostics(baseSeries),
    panelEffects: buildPanelEffects(records, categoryKey, dateKey, valueKey),
    diffInDiffData: buildDiffInDiff(records, categoryKey, valueKey),
    segments: buildSegments(categoryKey, records),
    auto_config: {
      dataset_id: dataset.id,
      value_column: valueKey,
      date_column: dateKey,
      target_column: valueKey,
      feature_columns: numericColumns.filter((name) => name !== valueKey).slice(0, 6),
      thresholds,
      binary_target: binaryColumns.find((column) => column !== valueKey) || binaryColumns[0] || null,
      treatment_column: treatmentColumn,
      instrument_columns: instrumentColumns,
      cause_column: causeColumn,
      cointegration_columns: cointegrationColumns,
      panel_entity: categoryKey,
      panel_time_column: dateKey,
    },
  };
};

export default function AdvancedChartInsights({ datasets = [], onSegmentChange, activeSegment }) {
  const [selectedDatasetId, setSelectedDatasetId] = useState(datasets[0] ? String(datasets[0].id) : "");
  const [selectedSegment, setSelectedSegment] = useState(activeSegment || null);
  const [forecastMethod, setForecastMethod] = useState("sarima");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("ols");
  const [modelRun, setModelRun] = useState(null);
  const [modelResults, setModelResults] = useState([]);
  const [isModelRunning, setIsModelRunning] = useState(false);
  const [modelError, setModelError] = useState("");
  const [recentRuns, setRecentRuns] = useState([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [modelAlerts, setModelAlerts] = useState([]);
  const [customConfig, setCustomConfig] = useState({});
  const [timeWindow, setTimeWindow] = useState({ column: "", start: "", end: "" });
  const datasetChangeRef = useRef(null);

  useEffect(() => {
    setSelectedSegment(activeSegment || null);
  }, [activeSegment]);

  useEffect(() => {
    if (datasets.length && !selectedDatasetId) {
      setSelectedDatasetId(String(datasets[0].id));
    }
  }, [datasets, selectedDatasetId]);

  const refreshRecentRuns = useCallback(async () => {
    setIsLoadingRuns(true);
    try {
      const response = await listModelRuns(5);
      setRecentRuns(response.items || []);
    } catch (error) {
      console.error("Failed to load model runs", error);
    } finally {
      setIsLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    refreshRecentRuns();
  }, [refreshRecentRuns]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => String(dataset.id) === selectedDatasetId),
    [datasets, selectedDatasetId]
  );

  const datasetWithWindow = useMemo(() => {
    if (!selectedDataset) {
      return null;
    }
    const filteredSample = filterRecordsByWindow(selectedDataset.sample_data || [], timeWindow);
    if (filteredSample === selectedDataset.sample_data) {
      return selectedDataset;
    }
    return { ...selectedDataset, sample_data: filteredSample };
  }, [selectedDataset, timeWindow]);

  const insights = useMemo(() => buildInsights(datasetWithWindow), [datasetWithWindow]);

  const segments = insights.segments?.length ? insights.segments : DEFAULT_SEGMENTS;
  const autoConfig = insights.auto_config || {};

  useEffect(() => {
    const clonedConfig = autoConfig ? { ...autoConfig } : {};
    if (!selectedDatasetId) {
      datasetChangeRef.current = null;
      setCustomConfig(clonedConfig);
      setTimeWindow({
        column: clonedConfig.date_column || clonedConfig.panel_time_column || "",
        start: "",
        end: "",
      });
      return;
    }
    if (datasetChangeRef.current === selectedDatasetId) {
      return;
    }
    datasetChangeRef.current = selectedDatasetId;
    setCustomConfig(clonedConfig);
    setTimeWindow({
      column: clonedConfig.date_column || clonedConfig.panel_time_column || "",
      start: "",
      end: "",
    });
  }, [selectedDatasetId, autoConfig]);

  const datasetColumnsList = useMemo(
    () => (selectedDataset?.columns || []).map((column) => column.name).filter(Boolean),
    [selectedDataset]
  );
  const numericCandidates = useMemo(() => detectNumericColumns(selectedDataset), [selectedDataset]);
  const categoryCandidates = useMemo(() => detectCategoryColumns(selectedDataset), [selectedDataset]);
  const binaryCandidates = useMemo(() => detectBinaryColumns(selectedDataset), [selectedDataset]);
  const config = customConfig || {};
  const updateConfig = (patch) => setCustomConfig((prev) => ({ ...(prev || {}), ...patch }));
  const toggleValueInConfig = (key, column) => {
    const current = uniqueList(config[key] || []);
    const exists = current.includes(column);
    const next = exists ? current.filter((item) => item !== column) : [...current, column];
    updateConfig({ [key]: next });
  };

  const renderColumnSelect = (labelText, value, options, onChange, placeholder = "Выберите колонку") => (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{labelText}</Label>
      <Select value={value || ""} onValueChange={onChange} disabled={!options.length}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
  const requiresRegressionTarget = ["ols", "ridge", "lasso", "iv", "gmm"].includes(selectedAlgorithm);
  const requiresBinaryTarget = ["logit", "probit"].includes(selectedAlgorithm);
  const requiresValueColumn = ["arima", "prophet", "diff_in_diff", "fixed_effects", "random_effects"].includes(
    selectedAlgorithm
  );
  const requiresDateColumn = ["arima", "prophet", "diff_in_diff"].includes(selectedAlgorithm);
  const requiresPanelFields = ["fixed_effects", "random_effects"].includes(selectedAlgorithm);
  const requiresInstruments = ["iv", "gmm"].includes(selectedAlgorithm);
  const requiresTreatmentColumn = selectedAlgorithm === "diff_in_diff";
  const requiresCauseColumn = selectedAlgorithm === "granger";
  const requiresCointegration = selectedAlgorithm === "cointegration";

  const combinedSeries = useMemo(() => {
    const mapped = insights.combinedSeriesByMethod || DEFAULT_INSIGHTS.combinedSeriesByMethod;
    return mapped[forecastMethod] || mapped.sarima;
  }, [insights.combinedSeriesByMethod, forecastMethod]);

  const cumulativeContribution = useMemo(() => {
    let total = 0;
    return (insights.contributionData || []).map((item) => {
      total += item.value;
      return { ...item, cumulative: Number(total.toFixed(1)) };
    });
  }, [insights.contributionData]);

  const handleSegmentClick = (segment) => {
    const isSame = selectedSegment?.column === segment.column && selectedSegment?.value === segment.value;
    const next = isSame ? null : segment;
    setSelectedSegment(next);
    if (onSegmentChange) {
      onSegmentChange(next);
    }
  };

  const fetchRunResults = useCallback(
    async (runId) => {
      if (!runId) {
        return;
      }
      try {
        const payload = await getModelRunResults(runId);
        if (payload.run) {
          setModelRun(payload.run);
        }
        if (payload.results) {
          setModelResults(payload.results);
        }
      } catch (error) {
        console.error("Failed to fetch run results", error);
      }
    },
    []
  );

  const fetchRunAlerts = useCallback(
    async (runId) => {
      if (!runId) {
        return;
      }
      try {
        const payload = await getModelRunAlerts(runId);
        setModelAlerts(payload.alerts || []);
      } catch (error) {
        console.error("Failed to fetch alerts", error);
      }
    },
    []
  );

  const handleRunModel = async () => {
    if (!selectedDatasetId && !selectedDataset?.file_url) {
      setModelError("Выберите набор данных для расчёта модели");
      return;
    }
    setModelError("");
    setModelAlerts([]);
    setIsModelRunning(true);
    try {
      const ensure = (condition, message) => {
        if (!condition) {
          throw new Error(message);
        }
      };
      const parameters = {};
      const datasetPayload = selectedDataset?.file_url ? { file_url: selectedDataset.file_url } : {};
      const effectiveTimeWindow =
        timeWindow?.column && (timeWindow.start || timeWindow.end) ? timeWindow : null;
      if (effectiveTimeWindow) {
        parameters.time_window = effectiveTimeWindow;
      }
      let algorithmName = selectedAlgorithm;
      let modelType = "regression";

      if (["ols", "ridge", "lasso"].includes(selectedAlgorithm)) {
        ensure(config.target_column, "Не задана целевая колонка для регрессии");
        const features = uniqueList(config.feature_columns || []);
        ensure(features.length, "Добавьте числовые признаки для регрессии");
        parameters.target_column = config.target_column;
        parameters.feature_columns = features;
        if (["ridge", "lasso"].includes(selectedAlgorithm)) {
          parameters.alpha = 1.0;
        }
      } else if (["logit", "probit"].includes(selectedAlgorithm)) {
        modelType = "classification";
        ensure(config.binary_target, "Не найден бинарный целевой столбец для логит/пробит модели");
        const features = uniqueList((config.feature_columns || []).filter((column) => column !== config.binary_target));
        ensure(features.length, "Нужны числовые признаки для классификации");
        parameters.target_column = config.binary_target;
        parameters.feature_columns = features;
      } else if (selectedAlgorithm === "arima") {
        modelType = "forecasting";
        parameters.value_column = config.value_column;
        parameters.date_column = config.date_column;
        parameters.horizon = 12;
        parameters.order = [1, 1, 1];
        parameters.seasonal_order = [1, 0, 1, 12];
        ensure(parameters.value_column && parameters.date_column, "Для ARIMA требуется столбец даты и значения");
      } else if (selectedAlgorithm === "prophet") {
        modelType = "forecasting";
        parameters.value_column = config.value_column;
        parameters.date_column = config.date_column;
        parameters.horizon = 12;
        ensure(parameters.value_column && parameters.date_column, "Для Prophet требуется столбец даты и значения");
      } else if (["iv", "gmm"].includes(selectedAlgorithm)) {
        modelType = "causal";
        const features = uniqueList(config.feature_columns || []);
        const instruments = uniqueList(config.instrument_columns || []);
        ensure(config.target_column, "Укажите целевую колонку для IV/GMM");
        ensure(features.length, "Добавьте признаки для IV/GMM");
        ensure(instruments.length, "Не удалось подобрать инструменты для IV/GMM");
        parameters.target_column = config.target_column;
        parameters.feature_columns = features;
        parameters.instrument_columns = instruments;
      } else if (["fixed_effects", "random_effects"].includes(selectedAlgorithm)) {
        modelType = "causal";
        parameters.value_column = config.value_column;
        parameters.feature_columns = uniqueList(config.feature_columns || []);
        parameters.entity_column = config.panel_entity;
        parameters.time_column = config.panel_time_column || config.date_column;
        ensure(parameters.value_column, "Укажите числовой показатель для панельной модели");
        ensure(parameters.entity_column, "Не найден столбец с сущностями для панели");
        ensure(parameters.time_column, "Не найдена колонка времени для панели");
      } else if (selectedAlgorithm === "diff_in_diff") {
        modelType = "causal";
        parameters.value_column = config.value_column;
        parameters.time_column = config.date_column || config.panel_time_column;
        parameters.treatment_column = config.treatment_column || config.binary_target;
        ensure(parameters.value_column, "Для Difference-in-Differences нужен числовой показатель");
        ensure(parameters.time_column, "Не найдена колонка даты/периода для Difference-in-Differences");
        ensure(parameters.treatment_column, "Не найден столбец с группой вмешательства");
      } else if (selectedAlgorithm === "granger") {
        modelType = "causal";
        parameters.target_column = config.value_column || config.target_column;
        parameters.cause_column = config.cause_column;
        parameters.max_lag = 3;
        ensure(
          parameters.target_column &&
            parameters.cause_column &&
            parameters.target_column !== parameters.cause_column,
          "Нужны две различные числовые колонки для теста Грейнджера"
        );
      } else if (selectedAlgorithm === "cointegration") {
        modelType = "causal";
        const [seriesX, seriesY] = config.cointegration_columns || [];
        parameters.series_x = seriesX;
        parameters.series_y = seriesY;
        ensure(seriesX && seriesY, "Нужны две числовые серии для теста коинтеграции");
      } else {
        throw new Error("Алгоритм не поддерживается");
      }

      if (config.thresholds && ["ols", "ridge", "lasso"].includes(selectedAlgorithm)) {
        parameters.thresholds = config.thresholds;
      }
      const response = await startModelRun({
        dataset_id: selectedDatasetId || undefined,
        model_type: modelType,
        algorithm: algorithmName,
        parameters,
        ...datasetPayload,
      });
      const runPayload = response.run || response;
      setModelRun(runPayload);
      setModelResults(response.results || []);
      if (!(response.results || []).length && runPayload?.id) {
        await fetchRunResults(runPayload.id);
      }
      if (runPayload?.id) {
        await fetchRunAlerts(runPayload.id);
      }
      refreshRecentRuns();
    } catch (error) {
      console.error("Model run failed", error);
      setModelError(error?.message || "Не удалось выполнить модель");
    } finally {
      setIsModelRunning(false);
    }
  };

  const metricsSnapshot = useMemo(() => {
    const primary = modelResults?.length ? modelResults[0].metrics : null;
    return primary || modelRun?.metrics_summary || null;
  }, [modelResults, modelRun]);
  const residualPreview = useMemo(() => {
    if (!modelResults?.length) {
      return [];
    }
    const residuals = modelResults[0].residuals || [];
    return residuals.slice(0, 6);
  }, [modelResults]);

  const diagnosticsPreview = useMemo(() => {
    if (!modelResults?.length) {
      return [];
    }
    const diagnostics = modelResults[0].diagnostics || {};
    return Object.entries(diagnostics)
      .filter(([, value]) => ["number", "string"].includes(typeof value))
      .slice(0, 5);
  }, [modelResults]);

  useEffect(() => {
    if (modelRun?.id) {
      fetchRunAlerts(modelRun.id);
    }
  }, [modelRun?.id, fetchRunAlerts]);

  return (
    <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-xl">
      <CardHeader className="flex flex-col gap-2">
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Layers className="h-5 w-5 text-indigo-500" />
          Расширенная аналитика преступности
        </CardTitle>
        <p className="text-sm text-slate-600">
          Сопоставляйте фактические инциденты, оперативный план и прогноз, оценивайте вклад профилактических мер и переключайте сегменты — данные на графиках, карте и в корреляциях обновятся синхронно.
        </p>
        {datasets?.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/80 p-3 text-sm text-slate-700 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2 font-medium">
              <Database className="h-4 w-4 text-indigo-500" />
              Набор данных для анализа
            </div>
            <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
              <SelectTrigger className="w-full md:w-72">
                <SelectValue placeholder="Выберите набор данных" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={String(dataset.id)}>
                    {dataset.name || dataset.title || dataset.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {selectedDataset && (
          <div className="rounded-lg border border-slate-200 bg-white/80 p-3 text-sm text-slate-700">
            <TimeWindowSelector
              columns={selectedDataset.columns || []}
              value={timeWindow}
              onChange={setTimeWindow}
              label="Интервал расчёта"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Filter className="h-4 w-4" />
              Кросс-фильтры по типам преступлений и округам
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-700">Инциденты: факт, план и прогноз</CardTitle>
                <div className="flex gap-2 text-xs">
                  {["sarima", "sarimax", "prophet"].map((method) => (
                    <Button
                      key={method}
                      variant={forecastMethod === method ? "default" : "outline"}
                      size="sm"
                      className={forecastMethod === method ? "bg-indigo-600 text-white" : "border-indigo-200 text-indigo-700"}
                      onClick={() => setForecastMethod(method)}
                    >
                      {method.toUpperCase()}
                    </Button>
                  ))}
                </div>
              </div>
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
              <AreaChart data={insights.seasonalityData || DEFAULT_INSIGHTS.seasonalityData}>
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
                    {[{ cohort: "Jan", m1: 100, m2: 82, m3: 73, m4: 68 },
                      { cohort: "Feb", m1: 100, m2: 85, m3: 74, m4: 70 },
                      { cohort: "Mar", m1: 100, m2: 88, m3: 79, m4: 74 },
                      { cohort: "Apr", m1: 100, m2: 84, m3: 72, m4: 69 }].map((row) => (
                      <tr key={row.cohort}>
                        <td className="border border-slate-200 px-2 py-1 font-semibold text-slate-700">{row.cohort}</td>
                        {["m1", "m2", "m3", "m4"].map((key) => (
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
              {(insights.anomalies || DEFAULT_INSIGHTS.anomalies).map((anomaly) => (
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

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border border-slate-200 bg-white/70 shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Диагностика регрессий</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={insights.logisticCurve || DEFAULT_INSIGHTS.logisticCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
                    <XAxis dataKey="score" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} domain={[0, 1]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="probability" stroke="#0ea5e9" strokeWidth={2} name="Логит" />
                  </LineChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-slate-600">Логит/пробит вероятности заданного инцидента.</p>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insights.residualDiagnostics || DEFAULT_INSIGHTS.residualDiagnostics}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="obs" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="residual" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-slate-600">Анализ остатков OLS + тесты на автокорреляцию.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-slate-200 bg-white/70 shadow-sm">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold text-slate-700">Панельные модели и причинность</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={insights.panelEffects || DEFAULT_INSIGHTS.panelEffects}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} />
                    <Tooltip />
                    <Line type="monotone" dataKey="fixed" stroke="#2563eb" strokeWidth={2} name="Fixed" />
                    <Line type="monotone" dataKey="random" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" name="Random" />
                  </LineChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-slate-600">Сравнение фиксированных и случайных эффектов.</p>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={insights.diffInDiffData || DEFAULT_INSIGHTS.diffInDiffData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5f5" />
                    <XAxis dataKey="period" stroke="#475569" fontSize={12} />
                    <YAxis stroke="#475569" fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="treated" fill="#22c55e" name="Районы с вмешательством" />
                    <Bar dataKey="control" fill="#94a3b8" name="Контрольные районы" />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-slate-600">Дифференцированный эффект профилактики.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border border-slate-200 bg-white/70 shadow-sm">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-semibold text-slate-700">
              Запуск аналитической модели
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-slate-600">
                    Запускайте реальные расчёты (OLS, ARIMA, Prophet) по выбранному набору. Параметры автоматически подбираются из структуры данных, результаты сохраняются в серверной БД.
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase text-slate-500">Алгоритм</span>
                  <Select value={selectedAlgorithm} onValueChange={setSelectedAlgorithm}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Алгоритм" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_ALGORITHMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded border border-slate-200 bg-white/80 p-3 space-y-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Колонки модели</p>
                  {requiresRegressionTarget &&
                    renderColumnSelect("Целевая колонка", config.target_column, datasetColumnsList, (value) =>
                      updateConfig({ target_column: value })
                    )}
                  {requiresBinaryTarget &&
                    renderColumnSelect(
                      "Бинарная цель",
                      config.binary_target,
                      binaryCandidates,
                      (value) => updateConfig({ binary_target: value }),
                      binaryCandidates.length ? "Колонка 0/1" : "Нет бинарных колонок"
                    )}
                  {requiresValueColumn &&
                    renderColumnSelect("Колонка значений", config.value_column, numericCandidates, (value) =>
                      updateConfig({ value_column: value })
                    )}
                  {requiresDateColumn &&
                    renderColumnSelect("Колонка даты/периода", config.date_column, datasetColumnsList, (value) =>
                      updateConfig({ date_column: value })
                    )}
                  {requiresPanelFields && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {renderColumnSelect(
                        "Сущности (entity)",
                        config.panel_entity,
                        categoryCandidates.length ? categoryCandidates : datasetColumnsList,
                        (value) => updateConfig({ panel_entity: value })
                      )}
                      {renderColumnSelect(
                        "Колонка времени панели",
                        config.panel_time_column,
                        datasetColumnsList,
                        (value) => updateConfig({ panel_time_column: value })
                      )}
                    </div>
                  )}
                  {requiresInstruments && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Инструменты</Label>
                      <ScrollArea className="max-h-32 rounded border border-slate-200 p-2">
                        <div className="flex flex-wrap gap-2">
                          {numericCandidates.length ? (
                            numericCandidates.map((column) => {
                              const isSelected = (config.instrument_columns || []).includes(column);
                              return (
                                <Button
                                  key={column}
                                  size="sm"
                                  variant={isSelected ? "default" : "outline"}
                                  className={isSelected ? "bg-indigo-600 text-white" : "border-slate-200"}
                                  onClick={() => toggleValueInConfig("instrument_columns", column)}
                                >
                                  {column}
                                </Button>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-500">Нет числовых колонок</span>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                  {["ols", "ridge", "lasso", "iv", "gmm", "logit", "probit", "fixed_effects", "random_effects"].some(
                    (item) => item === selectedAlgorithm
                  ) && (
                    <div className="space-y-1">
                      <Label className="text-xs text-slate-500">Признаки</Label>
                      <ScrollArea className="max-h-32 rounded border border-slate-200 p-2">
                        <div className="flex flex-wrap gap-2">
                          {numericCandidates.length ? (
                            numericCandidates.map((column) => {
                              const isSelected = (config.feature_columns || []).includes(column);
                              return (
                                <Button
                                  key={column}
                                  size="sm"
                                  variant={isSelected ? "default" : "outline"}
                                  className={isSelected ? "bg-indigo-600 text-white" : "border-slate-200"}
                                  onClick={() => toggleValueInConfig("feature_columns", column)}
                                >
                                  {column}
                                </Button>
                              );
                            })
                          ) : (
                            <span className="text-xs text-slate-500">Нет числовых колонок</span>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                  {requiresTreatmentColumn &&
                    renderColumnSelect(
                      "Колонка вмешательства",
                      config.treatment_column,
                      binaryCandidates.length ? binaryCandidates : datasetColumnsList,
                      (value) => updateConfig({ treatment_column: value })
                    )}
                  {requiresCauseColumn &&
                    renderColumnSelect(
                      "Колонка причины (Granger)",
                      config.cause_column,
                      numericCandidates,
                      (value) => updateConfig({ cause_column: value })
                    )}
                  {requiresCointegration && (
                    <div className="grid gap-3 md:grid-cols-2">
                      {renderColumnSelect(
                        "Серия X",
                        (config.cointegration_columns || [])[0],
                        numericCandidates,
                        (value) => {
                          const next = [...(config.cointegration_columns || [])];
                          next[0] = value;
                          updateConfig({ cointegration_columns: next });
                        }
                      )}
                      {renderColumnSelect(
                        "Серия Y",
                        (config.cointegration_columns || [])[1],
                        numericCandidates,
                        (value) => {
                          const next = [...(config.cointegration_columns || [])];
                          next[1] = value;
                          updateConfig({ cointegration_columns: next });
                        }
                      )}
                    </div>
                  )}
                </div>
                {modelError && (
                  <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700">{modelError}</div>
                )}
                <div className="flex items-center gap-2">
                  <Button onClick={handleRunModel} disabled={isModelRunning} className="bg-indigo-600 text-white">
                    {isModelRunning ? "Расчёт..." : "Запустить модель"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={refreshRecentRuns} disabled={isLoadingRuns}>
                    Обновить историю
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  Используются колонки: целевая {config.target_column || config.value_column || "?"} и признаки{" "}
                  {config.feature_columns?.length ? config.feature_columns.join(", ") : "-"}.
                  {config.thresholds && (
                    <span className="block">
                      Пороги:{" "}
                      {Object.entries(config.thresholds)
                        .map(([key, value]) => `${key.toUpperCase()} ≤ ${value}`)
                        .join(", ")}
                    </span>
                  )}
                </p>
              </div>
              <div className="space-y-3">
                <div className="rounded border border-slate-200 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-600">Последний запуск</span>
                    {modelRun && <span className="text-slate-500">{modelRun.status}</span>}
                  </div>
                  {modelRun ? (
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      <div>ID: {modelRun.id}</div>
                      <div>Модель: {modelRun.algorithm}</div>
                      <div>
                        Длительность:{" "}
                        {modelRun.duration_ms ? `${(modelRun.duration_ms / 1000).toFixed(2)} c` : "—"}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Запусков пока не было.</p>
                  )}
                </div>
                <div className="rounded border border-slate-200 p-3">
                  <div className="text-xs font-semibold text-slate-600">Метрики</div>
                  {metricsSnapshot ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(metricsSnapshot).map(([key, value]) => (
                        <div key={key} className="rounded bg-slate-50 px-2 py-1 text-slate-700">
                          <div className="text-[10px] uppercase text-slate-500">{key}</div>
                          <div>{typeof value === "number" ? value.toFixed(3) : value}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-500">Нет рассчитанных метрик.</p>
                  )}
                </div>
                {modelResults?.length > 0 && (
                  <div className="rounded border border-slate-200 p-3 text-xs text-slate-600">
                    <div className="font-semibold text-slate-600">Остатки</div>
                    <p className="mt-1 text-slate-500">
                      {residualPreview.length
                        ? residualPreview.map((value, idx) => (
                            <span key={idx} className="mr-2">
                              {typeof value === "number" ? value.toFixed(2) : value}
                            </span>
                          ))
                        : "—"}
                    </p>
                  </div>
                )}
                {diagnosticsPreview.length > 0 && (
                  <div className="rounded border border-slate-200 p-3 text-xs text-slate-600">
                    <div className="font-semibold text-slate-600">Диагностика</div>
                    <dl className="mt-1 space-y-1">
                      {diagnosticsPreview.map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <dt className="text-[11px] uppercase text-slate-500">{key}</dt>
                          <dd className="text-right text-slate-700">
                            {typeof value === "number" ? value.toFixed(3) : String(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <div className="rounded border border-slate-200 p-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2 font-semibold text-slate-600">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Алерты
                  </div>
                  {modelAlerts.length ? (
                    <ul className="mt-2 space-y-1">
                      {modelAlerts.map((alert) => (
                        <li key={alert.id} className="rounded bg-amber-50/60 px-2 py-1 text-amber-800">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] uppercase">{alert.alert_type}</span>
                            <span className="text-[11px]">{alert.severity}</span>
                          </div>
                          <div>{alert.message}</div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-slate-500">Нет активных алертов.</p>
                  )}
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-sm font-semibold text-slate-600">
                <span>Последние расчёты</span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-3 py-1 text-left">ID</th>
                      <th className="px-3 py-1 text-left">Алгоритм</th>
                      <th className="px-3 py-1 text-left">Статус</th>
                      <th className="px-3 py-1 text-left">Метрика</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRuns.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-center text-slate-500">
                          {isLoadingRuns ? "Загрузка..." : "Пока нет запусков"}
                        </td>
                      </tr>
                    )}
                    {recentRuns.map((run) => (
                      <tr key={run.id} className="border-t border-slate-100">
                        <td className="px-3 py-1 font-mono text-[11px]">{run.id.slice(0, 8)}…</td>
                        <td className="px-3 py-1">{run.algorithm}</td>
                        <td className="px-3 py-1">
                          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] uppercase text-slate-600">
                            {run.status}
                          </span>
                        </td>
                        <td className="px-3 py-1">
                          {Object.entries(run.metrics_summary || {})
                            .slice(0, 1)
                            .map(([key, value]) => (
                              <span key={key}>
                                {key}:{" "}
                                {typeof value === "number" ? value.toFixed(3) : value}
                              </span>
                            )) || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          {Object.entries(MODEL_DESCRIPTIONS).map(([category, items]) => (
            <Card key={category} className="border border-slate-200 bg-white/70 shadow-sm">
              <CardHeader className="py-3">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  {category === "regression" && "Регрессии и IV"}
                  {category === "timeseries" && "Прогнозы временных рядов"}
                  {category === "causal" && "Панельная причинность"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                    <div className="text-xs font-semibold text-slate-800">{item.title}</div>
                    <div className="text-xs text-slate-600">{item.detail}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
