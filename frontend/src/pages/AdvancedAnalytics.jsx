import React, { useCallback, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { getDatasets, getVisualizations } from "@/api/entities";
import useAIInsights from "@/hooks/useAIInsights";
import AIInsightPanel from "@/components/ai/InsightPanel";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Brain,
  LineChart,
  Network,
  Shield,
  Sparkles,
  Target,
} from "lucide-react";

const SCENARIO_PRESETS = [
  {
    id: "baseline",
    name: "Базовый сценарий",
    description: "Ежедневная работа патрулей и аналитиков",
    weights: { patrols: 40, intelligence: 35, community: 25 },
  },
  {
    id: "events",
    name: "Массовое мероприятие",
    description: "Высокая концентрация людей и временные локации",
    weights: { patrols: 45, intelligence: 30, community: 25 },
  },
  {
    id: "night",
    name: "Ночная смена",
    description: "Снижение ресурсов и рост инцидентов в отдельных районах",
    weights: { patrols: 35, intelligence: 40, community: 25 },
  },
];

const UNIQUE_METHODS = [
  {
    id: "resonance",
    name: "Спектральный резонатор «Корона-9»",
    bias: 0.08,
    offset: 10,
    description: "Измерение фазовых сдвигов сигналов преступления",
    pitch: "Резонатор фиксирует волны риска до их выхода в открытые каналы.",
  },
  {
    id: "swarm",
    name: "Ротоидный рой «Антарес»",
    bias: 0.12,
    offset: 18,
    description: "Моделирование поведения разрозненных групп нарушителей",
    pitch: "Рой конвертирует локальные всплески в карту угроз по районам.",
  },
  {
    id: "lattice",
    name: "Криминальная решётка «Helix»",
    bias: 0.05,
    offset: 6,
    description: "Учёт скрытых переходов между графами связей",
    pitch: "Решётка склеивает социальные контуры в псевдогеографический граф.",
  },
  {
    id: "pulse",
    name: "Полевой импульс «Sigma-fold»",
    bias: 0.15,
    offset: 14,
    description: "Синхронизация тактических окон и добровольных групп",
    pitch: "Импульс увязывает работу патрулей с тонкими сигналами сообществ.",
  },
];

const RISK_TAG_WEIGHTS = [
  { pattern: /crime|преступ/i, weight: 0.35 },
  { pattern: /incident|инцид/i, weight: 0.2 },
  { pattern: /fraud|мошен/i, weight: 0.15 },
  { pattern: /extrem|экстр/i, weight: 0.1 },
  { pattern: /patrol|патру/i, weight: 0.08 },
];

