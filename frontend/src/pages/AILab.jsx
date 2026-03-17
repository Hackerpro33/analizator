import React, { useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Database, BrainCircuit, Settings, Rocket, RefreshCcw } from "lucide-react";

import {
  getAlgorithmCatalog,
  getDatasetProfile,
  getMlDatasets,
  getModel,
  listModels,
  runInference,
  trainModel,
} from "@/api/ml";
import {
  fetchSeries,
  runAiForecast,
  listAiModels,
  activateAiModel,
  deactivateAiModel,
  submitTrainingJob,
  fetchTrainingJob,
  fetchAuditSuggestions,
} from "@/api/aiLab";
import YearSelector from "@/components/ai-lab/YearSelector";
import YearGrid from "@/components/ai-lab/YearGrid";
import SliceBuilder from "@/components/ai-lab/SliceBuilder";
import MethodPicker from "@/components/ai-lab/MethodPicker";
import { Switch } from "@/components/ui/switch";
import { updateSelection } from "@/components/ai-lab/utils";
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";

/**
 * Предположения по архитектуре (обновлено в рамках расширения ИИ-лаборатории):
 * - API фактических и прогнозных рядов будет отдаваться через GET /api/v1/ai-lab/series
 *   с параметрами target/from/to/horizon и структурой { actual: [...], forecast: [...], sef: [...] }.
 * - Бэкенд продолжит хранить артефакты моделей во внутреннем каталоге backend/app/data/models
 *   (JSON-реестр + файлы в /artifacts), чтобы не затрагивать базу данных.
 * - Все новые роуты требуют той же сессии/куки аутентификации, поэтому используем существующий
 *   механизм авторизации FastAPI без отдельных ключей.
 */

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Number(value));
}

function formatMetric(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  if (value <= 1) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(2);
}

const PARAM_HINTS = {
  n_estimators: "Чем больше деревьев, тем стабильнее модель, но дольше обучение.",
  max_depth: "Максимальная глубина дерева: ограничьте её, чтобы избежать переобучения.",
  min_samples_split: "Минимальное число записей, при котором узел делится на два.",
  learning_rate: "Скорость обучения бустинга — снижайте для точности, повышайте для скорости.",
  subsample: "Доля данных, используемая в каждой итерации бустинга.",
  C: "Обратный коэффициент регуляризации: большие значения уменьшают штраф за сложность.",
  penalty: "Тип регуляризации (L1/L2) для борьбы с переобучением.",
  solver: "Алгоритм оптимизации: lbfgs — универсальный, saga — подходит для больших данных.",
  max_iter: "Лимит итераций оптимизатора — увеличьте при сложных задачах.",
};

const STRING_HYPERPARAMETERS = new Set(["penalty", "solver"]);
const CONTEXT_STORAGE_KEY = "ai-lab-analysis-context";

