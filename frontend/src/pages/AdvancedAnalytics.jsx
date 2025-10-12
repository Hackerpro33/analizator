import React, { useEffect, useMemo, useState } from "react";
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
import {
  Activity,
  AlertTriangle,
  BarChart3,
  LineChart,
  Network,
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
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [scenarioWeights, setScenarioWeights] = useState(SCENARIO_PRESETS[0].weights);

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