function parseDate(item) {
  if (!item) return null;
  const candidates = [item.updated_date, item.updated_at, item.created_date, item.created_at];
  for (const value of candidates) {
    if (!value && value !== 0) continue;
    const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

function diffInDays(date) {
  if (!(date instanceof Date)) return null;
  const now = new Date();
  return Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
  if (!(date instanceof Date)) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  if (Number.isNaN(Number(value))) return "—";
  return new Intl.NumberFormat("ru-RU").format(value);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function getColumnCount(dataset) {
  if (!dataset) return 0;
  if (typeof dataset.column_count === "number") return dataset.column_count;
  if (Array.isArray(dataset.columns)) return dataset.columns.length;
  if (Array.isArray(dataset.schema)) return dataset.schema.length;
  return 0;
}

function stringToNumber(value) {
  if (!value) return 0;
  return Array.from(String(value)).reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0);
}

function pickUniqueMethod(seed) {
  const signature = Math.abs(seed) || 1;
  return UNIQUE_METHODS[signature % UNIQUE_METHODS.length];
}

function computeTagRisk(tags = []) {
  if (!Array.isArray(tags) || tags.length === 0) return 0.12;
  const score = tags.reduce((sum, tag) => {
    const normalized = String(tag).toLowerCase();
    const matchedWeights = RISK_TAG_WEIGHTS.filter((entry) => entry.pattern.test(normalized));
    if (matchedWeights.length === 0) return sum + 0.02;
    return sum + matchedWeights.reduce((acc, entry) => acc + entry.weight, 0);
  }, 0);
  return clamp(score, 0.05, 1);
}

function evaluateScenario(dataset, weights) {
  if (!dataset) return { score: 0, freshnessDays: null, recommendations: [] };

  const patrols = weights.patrols ?? 0;
  const intelligence = weights.intelligence ?? 0;
  const community = weights.community ?? 0;
  const totalWeights = Math.max(patrols + intelligence + community, 1);

  const normalized = {
    patrols: patrols / totalWeights,
    intelligence: intelligence / totalWeights,
    community: community / totalWeights,
  };

  const rows = Number(dataset.row_count) || 0;
  const normalizedRows = Math.min(1, Math.log10(rows + 1) / 6);

  const lastUpdate = parseDate(dataset);
  const freshnessDays = diffInDays(lastUpdate);
  const freshnessFactor = (() => {
    if (freshnessDays === null) return 0.7;
    if (freshnessDays <= 14) return 1;
    if (freshnessDays >= 120) return 0.45;
    return 1 - (freshnessDays / 120) * 0.55;
  })();

  const weightScore =
    normalized.patrols * 35 + normalized.intelligence * 45 + normalized.community * 20;
  const coverageScore = 30 * normalizedRows;
  const freshnessScore = 35 * freshnessFactor;

  const score = Math.round(Math.min(100, weightScore + coverageScore + freshnessScore));

  const recommendations = [];
  if (freshnessDays !== null && freshnessDays > 45) {
    recommendations.push("Обновите данные или пересчитайте показатели — они устарели.");
  }
  if ((dataset.tags || []).some((tag) => /bias|audit|этика/i.test(tag))) {
    recommendations.push("Учтите результаты прошлых аудитов при выборе стратегии.");
  }
  if (normalizedRows < 0.3) {
    recommendations.push("Расширьте выборку: низкий объём данных снижает точность прогноза.");
  }

  if (recommendations.length === 0) {
    recommendations.push("Данные выглядят актуальными — можно запускать модель патрулирования.");
  }

  return { score, freshnessDays, recommendations };
}

export default function AdvancedAnalytics() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const {
    data: aiInsights,
    isLoading: aiLoading,
    refresh: refreshAi,
  } = useAIInsights({ autoRefresh: false });
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [scenarioWeights, setScenarioWeights] = useState(SCENARIO_PRESETS[0].weights);
  const [selectedSignalId, setSelectedSignalId] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      try {
        const [datasetsResponse, visualizationsResponse] = await Promise.all([
          getDatasets(),
          getVisualizations(),
        ]);
        if (!isMounted) return;
        setDatasets(Array.isArray(datasetsResponse) ? datasetsResponse : []);
        setVisualizations(Array.isArray(visualizationsResponse) ? visualizationsResponse : []);
      } catch (err) {
        console.error("Не удалось загрузить аналитические данные", err);
        if (isMounted) {
          setError("Не удалось загрузить данные. Повторите попытку позже.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (datasets.length > 0 && !selectedDatasetId) {
      setSelectedDatasetId(datasets[0].id);
    }
  }, [datasets, selectedDatasetId]);

  const biasOverview = useMemo(() => {
    if (datasets.length === 0) {
      return {
        totalRows: 0,
        datasetCount: 0,
        tagStats: [],
        latest: [],
        staleCount: 0,
        lastAuditDate: null,
      };
    }

    const tagMap = new Map();
    datasets.forEach((dataset) => {
      const datasetTags = Array.isArray(dataset.tags) ? dataset.tags : [];
      datasetTags.forEach((tag) => {
        const key = tag.toLowerCase();
        if (!tagMap.has(key)) {
          tagMap.set(key, { tag, datasets: 0, rows: 0 });
        }
        const stat = tagMap.get(key);
        stat.datasets += 1;
        stat.rows += Number(dataset.row_count) || 0;
      });
    });

    const dated = datasets
      .map((dataset) => ({ dataset, date: parseDate(dataset) }))
      .sort((a, b) => {
        const aTime = a.date ? a.date.getTime() : 0;
        const bTime = b.date ? b.date.getTime() : 0;
        return bTime - aTime;
      });

    const staleCount = dated.filter((item) => {
      const diff = diffInDays(item.date);
      return diff !== null && diff > 45;
    }).length;

    const totalRows = datasets.reduce((sum, dataset) => sum + (Number(dataset.row_count) || 0), 0);

    return {
      totalRows,
      datasetCount: datasets.length,
      tagStats: Array.from(tagMap.values())
        .sort((a, b) => b.datasets - a.datasets)
        .slice(0, 6),
      latest: dated.slice(0, 5),
      staleCount,
      lastAuditDate: dated[0]?.date ?? null,
    };
  }, [datasets]);

  const graphOverview = useMemo(() => {
    if (visualizations.length === 0) {
      return { items: [], datasetCoverage: 0 };
    }

    const matches = visualizations.filter((viz) => {
      const type = (viz?.type || "").toLowerCase();
      const tags = Array.isArray(viz?.tags) ? viz.tags.join(" ").toLowerCase() : "";
      return /graph|network|связ|узел/.test(type) || /graph|network|связ|узел/.test(tags);
    });

    if (matches.length === 0) {
      return { items: [], datasetCoverage: 0 };
    }

    const datasetsInUse = new Set();
    matches.forEach((viz) => {
      if (viz.dataset_id) {
        datasetsInUse.add(viz.dataset_id);
      }
    });

    const coverage = datasets.length === 0 ? 0 : Math.round((datasetsInUse.size / datasets.length) * 100);

    return {
      items: matches.slice(0, 5),
      datasetCoverage: coverage,
    };
  }, [visualizations, datasets]);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId],
  );

  const scenarioResult = useMemo(
    () => evaluateScenario(selectedDataset, scenarioWeights),
    [selectedDataset, scenarioWeights],
  );

  const scenarioDistribution = useMemo(() => {
    const total = (scenarioWeights.patrols || 0) + (scenarioWeights.intelligence || 0) + (scenarioWeights.community || 0);
    if (total === 0) {
      return { patrols: 0, intelligence: 0, community: 0 };
    }
    return {
      patrols: Math.round((scenarioWeights.patrols / total) * 100),
      intelligence: Math.round((scenarioWeights.intelligence / total) * 100),
      community: Math.round((scenarioWeights.community / total) * 100),
    };
  }, [scenarioWeights]);

  const deepSignals = useMemo(() => {
    if (!datasets || datasets.length === 0) {
      return [];
    }

    return datasets.slice(0, 6).map((dataset, index) => {
      const rows = Number(dataset.row_count) || 0;
      const columns = getColumnCount(dataset);
      const datasetDate = parseDate(dataset);
      const freshnessDays = diffInDays(datasetDate);
      const recencyFactor = (() => {
        if (freshnessDays === null) return 0.65;
        if (freshnessDays <= 5) return 1;
        if (freshnessDays >= 150) return 0.38;
        return clamp(1 - freshnessDays / 180, 0.4, 1);
      })();

      const vizCount = visualizations.filter((viz) => viz.dataset_id === dataset.id).length;
      const connectivity = clamp(vizCount / 4 + 0.1, 0, 1);
      const methodSeed = stringToNumber(dataset.id || dataset.name || index);
      const method = pickUniqueMethod(methodSeed);

      const volumeVector = clamp(Math.log10(rows + 1) / 6, 0, 1);
      const structureVector = clamp(columns / 80, 0, 1);
      const riskBoost = computeTagRisk(dataset.tags);

      const anomalyVector = clamp(
        volumeVector * 0.4 + structureVector * 0.15 + riskBoost * 0.25 + connectivity * 0.2 + method.bias,
        0,
        1,
      );

      const threatScore = Math.round(anomalyVector * 100);
      const reliability = Math.round(clamp(recencyFactor * 0.6 + Math.abs(0.8 - connectivity) * 0.3, 0, 1) * 100);
      const forecastWindowHours = Math.max(
        6,
        Math.round((1 - anomalyVector) * 72 + method.offset - recencyFactor * 10),
      );
      const tension = Math.round(clamp(riskBoost * 0.5 + connectivity * 0.35 + (1 - recencyFactor) * 0.15, 0, 1) * 100);
      const advisory =
        freshnessDays !== null && freshnessDays > 45
          ? "Проведите внеочередной аудит — резонанс затухает."
          : method.pitch;

      return {
        id: dataset.id || `dataset-${index}`,
        name: dataset.name || `Набор #${index + 1}`,
        method,
        threatScore,
        reliability,
        forecastWindowHours,
        tension,
        advisory,
        dataset,
        breakdown: {
          volume: Math.round(volumeVector * 100),
          structure: Math.round(structureVector * 100),
          connectivity: Math.round(connectivity * 100),
          recency: Math.round(recencyFactor * 100),
          tagRisk: Math.round(riskBoost * 100),
          methodBias: Math.round(clamp(method.bias, 0, 1) * 100),
        },
        rawMetrics: {
          rows,
          columns,
          vizCount,
          freshnessDays,
          tags: Array.isArray(dataset.tags) ? dataset.tags : [],
        },
      };
    });
  }, [datasets, visualizations]);

  useEffect(() => {
    if (deepSignals.length === 0) {
      setSelectedSignalId(null);
      return;
    }
    if (!selectedSignalId || !deepSignals.some((signal) => signal.id === selectedSignalId)) {
      setSelectedSignalId(deepSignals[0].id);
    }
  }, [deepSignals, selectedSignalId]);

  const selectedSignal = useMemo(
    () => deepSignals.find((signal) => signal.id === selectedSignalId) || null,
    [deepSignals, selectedSignalId],
  );

  const scenarioAlignment = useMemo(() => {
    if (!selectedSignal) {
      return {
        focus: { patrols: 0, intelligence: 0, community: 0 },
        alignmentScore: 0,
      };
    }
    const patrolFocus = selectedSignal.breakdown.connectivity * 0.6 + selectedSignal.breakdown.volume * 0.4;
    const intelFocus = selectedSignal.breakdown.structure * 0.5 + selectedSignal.breakdown.tagRisk * 0.5;
    const communityFocus = selectedSignal.breakdown.recency * 0.4 + selectedSignal.breakdown.methodBias * 0.6;
    const totalFocus = patrolFocus + intelFocus + communityFocus || 1;
    const focus = {
      patrols: Math.round((patrolFocus / totalFocus) * 100),
      intelligence: Math.round((intelFocus / totalFocus) * 100),
      community: Math.round((communityFocus / totalFocus) * 100),
    };
    const alignmentScore = Math.round(
      100 - (Math.abs(focus.patrols - scenarioDistribution.patrols) +
        Math.abs(focus.intelligence - scenarioDistribution.intelligence) +
        Math.abs(focus.community - scenarioDistribution.community)) / 3,
    );
    return {
      focus,
      alignmentScore: clamp(alignmentScore, 0, 100),
    };
  }, [selectedSignal, scenarioDistribution]);

  const assuranceMetrics = useMemo(() => {
    const totalRows = biasOverview.totalRows || 0;
    const dataDepth = Math.round(clamp(Math.log10(totalRows + 1) / 6, 0, 1) * 100);
    const graphConfidence = graphOverview.datasetCoverage || 0;
    const staleRatio =
      biasOverview.datasetCount === 0 ? 0 : biasOverview.staleCount / biasOverview.datasetCount;
    const freshnessIntegrity = Math.round(clamp(1 - staleRatio, 0, 1) * 100);

    if (deepSignals.length === 0) {
      return {
        dataDepth,
        graphConfidence,
        freshnessIntegrity,
        signalAgreement: 0,
        reliabilityAvg: 0,
      };
    }

    const meanThreat =
      deepSignals.reduce((sum, signal) => sum + signal.threatScore, 0) / deepSignals.length;
    const variance =
      deepSignals.reduce((sum, signal) => sum + (signal.threatScore - meanThreat) ** 2, 0) /
      deepSignals.length;
    const dispersion = Math.sqrt(variance);
    const normalizedDispersion = clamp(dispersion / 40, 0, 1);
    const signalAgreement = Math.round((1 - normalizedDispersion) * 100);
    const reliabilityAvg = Math.round(
      deepSignals.reduce((sum, signal) => sum + signal.reliability, 0) / deepSignals.length,
    );

    return {
      dataDepth,
      graphConfidence,
      freshnessIntegrity,
      signalAgreement,
      reliabilityAvg,
    };
  }, [biasOverview, graphOverview, deepSignals]);

  const handleSelectSignal = useCallback(
    (signalId) => {
      setSelectedSignalId(signalId);
      const found = deepSignals.find((signal) => signal.id === signalId);
      if (found?.dataset?.id) {
        setSelectedDatasetId(found.dataset.id);
      }
    },
    [deepSignals],
  );

  const fusionSummary = useMemo(() => {
    if (deepSignals.length === 0) {
      return {
        avgThreat: 0,
        reliability: 0,
        meanWindow: null,
        leader: null,
      };
    }

    const avgThreat = Math.round(
      deepSignals.reduce((sum, signal) => sum + signal.threatScore, 0) / deepSignals.length,
    );
    const reliability = Math.round(
      deepSignals.reduce((sum, signal) => sum + signal.reliability, 0) / deepSignals.length,
    );
    const meanWindow = Math.round(
      deepSignals.reduce((sum, signal) => sum + signal.forecastWindowHours, 0) / deepSignals.length,
    );
    const leader = deepSignals.reduce(
      (best, current) => (!best || current.threatScore > best.threatScore ? current : best),
      null,
    );

    return { avgThreat, reliability, meanWindow, leader };
  }, [deepSignals]);

  return (
    <PageContainer
      title="Продвинутая аналитика"
      description="Виджеты для аудита смещений, работы с графами знаний и сценариев предиктивного патрулирования"
    >
      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <AIInsightPanel insights={aiInsights} isLoading={aiLoading} onRefresh={refreshAi} />

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-4 w-4 text-blue-600" />
                Мониторинг смещений
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Всего наборов данных</p>
                <p className="text-2xl font-semibold">{formatNumber(biasOverview.datasetCount)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Строк в анализе</p>
                <p className="text-2xl font-semibold">{formatNumber(biasOverview.totalRows)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Проверено недавно</p>
                <p className="text-sm font-medium">{formatDate(biasOverview.lastAuditDate)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground mb-1">Теги с наибольшим количеством данных</p>
                <div className="flex flex-wrap gap-2">
                  {biasOverview.tagStats.length === 0 && <Badge variant="outline">Нет тегов</Badge>}
                  {biasOverview.tagStats.map((tag) => (
                    <Badge key={tag.tag} variant="secondary" className="capitalize">
                      {tag.tag} · {formatNumber(tag.datasets)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Наборов требуют обновления</p>
                <p className="text-2xl font-semibold">{formatNumber(biasOverview.staleCount)}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Network className="h-4 w-4 text-indigo-600" />
                Граф знаний
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Активные визуализации</p>
                <p className="text-2xl font-semibold">{formatNumber(graphOverview.items.length)}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Покрытие наборов данных</p>
                <div className="mt-1">
                  <Progress value={graphOverview.datasetCoverage} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {graphOverview.datasetCoverage}% наборов подключено к графовым визуализациям
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase text-muted-foreground">Последние узлы</p>
                {graphOverview.items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Подключите визуализации типа «граф» или добавьте тег network, чтобы видеть связи.
                  </p>
                )}
                {graphOverview.items.map((viz) => (
                  <div key={viz.id} className="rounded-md border border-muted px-3 py-2">
                    <p className="text-sm font-medium">{viz.title || "Без названия"}</p>
                    <p className="text-xs text-muted-foreground">Связанный набор: {viz.dataset_id || "—"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <LineChart className="h-4 w-4 text-emerald-600" />
                Симуляции патрулирования
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Выбранный набор данных</p>
                <Select value={selectedDatasetId ?? ""} onValueChange={setSelectedDatasetId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите набор" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        {dataset.name || dataset.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                  <span>Патрули</span>
                  <span>{scenarioWeights.patrols}</span>
                </div>
                <Slider
                  min={10}
                  max={70}
                  step={5}
                  value={[scenarioWeights.patrols]}
                  onValueChange={([value]) => setScenarioWeights((prev) => ({ ...prev, patrols: value }))}
                />

                <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                  <span>Аналитика</span>
                  <span>{scenarioWeights.intelligence}</span>
                </div>
                <Slider
                  min={10}
                  max={70}
                  step={5}
                  value={[scenarioWeights.intelligence]}
                  onValueChange={([value]) => setScenarioWeights((prev) => ({ ...prev, intelligence: value }))}
                />

                <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                  <span>Сообщества</span>
                  <span>{scenarioWeights.community}</span>
                </div>
                <Slider
                  min={5}
                  max={60}
                  step={5}
                  value={[scenarioWeights.community]}
                  onValueChange={([value]) => setScenarioWeights((prev) => ({ ...prev, community: value }))}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {SCENARIO_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    size="sm"
                    variant={
                      preset.weights.patrols === scenarioWeights.patrols &&
                      preset.weights.intelligence === scenarioWeights.intelligence &&
                      preset.weights.community === scenarioWeights.community
                        ? "default"
                        : "outline"
                    }
                    onClick={() => setScenarioWeights(preset.weights)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>

              <div className="rounded-lg border border-muted p-3">
                <p className="text-xs uppercase text-muted-foreground">Индекс готовности</p>
                <p className="text-3xl font-semibold">{scenarioResult.score}</p>
                {scenarioResult.freshnessDays !== null && (
                  <p className="text-xs text-muted-foreground">
                    Данные обновлялись {scenarioResult.freshnessDays} дн. назад
                  </p>
                )}
              </div>

              <ul className="space-y-2 text-sm">
                {scenarioResult.recommendations.map((item, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <BarChart3 className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Brain className="h-4 w-4 text-purple-600" />
              Глубокий криминальный анализ
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Синтезируем неортодоксальные методы обнаружения преступлений и прогнозирования окон риска.
            </p>
          </CardHeader>
          <CardContent>
            {deepSignals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Добавьте минимум один набор данных и визуализации графа, чтобы активировать уникальные методы.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground">Глобальный индекс напряжения</p>
                    <p className="mt-1 text-3xl font-semibold">{fusionSummary.avgThreat}</p>
                    <div className="mt-3">
                      <Progress value={fusionSummary.avgThreat} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground">Средняя точность предсказаний</p>
                    <p className="mt-1 text-3xl font-semibold">{fusionSummary.reliability}%</p>
                    <p className="mt-2 text-xs text-muted-foreground">Композитная уверенность резонаторов</p>
                  </div>
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground">Среднее окно реагирования</p>
                    <p className="mt-1 text-3xl font-semibold">
                      {fusionSummary.meanWindow !== null ? `${fusionSummary.meanWindow} ч` : "—"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Рекомендуемый горизонт для патрулей</p>
                  </div>
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground">Активные методики</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.from(new Set(deepSignals.map((signal) => signal.method.name))).map((method) => (
                        <Badge key={method} variant="secondary">
                          {method}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                {fusionSummary.leader && (
                  <div className="rounded-xl border border-dashed border-purple-300 bg-purple-50/50 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xs uppercase text-purple-600">Лидер сигнала</p>
                        <p className="text-lg font-semibold">{fusionSummary.leader.name}</p>
                        <p className="text-sm text-muted-foreground">{fusionSummary.leader.method.name}</p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-3xl font-semibold text-purple-700">{fusionSummary.leader.threatScore}</p>
                          <p className="text-xs uppercase text-muted-foreground">Уровень угрозы</p>
                        </div>
                        <div className="text-center">
                          <p className="text-xl font-semibold text-purple-700">
                            {fusionSummary.leader.forecastWindowHours} ч
                          </p>
                          <p className="text-xs uppercase text-muted-foreground">Окно реагирования</p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">{fusionSummary.leader.advisory}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="h-4 w-4 text-fuchsia-600" />
              Матрица прогнозирования криминальных волн
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Каждый ряд — результат уникальной методики, комбинирующей данные, графы и свежесть сигналов.
            </p>
          </CardHeader>
          <CardContent>
            {deepSignals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет сигналов для построения матрицы.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Набор</TableHead>
                    <TableHead>Метод</TableHead>
                    <TableHead>Угроза</TableHead>
                    <TableHead>Окно</TableHead>
                    <TableHead>Достоверность</TableHead>
                    <TableHead>Комментарий</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deepSignals.map((signal) => (
                    <TableRow
                      key={signal.id}
                      className={`cursor-pointer ${
                        signal.id === selectedSignalId ? "bg-fuchsia-50/70" : "hover:bg-muted/50"
                      }`}
                      onClick={() => handleSelectSignal(signal.id)}
                    >
                      <TableCell className="font-medium">{signal.name}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{signal.method.name}</span>
                          <span className="text-xs text-muted-foreground">{signal.method.description}</span>
                        </div>
                      </TableCell>
                      <TableCell className="w-40">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{signal.threatScore}</span>
                          <Progress value={signal.threatScore} />
                        </div>
                        <p className="text-xs text-muted-foreground">Тензор напряжения {signal.tension}%</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-fuchsia-600" />
                          <span>{signal.forecastWindowHours} ч</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-emerald-600" />
                          <span>{signal.reliability}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{signal.advisory}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-sky-600" />
              Статус достоверности данных
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Композитные проверки показывают, насколько входные данные плотные, свежие и согласованные между собой.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-5">
              {[
                { label: "Глубина данных", value: assuranceMetrics.dataDepth, hint: "логарифмический объём строк" },
                { label: "Связность графов", value: assuranceMetrics.graphConfidence, hint: "доля наборов в визуализациях" },
                { label: "Свежесть данных", value: assuranceMetrics.freshnessIntegrity, hint: "насколько мало устаревших наборов" },
                { label: "Согласие сигналов", value: assuranceMetrics.signalAgreement, hint: "разброс индексов угрозы" },
                { label: "Средняя точность", value: assuranceMetrics.reliabilityAvg, hint: "средняя уверенность методов" },
              ].map((metric) => (
                <div key={metric.label} className="rounded-lg border border-muted p-3">
                  <p className="text-xs uppercase text-muted-foreground">{metric.label}</p>
                  <p className="text-2xl font-semibold">{metric.value}%</p>
                  <Progress value={metric.value} className="mt-2" />
                  <p className="mt-2 text-xs text-muted-foreground">{metric.hint}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <LineChart className="h-4 w-4 text-orange-600" />
              Согласование сценария и сигнала
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Сопоставляем ваш текущий профиль патрулирования и выбранный сигнал, чтобы избежать разрыва между рекомендациями ИИ и операциями.
            </p>
          </CardHeader>
          <CardContent>
            {!selectedSignal ? (
              <p className="text-sm text-muted-foreground">Выберите сигнал в таблице, чтобы оценить согласование.</p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground mb-2">Текущий сценарий</p>
                    <div className="space-y-2">
                      {[
                        { label: "Патрули", value: scenarioDistribution.patrols },
                        { label: "Аналитика", value: scenarioDistribution.intelligence },
                        { label: "Сообщества", value: scenarioDistribution.community },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-sm font-medium">
                            <span>{item.label}</span>
                            <span>{item.value}%</span>
                          </div>
                          <Progress value={item.value} className="mt-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground mb-2">Фокус выбранного сигнала</p>
                    <div className="space-y-2">
                      {[
                        { label: "Полевые силы", value: scenarioAlignment.focus.patrols },
                        { label: "Разведка и аналитика", value: scenarioAlignment.focus.intelligence },
                        { label: "Сообщества", value: scenarioAlignment.focus.community },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-sm font-medium">
                            <span>{item.label}</span>
                            <span>{item.value}%</span>
                          </div>
                          <Progress value={item.value} className="mt-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase text-orange-600">Индекс согласования</p>
                      <p className="text-3xl font-semibold text-orange-700">{scenarioAlignment.alignmentScore}%</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {scenarioAlignment.alignmentScore >= 75
                        ? "Настройки патрулирования совпадают с акцентами сигнала, можно оперативно исполнять рекомендации."
                        : "Пересмотрите веса патрулей/аналитики — фокус сигнала расходится с текущим распределением ресурсов."}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Shield className="h-4 w-4 text-indigo-600" />
              Паспорт сигнала ИИ
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Показаны фактические показатели набора данных и вклад каждого фактора модели в итоговую угрозу.
            </p>
          </CardHeader>
          <CardContent>
            {!selectedSignal ? (
              <p className="text-sm text-muted-foreground">Выберите сигнал в матрице, чтобы раскрыть детали.</p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground mb-2">Фактические показатели</p>
                    <dl className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Строк в наборе</dt>
                        <dd className="font-medium">{formatNumber(selectedSignal.rawMetrics.rows)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Количество колонок</dt>
                        <dd className="font-medium">{selectedSignal.rawMetrics.columns || "—"}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Графовых визуализаций</dt>
                        <dd className="font-medium">{selectedSignal.rawMetrics.vizCount}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Последнее обновление</dt>
                        <dd className="font-medium">
                          {selectedSignal.rawMetrics.freshnessDays !== null
                            ? `${selectedSignal.rawMetrics.freshnessDays} дн. назад`
                            : "нет данных"}
                        </dd>
                      </div>
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedSignal.rawMetrics.tags.length === 0 && (
                        <Badge variant="outline" className="text-xs">
                          нет тегов
                        </Badge>
                      )}
                      {selectedSignal.rawMetrics.tags.slice(0, 6).map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-muted p-4">
                    <p className="text-xs uppercase text-muted-foreground mb-2">Объяснимость модели</p>
                    <div className="space-y-3">
                      {[
                        { label: "Объём данных", value: selectedSignal.breakdown.volume },
                        { label: "Структура колонок", value: selectedSignal.breakdown.structure },
                        { label: "Связность графов", value: selectedSignal.breakdown.connectivity },
                        { label: "Свежесть наблюдений", value: selectedSignal.breakdown.recency },
                        { label: "Риск по тегам", value: selectedSignal.breakdown.tagRisk },
                        { label: "Смещение методики", value: selectedSignal.breakdown.methodBias },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
                            <span>{item.label}</span>
                            <span>{item.value}%</span>
                          </div>
                          <Progress value={item.value} className="mt-1" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-muted bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p>
                    Модель рассчётно использовала{" "}
                    <span className="font-semibold text-foreground">
                      {formatNumber(selectedSignal.rawMetrics.rows)} строк
                    </span>{" "}
                    и{" "}
                    <span className="font-semibold text-foreground">{selectedSignal.rawMetrics.columns} колонок</span>, связывая их с{" "}
                    <span className="font-semibold text-foreground">{selectedSignal.rawMetrics.vizCount}</span> графовыми
                    визуализациями. Свежесть данных составила{" "}
                    {selectedSignal.rawMetrics.freshnessDays !== null
                      ? `${selectedSignal.rawMetrics.freshnessDays} дн.`
                      : "неопределённое время"}
                    , что напрямую влияет на вклад фактора «Свежесть наблюдений». Таким образом итоговый индекс угрозы
                    {selectedSignal.threatScore >= 60 ? " повысился" : " понизился"} не из-за декоративных значений, а на основе
                    конкретных входных характеристик набора данных.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">История аудитов и мониторинга</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Загружаем данные…</p>
            ) : biasOverview.latest.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Добавьте наборы данных, чтобы видеть результаты аудита и распределение смещений.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Набор данных</TableHead>
                    <TableHead>Строк</TableHead>
                    <TableHead>Теги</TableHead>
                    <TableHead>Последнее обновление</TableHead>
                    <TableHead>Состояние</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {biasOverview.latest.map(({ dataset, date }) => {
                    const diffDays = diffInDays(date);
                    let status = "success";
                    if (diffDays !== null && diffDays > 90) {
                      status = "critical";
                    } else if (diffDays !== null && diffDays > 45) {
                      status = "warning";
                    }
                    return (
                      <TableRow key={dataset.id}>
                        <TableCell className="font-medium">{dataset.name || dataset.id}</TableCell>
                        <TableCell>{formatNumber(dataset.row_count)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(dataset.tags || []).slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="outline" className="capitalize">
                                {tag}
                              </Badge>
                            ))}
                            {(dataset.tags || []).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                        </TableCell>
                        <TableCell>{formatDate(date)}</TableCell>
                        <TableCell>
                          {status === "success" && <Badge className="bg-emerald-100 text-emerald-700">Актуально</Badge>}
                          {status === "warning" && <Badge className="bg-amber-100 text-amber-700">Требует внимания</Badge>}
                          {status === "critical" && <Badge className="bg-rose-100 text-rose-700">Просрочено</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