export default function AILab() {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState({});
  const [datasets, setDatasets] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [datasetProfile, setDatasetProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [taskType, setTaskType] = useState("classification");
  const [selectedAlgorithm, setSelectedAlgorithm] = useState("");
  const [modelName, setModelName] = useState("ИИ-модель рисков");
  const [description, setDescription] = useState("");
  const [targetColumn, setTargetColumn] = useState("");
  const [featureColumns, setFeatureColumns] = useState([]);
  const [hyperparameters, setHyperparameters] = useState({});
  const [testSize, setTestSize] = useState(0.2);
  const [randomState, setRandomState] = useState(42);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingResult, setTrainingResult] = useState(null);
  const [activeModel, setActiveModel] = useState(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [inferenceResult, setInferenceResult] = useState(null);
  const [isRunningInference, setIsRunningInference] = useState(false);
  const [initialError, setInitialError] = useState(null);
  const [seriesConfig, setSeriesConfig] = useState({
    datasetId: "",
    dateColumn: "month",
    valueColumn: "target_value",
    sefColumns: [],
    horizon: 12,
  });
  const [seriesData, setSeriesData] = useState(null);
  const [isSeriesLoading, setIsSeriesLoading] = useState(false);
  const [overlayForecast, setOverlayForecast] = useState(true);
  const [deltaMode, setDeltaMode] = useState("mom");
  const [selectedYearsGrid, setSelectedYearsGrid] = useState([]);
  const [selectedTiles, setSelectedTiles] = useState(new Set());
  const [lastClickedTile, setLastClickedTile] = useState(null);
  const [methodSelection, setMethodSelection] = useState(["sarima", "ets", "linear_regression"]);
  const [ensembleMode, setEnsembleMode] = useState("weighted");
  const [forecastResult, setForecastResult] = useState(null);
  const [aiModels, setAiModels] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);
  const [sliceSummary, setSliceSummary] = useState(null);
  const [, setAuditHints] = useState(null);

  const algorithmOptions = useMemo(() => catalog[taskType] || [], [catalog, taskType]);
  const selectedAlgorithmSpec = useMemo(
    () => algorithmOptions.find((item) => item.id === selectedAlgorithm),
    [algorithmOptions, selectedAlgorithm],
  );

  const featureCandidates = datasetProfile?.columns || [];
  const datasetPreview = datasetProfile?.preview || [];

  const seriesTimeline = useMemo(() => {
    if (!seriesData) {
      return [];
    }
    const actualMap = new Map();
    (seriesData.actual || []).forEach((item) => {
      actualMap.set(item.date, item.value !== undefined ? Number(item.value) : null);
    });
    const forecastMap = new Map();
    (seriesData.forecast || []).forEach((item) => {
      forecastMap.set(item.date, {
        yhat: item.yhat !== undefined ? Number(item.yhat) : null,
        lower: item.lower !== undefined ? Number(item.lower) : null,
        upper: item.upper !== undefined ? Number(item.upper) : null,
      });
    });
    const allDates = new Set([...actualMap.keys(), ...forecastMap.keys()]);
    return Array.from(allDates)
      .sort()
      .map((date) => {
        const forecastEntry = forecastMap.get(date) || {};
        return {
          date,
          actual: actualMap.has(date) ? actualMap.get(date) : null,
          forecast: forecastEntry.yhat ?? null,
          lower: forecastEntry.lower ?? null,
          upper: forecastEntry.upper ?? null,
        };
      });
  }, [seriesData]);

  const availableYears = useMemo(() => {
    const set = new Set();
    seriesTimeline.forEach((item) => {
      const year = new Date(item.date).getFullYear();
      set.add(year);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [seriesTimeline]);

  const assistantContext = useMemo(() => {
    const years = selectedYearsGrid.length ? selectedYearsGrid : availableYears;
    const correlations =
      forecastResult?.correlations ||
      seriesData?.correlations ||
      [];
    const topCorrelations = correlations.slice(0, 3).map((item) => ({
      feature: item.feature,
      value: item.correlation ?? item.value,
      lag: item.lag,
    }));
    const lastActualPoint = [...seriesTimeline].reverse().find((point) => point.actual !== null && point.actual !== undefined);
    const forecastList = forecastResult?.forecast || seriesData?.forecast || [];
    const tailForecast = forecastList.length ? forecastList[forecastList.length - 1] : null;
    let maeValue = null;
    if (forecastResult?.backtest) {
      const rows = forecastResult.backtest.filter(
        (item) => item.method === (forecastResult.best_model?.method || item.method),
      );
      if (rows.length) {
        maeValue = rows.reduce((sum, item) => sum + (item.mae || 0), 0) / rows.length;
      }
    }
    return {
      target: seriesConfig.valueColumn,
      years,
      aggregate: sliceSummary?.aggregate,
      delta: sliceSummary?.delta,
      correlations: topCorrelations,
      model: {
        method: forecastResult?.best_model?.method,
        mae: maeValue,
      },
      forecast: tailForecast
        ? {
            horizon_value: tailForecast.yhat,
            horizon_date: tailForecast.date,
            last_actual: lastActualPoint?.actual ?? null,
          }
        : null,
    };
  }, [
    selectedYearsGrid,
    availableYears,
    seriesConfig.valueColumn,
    sliceSummary,
    forecastResult,
    seriesTimeline,
    seriesData,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(CONTEXT_STORAGE_KEY, JSON.stringify(assistantContext));
    } catch (error) {
      console.warn("Не удалось сохранить контекст анализа", error);
    }
  }, [assistantContext]);

  const canTrain =
    Boolean(selectedDatasetId) && Boolean(targetColumn) && featureColumns.length > 0 && Boolean(selectedAlgorithm);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [catalogData, datasetData, modelsData] = await Promise.all([
          getAlgorithmCatalog(),
          getMlDatasets(),
          listModels(),
        ]);
        setCatalog(catalogData?.algorithms || {});
        setDatasets(datasetData?.items || []);
        setModels(modelsData?.items || []);
        const firstDataset = datasetData?.items?.[0]?.id || "";
        if (firstDataset) {
          await fetchDatasetProfile(firstDataset);
        }
      } catch (error) {
        console.error("Не удалось загрузить ML-каталог", error);
        setInitialError("Не удалось загрузить инфраструктуру ML. Проверьте бэкенд.");
      }
    };
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedAlgorithm && algorithmOptions.length > 0) {
      handleAlgorithmChange(algorithmOptions[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algorithmOptions]);

  useEffect(() => {
    if (!selectedDatasetId && datasets.length > 0) {
      fetchDatasetProfile(datasets[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets]);

  useEffect(() => {
    if (!targetColumn) {
      return;
    }
    setFeatureColumns((prev) => prev.filter((name) => name !== targetColumn));
  }, [targetColumn]);

  useEffect(() => {
    loadTimeSeriesModels();
  }, []);

useEffect(() => {
    if (!seriesConfig.datasetId) {
      return;
    }
    loadSeries({ sefColumns: seriesConfig.sefColumns });
  }, [
    seriesConfig.datasetId,
    seriesConfig.dateColumn,
    seriesConfig.valueColumn,
    seriesConfig.horizon,
    JSON.stringify(seriesConfig.sefColumns),
  ]);

  useEffect(() => {
    if (!activeJobId) {
      return undefined;
    }
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const status = await fetchTrainingJob(activeJobId);
        if (cancelled) return;
        setJobStatus(status);
        setJobLogs(status.logs || []);
        if (status.status === "completed" || status.status === "failed") {
          setActiveJobId(null);
          await Promise.all([loadTimeSeriesModels(), loadSeries()]);
        }
      } catch (error) {
        console.error("Не удалось получить статус задачи", error);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeJobId]);

  async function loadAuditHintsForDataset(datasetId) {
    if (!datasetId) {
      return;
    }
    try {
      const hints = await fetchAuditSuggestions(datasetId);
      setAuditHints(hints);
      setSeriesConfig((prev) => ({
        ...prev,
        datasetId,
        dateColumn: hints?.date_column || prev.dateColumn,
        valueColumn: hints?.target_column || prev.valueColumn,
        sefColumns: hints?.sef_candidates || prev.sefColumns,
      }));
    } catch (error) {
      console.warn("Не удалось получить подсказки аудита данных", error);
      setSeriesConfig((prev) => ({
        ...prev,
        datasetId,
      }));
    }
  }

  async function fetchDatasetProfile(datasetId) {
    if (!datasetId) {
      setDatasetProfile(null);
      return;
    }
    setSelectedDatasetId(datasetId);
    setIsProfileLoading(true);
    try {
      const profile = await getDatasetProfile(datasetId);
      setDatasetProfile(profile);
      const cols = profile?.columns?.map((col) => col.name) || [];
      const suggestedTarget =
        cols.find((name) => /level|класс|target|label|alert/i.test(name)) || cols[cols.length - 1] || "";
      setTargetColumn(suggestedTarget);
      setFeatureColumns(cols.filter((name) => name && name !== suggestedTarget));
      await loadAuditHintsForDataset(datasetId);
    } catch (error) {
      console.error("Ошибка загрузки профиля набора данных", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить профиль набора данных",
        variant: "destructive",
      });
    } finally {
      setIsProfileLoading(false);
    }
  }

  async function refreshModels() {
    try {
      const response = await listModels();
      setModels(response?.items || []);
    } catch (error) {
      console.error("Не удалось обновить список моделей", error);
    }
  }

  const loadTimeSeriesModels = async () => {
    try {
      const response = await listAiModels();
      setAiModels(response?.items || []);
    } catch (error) {
      console.error("Не удалось загрузить модели временных рядов", error);
    }
  };

  const loadSeries = async (overrides = {}) => {
    const datasetId = overrides.datasetId || seriesConfig.datasetId;
    if (!datasetId) {
      return;
    }
    setIsSeriesLoading(true);
    try {
      const params = {
        target: datasetId,
        date_column: overrides.dateColumn || seriesConfig.dateColumn,
        value_column: overrides.valueColumn || seriesConfig.valueColumn,
        horizon: overrides.horizon || seriesConfig.horizon,
      };
      const sefColumns = overrides.sefColumns || seriesConfig.sefColumns;
      if (sefColumns && sefColumns.length > 0) {
        params.sef_columns = sefColumns.join(",");
      }
      const data = await fetchSeries(params);
      setSeriesData(data);
    } catch (error) {
      console.error("Не удалось загрузить временные ряды ИИ-лаборатории", error);
    } finally {
      setIsSeriesLoading(false);
    }
  };

  function handleFeatureToggle(column, enabled) {
    setFeatureColumns((prev) => {
      if (enabled) {
        if (prev.includes(column)) {
          return prev;
        }
        return [...prev, column];
      }
      return prev.filter((name) => name !== column);
    });
  }

  function handleAlgorithmChange(value) {
    setSelectedAlgorithm(value);
    const spec = (catalog[taskType] || []).find((item) => item.id === value);
    setHyperparameters(spec?.defaults ? { ...spec.defaults } : {});
  }

  async function handleTrain() {
    if (!canTrain) {
      toast({
        title: "Заполните параметры",
        description: "Выберите набор данных, целевую колонку и признаки для обучения.",
        variant: "destructive",
      });
      return;
    }
    setIsTraining(true);
    try {
      const payload = {
        name: modelName || `Модель ${selectedAlgorithm}`,
        description,
        dataset_id: selectedDatasetId,
        target_column: targetColumn,
        feature_columns: featureColumns,
        task_type: taskType,
        algorithm: selectedAlgorithm,
        hyperparameters: Object.fromEntries(
          Object.entries(hyperparameters || {}).filter(([, value]) => value !== "" && value !== null),
        ),
        test_size: Number(testSize),
        random_state: randomState,
      };
      const model = await trainModel(payload);
      setTrainingResult(model);
      setActiveModel(model);
      setSelectedModelId(model.id);
      setInferenceResult(model.latest_inference || null);
      toast({
        title: "Модель обучена",
        description: `Получено качество ${formatMetric(model?.metrics?.f1_weighted || model?.metrics?.r2 || 0)}`,
      });
      await refreshModels();
    } catch (error) {
      console.error("Ошибка обучения модели", error);
      toast({
        title: "Ошибка обучения",
        description: error?.message || "Сервис не смог обучить модель.",
        variant: "destructive",
      });
    } finally {
      setIsTraining(false);
    }
  }

  async function handleSelectModel(modelId) {
    setSelectedModelId(modelId);
    if (!modelId) {
      setActiveModel(null);
      setInferenceResult(null);
      return;
    }
    setIsModelLoading(true);
    try {
      const detail = await getModel(modelId);
      setActiveModel(detail);
      setInferenceResult(detail.latest_inference || null);
    } catch (error) {
      console.error("Ошибка загрузки модели", error);
      toast({
        title: "Ошибка",
        description: "Не удалось получить информацию о модели.",
        variant: "destructive",
      });
    } finally {
      setIsModelLoading(false);
    }
  }

  async function handleRunInference() {
    if (!activeModel) {
      toast({ title: "Выберите модель", description: "Нужно выбрать модель из списка." });
      return;
    }
    setIsRunningInference(true);
    try {
      const payload = {
        dataset_id: selectedDatasetId || activeModel.dataset_id,
        limit: 80,
      };
      const inference = await runInference(activeModel.id, payload);
      setInferenceResult(inference);
      toast({
        title: "Инференс завершён",
        description: `Получено ${inference.count} предсказаний.`,
      });
      await refreshModels();
    } catch (error) {
      console.error("Ошибка инференса", error);
      toast({
        title: "Ошибка инференса",
        description:
          error?.message ||
          "Не удалось построить прогноз. Убедитесь, что выбранные признаки совпадают с набором данных и не содержат категориальных значений, требующих ручной обработки.",
        variant: "destructive",
      });
    } finally {
      setIsRunningInference(false);
    }
  }

  const handleTileSelect = (date, event) => {
    const result = updateSelection(selectedTiles, seriesTimeline, lastClickedTile, date, event);
    setSelectedTiles(result.selection);
    setLastClickedTile(result.last);
  };

  const clearTileSelection = () => {
    setSelectedTiles(new Set());
    setLastClickedTile(null);
    setSliceSummary(null);
  };

  async function handleRunTimeSeriesForecast() {
    if (!seriesConfig.datasetId) {
      toast({
        title: "Выберите набор данных",
        description: "Для запуска прогноза требуется выбрать набор с колонками даты и значений.",
        variant: "destructive",
      });
      return;
    }
    try {
      setIsSeriesLoading(true);
      const payload = {
        dataset_id: seriesConfig.datasetId,
        date_column: seriesConfig.dateColumn,
        value_column: seriesConfig.valueColumn,
        sef_columns: seriesConfig.sefColumns,
        horizon: seriesConfig.horizon,
        methods: methodSelection,
        ensemble_mode: ensembleMode,
      };
      const result = await runAiForecast(payload);
      setForecastResult(result);
      toast({
        title: "Прогноз обновлён",
        description: "Расчёт временных рядов выполнен локально.",
      });
      await Promise.all([loadSeries(), loadTimeSeriesModels()]);
    } catch (error) {
      console.error("Не удалось построить прогноз", error);
      toast({
        title: "Ошибка прогноза",
        description: error?.message || "Попробуйте выбрать другие параметры.",
        variant: "destructive",
      });
    } finally {
      setIsSeriesLoading(false);
    }
  }

  async function handleTrainingJob(mode) {
    if (!seriesConfig.datasetId) {
      toast({
        title: "Нет набора данных",
        description: "Сначала выберите набор данных для помесячного анализа.",
        variant: "destructive",
      });
      return;
    }
    try {
      const activeTsModel = aiModels.find((model) => model.is_active);
      const response = await submitTrainingJob({
        dataset_id: seriesConfig.datasetId,
        date_column: seriesConfig.dateColumn,
        value_column: seriesConfig.valueColumn,
        sef_columns: seriesConfig.sefColumns,
        horizon: seriesConfig.horizon,
        methods: methodSelection,
        ensemble_mode: ensembleMode,
        mode,
        model_id: activeTsModel?.id,
      });
      setActiveJobId(response.job_id);
      setJobStatus({ status: "queued" });
      setJobLogs([]);
      toast({
        title: "Задача запущена",
        description: "Можно продолжать работу — задача выполнится в фоне.",
      });
    } catch (error) {
      console.error("Не удалось запустить обучение временных рядов", error);
      toast({
        title: "Ошибка запуска",
        description: error?.message || "Проверьте параметры и попробуйте снова.",
        variant: "destructive",
      });
    }
  }

  async function handleToggleTimeSeriesModel(modelId, isActive) {
    try {
      if (isActive) {
        await deactivateAiModel(modelId);
        toast({
          title: "Модель деактивирована",
          description: "Прогнозы не будут использовать эту версию.",
        });
      } else {
        await activateAiModel(modelId);
        toast({
          title: "Модель активирована",
          description: "Новый прогноз будет использовать эту версию.",
        });
      }
      await Promise.all([loadTimeSeriesModels(), loadSeries()]);
    } catch (error) {
      console.error("Не удалось обновить состояние модели", error);
      toast({
        title: "Ошибка обновления",
        description: error?.message || "Попробуйте позже.",
        variant: "destructive",
      });
    }
  }

  return (
    <PageContainer
      title="ИИ-лаборатория"
      description="Выбирайте данные, настраивайте гиперпараметры и запускайте обучение или инференс полностью локально."
    >
      {initialError && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{initialError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Database className="w-4 h-4 text-blue-600" />
                  Выбор данных
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Подготовьте набор данных и отметьте признаки, которые модель будет использовать.
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Набор данных</label>
                  <Select value={selectedDatasetId} onValueChange={fetchDatasetProfile}>
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
                  <p className="text-xs text-muted-foreground">
                    Используйте предзагруженный набор «AI — карта рисков» или любой файл, который загрузите через раздел «Источники
                    данных».
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Тип задачи</label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classification">Классификация</SelectItem>
                      <SelectItem value="regression">Регрессия</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Классификация предсказывает метки (например, уровень риска), регрессия — числовые показатели (скорость, объем).
                  </p>
                </div>
              </div>

              {isProfileLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Загружаем профиль набора данных...
                </div>
              )}

              {datasetProfile && !isProfileLoading && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase text-muted-foreground">Целевая колонка</label>
                      <Select value={targetColumn} onValueChange={setTargetColumn}>
                        <SelectTrigger>
                          <SelectValue placeholder="Колонка" />
                        </SelectTrigger>
                        <SelectContent>
                          {featureCandidates.map((column) => (
                            <SelectItem key={column.name} value={column.name}>
                              {column.name} ({column.dtype})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Это столбец, который нужно предсказать. Для демо-набора выберите «alert_level».
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase text-muted-foreground">Алгоритм</label>
                      <Select value={selectedAlgorithm} onValueChange={handleAlgorithmChange}>
                        <SelectTrigger>
                          <SelectValue placeholder="Алгоритм" />
                        </SelectTrigger>
                        <SelectContent>
                          {algorithmOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Алгоритмы отличаются компромиссом между скоростью и точностью. Начните с случайного леса или логистической
                        регрессии.
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs uppercase text-muted-foreground mb-2">Выбранные признаки</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {featureCandidates.map((column) => (
                        <label
                          key={column.name}
                          className="flex items-center justify-between rounded-lg border border-muted px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium">{column.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {column.dtype} • непустых: {formatNumber(column.non_nulls)}
                            </p>
                          </div>
                          <Checkbox
                            checked={featureColumns.includes(column.name) && column.name !== targetColumn}
                            onCheckedChange={(checked) => handleFeatureToggle(column.name, Boolean(checked))}
                            disabled={column.name === targetColumn}
                          />
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Оставьте признаки, которые реально влияют на прогноз. Категориальные значения будут автоматически закодированы.
                    </p>
                  </div>

                  <div>
                    <p className="text-xs uppercase text-muted-foreground mb-2">Превью набора данных</p>
                    <div className="rounded-xl border bg-white overflow-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {featureCandidates.map((column) => (
                              <TableHead key={column.name} className="min-w-[120px]">
                                {column.name}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {datasetPreview.slice(0, 5).map((row, index) => (
                            <TableRow key={index}>
                              {featureCandidates.map((column) => (
                                <TableCell key={column.name}>
                                  {row?.[column.name] !== undefined ? String(row[column.name]) : "—"}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <Settings className="w-4 h-4 text-emerald-600" />
                Конфигурация обучения
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Название модели</label>
                  <Input
                    value={modelName}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(event) => setModelName(clampName(event.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Дайте понятное имя, по которому позже найдёте модель в списке (например, «Риски по районам»).
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase text-muted-foreground">Случайное зерно</label>
                  <Input
                    type="number"
                    value={randomState}
                    onChange={(event) => setRandomState(Number(event.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Фиксированное зерно делает результаты воспроизводимыми: используйте одно значение для экспериментов.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Описание</label>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Например: обнаружение районов высокого риска для патрулирования"
                />
                <p className="text-xs text-muted-foreground">
                  Кратко опишите цель модели, чтобы коллеги понимали, как использовать её в аналитике.
                </p>
              </div>

              {selectedAlgorithmSpec && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase text-muted-foreground">Гиперпараметры</p>
                    <Badge variant="secondary">score·{selectedAlgorithmSpec.primary_metric}</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedAlgorithmSpec.params.map((param) => (
                      <div key={param} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{param}</label>
                        <Input
                          value={hyperparameters?.[param] ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "") {
                              setHyperparameters((prev) => ({ ...prev, [param]: "" }));
                              return;
                            }
                            if (STRING_HYPERPARAMETERS.has(param)) {
                              setHyperparameters((prev) => ({ ...prev, [param]: value }));
                              return;
                            }
                            const numeric = Number(value);
                            setHyperparameters((prev) => ({
                              ...prev,
                              [param]: Number.isNaN(numeric) ? value : numeric,
                            }));
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground">
                          {PARAM_HINTS[param] || "Отрегулируйте параметр, чтобы найти баланс между скоростью и качеством модели."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs uppercase text-muted-foreground mb-2">
                  <span>Размер теста</span>
                  <span>{Math.round(testSize * 100)}%</span>
                </div>
                <Slider
                  min={0.1}
                  max={0.4}
                  step={0.05}
                  value={[testSize]}
                  onValueChange={([value]) => setTestSize(Number(value))}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Больше тестовая выборка — точнее оценка метрик, но меньше данных останется для обучения.
                </p>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleTrain} disabled={isTraining || !canTrain}>
                  {isTraining && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Запустить обучение
                </Button>
              </div>
            </CardContent>
          </Card>

          {trainingResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Rocket className="w-4 h-4 text-purple-600" />
                  Результаты обучения
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  {Object.entries(trainingResult.metrics || {}).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-muted p-3">
                      <p className="text-xs uppercase text-muted-foreground">{key}</p>
                      <p className="text-xl font-semibold">{formatMetric(value)}</p>
                    </div>
                  ))}
                </div>
                {trainingResult.preview?.records && (
                  <div>
                    <p className="text-xs uppercase text-muted-foreground mb-2">Превью предсказаний</p>
                    <div className="rounded-lg border bg-white p-3 space-y-3">
                      {trainingResult.preview.records.slice(0, 3).map((item, index) => (
                        <div key={index} className="text-sm">
                          <p className="font-medium">Прогноз: {String(item.prediction)}</p>
                          <p className="text-muted-foreground">Фактическое значение: {String(item.actual ?? "—")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="space-y-2">
              <div>
                <CardTitle className="text-base font-semibold">Визуализация по месяцам (12-клеточная сетка)</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Сопоставляйте факт и прогноз в сетке 3×4, анализируйте динамику и собирайте срезы для отчётов.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Колонка даты</p>
                  <Select
                    value={seriesConfig.dateColumn}
                    onValueChange={(value) => setSeriesConfig((prev) => ({ ...prev, dateColumn: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Колонка" />
                    </SelectTrigger>
                    <SelectContent>
                      {featureCandidates
                        .filter((column) => /date|month|period/i.test(column.name) || /date|datetime/i.test(column.dtype || ""))
                        .map((column) => (
                          <SelectItem key={column.name} value={column.name}>
                            {column.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Колонка значений</p>
                  <Select
                    value={seriesConfig.valueColumn}
                    onValueChange={(value) => setSeriesConfig((prev) => ({ ...prev, valueColumn: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Колонка" />
                    </SelectTrigger>
                    <SelectContent>
                      {featureCandidates
                        .filter((column) => /int|float|number/i.test(column.dtype || "number"))
                        .map((column) => (
                          <SelectItem key={column.name} value={column.name}>
                            {column.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Горизонт (мес.)</p>
                  <Input
                    type="number"
                    value={seriesConfig.horizon}
                    min={3}
                    max={36}
                    onChange={(event) =>
                      setSeriesConfig((prev) => ({ ...prev, horizon: Number(event.target.value) || 12 }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Switch checked={overlayForecast} onCheckedChange={setOverlayForecast} id="overlay-forecast" />
                  <label htmlFor="overlay-forecast" className="text-xs text-muted-foreground">
                    Отображать прогноз поверх факта
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={deltaMode === "mom" ? "default" : "outline"}
                    onClick={() => setDeltaMode("mom")}
                  >
                    Месяц к месяцу
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={deltaMode === "yoy" ? "default" : "outline"}
                    onClick={() => setDeltaMode("yoy")}
                  >
                    Год к году
                  </Button>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={clearTileSelection}>
                  Очистить выделение
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {isSeriesLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Обновляем временной ряд...
                </div>
              )}
              {!isSeriesLoading && (
                <>
                  <YearSelector
                    years={availableYears}
                    selectedYears={selectedYearsGrid}
                    onToggle={(year) =>
                      setSelectedYearsGrid((prev) =>
                        prev.includes(year) ? prev.filter((item) => item !== year) : [...prev, year],
                      )
                    }
                  />
                  <YearGrid
                    timeline={seriesTimeline}
                    years={availableYears}
                    selectedYears={selectedYearsGrid}
                    selectedTiles={selectedTiles}
                    onTileSelect={handleTileSelect}
                    deltaMode={deltaMode}
                    overlayForecast={overlayForecast}
                  />
                  <SliceBuilder
                    timeline={seriesTimeline}
                    selectedYears={selectedYearsGrid}
                    selectedTiles={selectedTiles}
                    onClearSelection={clearTileSelection}
                    onSummaryChange={setSliceSummary}
                  />
                  <div className="grid gap-6 lg:grid-cols-2">
                    <MethodPicker
                      value={methodSelection}
                      onChange={setMethodSelection}
                      ensembleMode={ensembleMode}
                      onEnsembleChange={setEnsembleMode}
                    />
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">Колонки факторов (SEF)</p>
                      <div className="flex flex-wrap gap-2">
                        {(seriesConfig.sefColumns || []).map((column) => (
                          <Badge key={column} variant="outline">
                            {column}
                          </Badge>
                        ))}
                        {!seriesConfig.sefColumns?.length && (
                          <p className="text-xs text-muted-foreground">Не выбрано</p>
                        )}
                      </div>
                      <div className="rounded-lg border bg-slate-50/80 p-2 max-h-32 overflow-auto text-xs space-y-1">
                        {featureCandidates
                          .filter((column) => column.name !== seriesConfig.valueColumn)
                          .map((column) => (
                            <label key={`sef-${column.name}`} className="flex items-center justify-between gap-3">
                              <span>{column.name}</span>
                              <Checkbox
                                checked={seriesConfig.sefColumns.includes(column.name)}
                                onCheckedChange={(checked) =>
                                  setSeriesConfig((prev) => {
                                    const next = new Set(prev.sefColumns || []);
                                    if (checked) {
                                      next.add(column.name);
                                    } else {
                                      next.delete(column.name);
                                    }
                                    return { ...prev, sefColumns: Array.from(next) };
                                  })
                                }
                              />
                            </label>
                          ))}
                      </div>
                      <Button onClick={handleRunTimeSeriesForecast} disabled={isSeriesLoading}>
                        {isSeriesLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Запустить прогноз рядов
                      </Button>
                    </div>
                  </div>
                  {forecastResult && (
                    <div className="space-y-3">
                      <p className="text-sm font-semibold text-slate-700">Сравнение методов (MAE)</p>
                      <div className="overflow-auto rounded-xl border bg-white">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Метод</TableHead>
                              <TableHead>Фолд</TableHead>
                              <TableHead>MAE</TableHead>
                              <TableHead>RMSE</TableHead>
                              <TableHead>sMAPE</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(forecastResult.backtest || []).map((row, index) => (
                              <TableRow key={`${row.method}-${index}`}>
                                <TableCell>{row.method}</TableCell>
                                <TableCell>{row.fold}</TableCell>
                                <TableCell>{row.mae?.toFixed(2)}</TableCell>
                                <TableCell>{row.rmse?.toFixed(2)}</TableCell>
                                <TableCell>{row.smape?.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <CardTitle className="flex items-center gap-2 text-base font-semibold">
                  <Rocket className="w-4 h-4 text-pink-600" />
                  Модели временных рядов
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadTimeSeriesModels}
                  className="whitespace-normal leading-tight"
                >
                  <RefreshCcw className="w-4 h-4 mr-2" />
                  Обновить
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 w-full">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTrainingJob("finetune")}
                  className="flex-1 min-w-[140px] whitespace-normal leading-tight text-center"
                >
                  Дообучить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTrainingJob("retrain")}
                  className="flex-1 min-w-[140px] whitespace-normal leading-tight text-center"
                >
                  Переобучить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTrainingJob("evaluate")}
                  className="flex-1 min-w-[140px] whitespace-normal leading-tight text-center"
                >
                  Оценить
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiModels.length === 0 && (
                <p className="text-sm text-muted-foreground">Пока нет сохранённых моделей временных рядов.</p>
              )}
              <div className="space-y-3">
                {aiModels.map((model) => (
                  <div
                    key={model.id}
                    className={`rounded-lg border px-3 py-2 ${model.is_active ? "border-violet-400 bg-violet-50" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium break-words">
                          {model.dataset_name || model.dataset_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {model.method || model.methods?.join(", ")} • MAE {model.score ? model.score.toFixed(2) : "—"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 whitespace-normal leading-tight text-center"
                        onClick={() => handleToggleTimeSeriesModel(model.id, model.is_active)}
                      >
                        {model.is_active ? "Деактивировать" : "Сделать активной"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {jobStatus && (
                <div className="rounded-lg border border-dashed bg-slate-50/70 p-3 space-y-2 text-sm">
                  <p className="font-semibold">Статус задачи: {jobStatus.status}</p>
                  <div className="max-h-40 overflow-auto text-xs space-y-1">
                    {jobLogs.length === 0 && <p className="text-muted-foreground">Логи появятся в процессе.</p>}
                    {jobLogs.map((log, index) => (
                      <p key={`${log.timestamp}-${index}`}>
                        {new Date(log.timestamp * 1000).toLocaleTimeString()} — {log.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <BrainCircuit className="w-4 h-4 text-indigo-600" />
                Модели
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={refreshModels}>
                Обновить
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {models.length === 0 && <p className="text-sm text-muted-foreground">Моделей пока нет.</p>}
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => handleSelectModel(model.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    selectedModelId === model.id ? "border-blue-500 bg-blue-50" : "border-muted bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{model.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {model.dataset_name || "—"} • {model.algorithm}
                      </p>
                    </div>
                    <Badge variant="outline">{formatMetric(model.primary_score ?? model.metrics?.accuracy)}</Badge>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Инференс и объяснения</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isModelLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Загружаем модель...
                </div>
              )}
              {activeModel && (
                <>
                  <div className="text-sm">
                    <p className="font-medium">{activeModel.name}</p>
                    <p className="text-muted-foreground">
                      {activeModel.dataset_name || "—"} • целевая колонка {activeModel.target_column}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeModel.feature_columns?.map((column) => (
                      <Badge key={column} variant="secondary">
                        {column}
                      </Badge>
                    ))}
                  </div>
                  <Button onClick={handleRunInference} disabled={isRunningInference}>
                    {isRunningInference && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Запустить инференс
                  </Button>
                </>
              )}
              {!activeModel && <p className="text-sm text-muted-foreground">Выберите модель, чтобы запустить инференс.</p>}

              {inferenceResult && (
                <>
                  <Separator />
                  <p className="text-xs uppercase text-muted-foreground">Распределение</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(inferenceResult.summary || {}).map(([label, value]) => (
                      <Badge key={label} variant="outline">
                        {label}: {formatMetric(value)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs uppercase text-muted-foreground mt-2">Первые предсказания</p>
                  <div className="rounded-lg border bg-white p-3 space-y-2 max-h-64 overflow-auto">
                    {(inferenceResult.predictions || []).slice(0, 6).map((item, index) => (
                      <div key={index} className="text-sm">
                        <p className="font-medium">Прогноз: {String(item.prediction)}</p>
                        <p className="text-muted-foreground truncate">
                          {Object.entries(item.input || {})
                            .slice(0, 3)
                            .map(([key, value]) => `${key}: ${value}`)
                            .join(" • ")}
                        </p>
                      </div>
                    ))}
                    {!inferenceResult.predictions?.length && (
                      <p className="text-xs text-muted-foreground">Нет доступных записей для отображения.</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
