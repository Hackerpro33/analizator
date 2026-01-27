
import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { analyzeCorrelation } from "@/utils/localAnalysis";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { parseNumberLike } from "@/utils/numberUtils";

const FEATURE_TYPE_LABELS = {
  base: "Базовые показатели",
  normalized: "Индексы (база = 100)",
  lag: "Лаговые значения",
  aggregate: "Агрегированные KPI",
  cross_ratio: "Отношения источников",
  cross_delta: "Разница источников",
  category_one_hot: "Категории (one-hot)",
};

const getCorrelationDescriptor = (value) => {
    const absValue = Math.abs(value);

    if (absValue >= 0.9) return "Практически линейная зависимость";
    if (absValue >= 0.7) return "Сильная взаимосвязь";
    if (absValue >= 0.5) return "Умеренная взаимосвязь";
    if (absValue >= 0.3) return "Слабая взаимосвязь";
    if (absValue > 0) return "Очень слабая взаимосвязь";
    return "Нет корреляции";
};

const getCellPresentation = (value) => {
    const absValue = Math.min(Math.abs(value), 1);
    const hue = value >= 0 ? 160 : 0; // зеленый для положительной, красный для отрицательной
    const saturation = 75;
    const minLightness = 32;
    const maxLightness = 94;
    const lightness = maxLightness - (absValue * (maxLightness - minLightness));
    const backgroundColor = `hsl(${hue} ${saturation}% ${lightness}%)`;
    const textColor = absValue >= 0.6 ? "#fff" : "#0f172a";

    return {
        backgroundColor,
        color: textColor,
        descriptor: getCorrelationDescriptor(value),
    };
};

const toNumericOrNull = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = parseNumberLike(value);
  return parsed === null ? null : parsed;
};

const normalizeSeries = (values) => {
  const baseline = values.find((value) => value !== null && value !== 0);
  if (!baseline) {
    return values.map(() => null);
  }
  return values.map((value) => (value === null ? null : Number(((value / baseline) * 100).toFixed(3))));
};

const buildLagSeries = (values, lag) => {
  if (!Number.isFinite(lag) || lag <= 0) {
    return values.map(() => null);
  }
  return values.map((_, index, array) => {
    const sourceIndex = index - lag;
    if (sourceIndex < 0) return null;
    return array[sourceIndex] ?? null;
  });
};

const averageNumbers = (numbers) => {
  const valid = numbers.filter((value) => value !== null && Number.isFinite(value));
  if (!valid.length) return null;
  const sum = valid.reduce((acc, value) => acc + value, 0);
  return Number((sum / valid.length).toFixed(3));
};

const buildAggregateSeries = (features) => {
  if (!features.length) return [];
  const maxLength = Math.max(...features.map((feature) => feature.values.length));
  return Array.from({ length: maxLength }, (_, index) =>
    averageNumbers(features.map((feature) => feature.values[index] ?? null))
  );
};

const safeRatio = (a, b) => {
  if (a === null || b === null || b === 0) {
    return null;
  }
  return Number((a / b).toFixed(3));
};

const safeDifference = (a, b) => {
  if (a === null || b === null) {
    return null;
  }
  return Number((a - b).toFixed(3));
};

const isLikelyCategorical = (column, rows = []) => {
  const type = String(column?.type || "").toLowerCase();
  if (["string", "text", "category", "enum", "boolean"].some((token) => type.includes(token))) {
    return true;
  }
  if (["number", "int", "float", "double", "decimal"].some((token) => type.includes(token))) {
    return false;
  }
  if (!rows.length) {
    return false;
  }
  const values = rows
    .map((row) => row?.[column.name])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (!values.length) {
    return false;
  }
  const numericRatio = values.filter((value) => toNumericOrNull(value) !== null).length / values.length;
  return numericRatio < 0.3;
};

export default function CorrelationMatrix({ datasets, isLoading: _isLoading, onCorrelationCalculated }) {
    const [selectedDatasets, setSelectedDatasets] = useState([]);
    const [selectedFeatures, setSelectedFeatures] = useState([]);
    const [result, setResult] = useState(null);
    const [isCalculating, setIsCalculating] = useState(false);
    const [hoveredCell, setHoveredCell] = useState(null);
    const [advancedOptions, setAdvancedOptions] = useState({
      includeLagged: true,
      includeNormalized: true,
      includeCategoryEncoding: false,
      includeAggregates: false,
      includeCrossDataset: false,
      includeExternalFactors: false,
    });
    const [lagInput, setLagInput] = useState("1,3,12");
    const [selectedCategoricalFeatures, setSelectedCategoricalFeatures] = useState([]);
    const [externalDatasets, setExternalDatasets] = useState([]);

    const parsedLags = useMemo(
      () =>
        lagInput
          .split(",")
          .map((item) => parseInt(item.trim(), 10))
          .filter((value) => Number.isFinite(value) && value > 0 && value <= 52),
      [lagInput]
    );

    const datasetMap = useMemo(
      () => new Map((datasets || []).map((dataset) => [dataset.id, dataset])),
      [datasets]
    );

    const handleDatasetToggle = (datasetId) => {
      setSelectedDatasets(prev =>
        prev.includes(datasetId)
          ? prev.filter(id => id !== datasetId)
          : [...prev, datasetId]
      );
      setSelectedFeatures([]);
      setResult(null);
    };

    useEffect(() => {
      setExternalDatasets((prev) => prev.filter((id) => selectedDatasets.includes(id)));
    }, [selectedDatasets]);

    const availableCategoricalFeatures = useMemo(() => {
      return (datasets || [])
        .filter((dataset) => selectedDatasets.includes(dataset.id))
        .flatMap((dataset) =>
          (dataset.columns || [])
            .filter((column) => isLikelyCategorical(column, dataset.sample_data))
            .map((column) => ({
              id: `${dataset.id}::${column.name}`,
              label: `${dataset.name} > ${column.name}`,
            }))
        );
    }, [datasets, selectedDatasets]);

    useEffect(() => {
      setSelectedCategoricalFeatures((prev) =>
        prev.filter((id) => availableCategoricalFeatures.some((feature) => feature.id === id))
      );
    }, [availableCategoricalFeatures]);

    const handleFeatureToggle = (featureId) => {
        setSelectedFeatures(prev =>
            prev.includes(featureId)
                ? prev.filter(f => f !== featureId)
                : [...prev, featureId]
        );
    };

    const toggleAdvancedOption = (key) => (checked) => {
      setAdvancedOptions((prev) => ({
        ...prev,
        [key]: Boolean(checked),
      }));
    };

    const handleCalculate = async () => {
        if (selectedFeatures.length < 2) {
            alert("Пожалуйста, выберите как минимум два числовых признака для анализа.");
            return;
        }
        setIsCalculating(true);
        setResult(null);
        try {
            const baseFeatures = selectedFeatures
              .map((featureId) => {
                const [datasetId, columnName] = featureId.split("::");
                const dataset = datasetMap.get(datasetId);
                if (!dataset) return null;
                const numericSeries = (dataset.sample_data || []).map((row) =>
                  toNumericOrNull(row?.[columnName])
                );
                return {
                  id: featureId,
                  label: `${dataset.name || datasetId} > ${columnName}`,
                  values: numericSeries,
                  metadata: {
                    type: "base",
                    datasetId,
                    datasetName: dataset.name,
                    column: columnName,
                    externalFactor:
                      advancedOptions.includeExternalFactors && externalDatasets.includes(datasetId),
                  },
                };
              })
              .filter(Boolean);

            const featuresForCalc = [...baseFeatures];

            if (advancedOptions.includeNormalized) {
              baseFeatures.forEach((feature) => {
                const normalized = normalizeSeries(feature.values);
                if (normalized.some((value) => value !== null)) {
                  featuresForCalc.push({
                    label: `${feature.label} • индекс (база = 100)`,
                    values: normalized,
                    metadata: {
                      type: "normalized",
                      derivedFrom: feature.label,
                      datasetId: feature.metadata.datasetId,
                    },
                  });
                }
              });
            }

            if (advancedOptions.includeLagged && parsedLags.length) {
              parsedLags.forEach((lag) => {
                baseFeatures.forEach((feature) => {
                  const laggedSeries = buildLagSeries(feature.values, lag);
                  if (laggedSeries.filter((value) => value !== null).length > 1) {
                    featuresForCalc.push({
                      label: `${feature.label} (t-${lag})`,
                      values: laggedSeries,
                      metadata: {
                        type: "lag",
                        lag,
                        derivedFrom: feature.label,
                        datasetId: feature.metadata.datasetId,
                        externalFactor: feature.metadata.externalFactor,
                      },
                    });
                  }
                });
              });
            }

            if (advancedOptions.includeAggregates) {
              const grouped = baseFeatures.reduce((acc, feature) => {
                if (!acc.has(feature.metadata.datasetId)) {
                  acc.set(feature.metadata.datasetId, []);
                }
                acc.get(feature.metadata.datasetId).push(feature);
                return acc;
              }, new Map());

              grouped.forEach((features, datasetId) => {
                if (features.length < 2) return;
                const aggregateSeries = buildAggregateSeries(features);
                if (aggregateSeries.filter((value) => value !== null).length > 1) {
                  const dataset = datasetMap.get(datasetId);
                  featuresForCalc.push({
                    label: `${dataset?.name || datasetId} • агрегированный KPI`,
                    values: aggregateSeries,
                    metadata: {
                      type: "aggregate",
                      datasetId,
                      derivedFrom: features.map((feature) => feature.label),
                      externalFactor: features.some((feature) => feature.metadata.externalFactor),
                    },
                  });
                }
              });
            }

            if (advancedOptions.includeCrossDataset) {
              for (let i = 0; i < baseFeatures.length; i += 1) {
                for (let j = i + 1; j < baseFeatures.length; j += 1) {
                  const featureA = baseFeatures[i];
                  const featureB = baseFeatures[j];
                  if (featureA.metadata.datasetId === featureB.metadata.datasetId) {
                    continue;
                  }
                  const ratioSeries = featureA.values.map((value, index) =>
                    safeRatio(value, featureB.values[index] ?? null)
                  );
                  if (ratioSeries.filter((value) => value !== null).length > 1) {
                    featuresForCalc.push({
                      label: `${featureA.label} ÷ ${featureB.label}`,
                      values: ratioSeries,
                      metadata: {
                        type: "cross_ratio",
                        derivedFrom: [featureA.label, featureB.label],
                        datasetId: featureA.metadata.datasetId,
                      },
                    });
                  }

                  const deltaSeries = featureA.values.map((value, index) =>
                    safeDifference(value, featureB.values[index] ?? null)
                  );
                  if (deltaSeries.filter((value) => value !== null).length > 1) {
                    featuresForCalc.push({
                      label: `${featureA.label} − ${featureB.label}`,
                      values: deltaSeries,
                      metadata: {
                        type: "cross_delta",
                        derivedFrom: [featureA.label, featureB.label],
                        datasetId: featureA.metadata.datasetId,
                      },
                    });
                  }
                }
              }
            }

            if (advancedOptions.includeCategoryEncoding && selectedCategoricalFeatures.length) {
              selectedCategoricalFeatures.forEach((featureId) => {
                const [datasetId, columnName] = featureId.split("::");
                const dataset = datasetMap.get(datasetId);
                if (!dataset) return;
                const rows = dataset.sample_data || [];
                const frequency = new Map();
                rows.forEach((row) => {
                  const value = row?.[columnName];
                  if (value === null || value === undefined || value === "") return;
                  const key = String(value);
                  frequency.set(key, (frequency.get(key) || 0) + 1);
                });
                const topCategories = Array.from(frequency.entries())
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3);
                topCategories.forEach(([category]) => {
                  const encodedSeries = rows.map((row) => (row?.[columnName] === category ? 1 : 0));
                  if (encodedSeries.filter((value) => value !== null).length > 1) {
                    featuresForCalc.push({
                      label: `${dataset.name || datasetId} • ${columnName}=${category}`,
                      values: encodedSeries,
                      metadata: {
                        type: "category_one_hot",
                        datasetId,
                        category: `${dataset?.name || datasetId}:${columnName}=${category}`,
                        categoryDetails: { column: columnName, value: category, datasetName: dataset?.name },
                        derivedFrom: `${dataset.name || datasetId} > ${columnName}`,
                      },
                    });
                  }
                });
              });
            }

            const prepared = featuresForCalc
              .map((feature) => ({
                label: feature.label,
                values: feature.values,
                metadata: feature.metadata,
              }))
              .filter((feature) => {
                const valid = feature.values.filter((value) => value !== null && Number.isFinite(value));
                return valid.length > 1;
              });

            const response = analyzeCorrelation({
              features: prepared,
              context: {
                options: advancedOptions,
                lags: parsedLags,
                categorical: selectedCategoricalFeatures,
                externalDatasets: advancedOptions.includeExternalFactors ? externalDatasets : [],
              },
            });

            const enrichedResponse = {
              ...response,
              meta: {
                ...response.meta,
                featureOverview: {
                  base: baseFeatures.length,
                  derived: prepared.length - baseFeatures.length,
                  total: prepared.length,
                },
              },
            };

            setResult(enrichedResponse);
            if (onCorrelationCalculated) {
              onCorrelationCalculated(enrichedResponse);
            }
        } catch (error) {
            console.error("Ошибка расчета корреляции:", error);
        }
        setIsCalculating(false);
    };

    const availableFeatures = datasets
      .filter(d => selectedDatasets.includes(d.id))
      .flatMap(d =>
        (d.columns || [])
          .filter(c => c.type === 'number')
          .map(c => ({
            id: `${d.id}::${c.name}`,
            label: `${d.name} > ${c.name}`,
          }))
      );

    return (
        <div className="grid lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <BarChart3 className="w-5 h-5 text-blue-500" />
                        Настройка матрицы
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label>Выберите наборы данных</Label>
                        <div className="space-y-2 p-3 border rounded-lg max-h-48 overflow-y-auto bg-slate-50/50">
                            {datasets.map(d => (
                                <div key={d.id} className="flex items-center gap-2">
                                    <Checkbox
                                        id={`ds-${d.id}`}
                                        checked={selectedDatasets.includes(d.id)}
                                        onCheckedChange={() => handleDatasetToggle(d.id)}
                                    />
                                    <Label htmlFor={`ds-${d.id}`}>{d.name}</Label>
                                </div>
                            ))}
                        </div>
                    </div>

                    {selectedDatasets.length > 0 && (
                    <div className="space-y-2">
                            <Label>Выберите признаки для анализа</Label>
                            <div className="space-y-2 p-3 border rounded-lg max-h-60 overflow-y-auto">
                                {availableFeatures.map(feature => (
                                    <div key={feature.id} className="flex items-center gap-2">
                                        <Checkbox
                                            id={feature.id}
                                            checked={selectedFeatures.includes(feature.id)}
                                            onCheckedChange={() => handleFeatureToggle(feature.id)}
                                        />
                                        <Label htmlFor={feature.id} className="text-sm">{feature.label}</Label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Separator className="my-4" />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-semibold text-slate-800">Расширенный анализ</Label>
                        <p className="text-xs text-slate-500">Добавьте индексы, лаги и внешние факторы, чтобы углубить интерпретацию.</p>
                      </div>
                      <Badge variant="outline" className="rounded-full border-indigo-200 bg-indigo-50 text-indigo-700">
                        + взаимосвязи
                      </Badge>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Нормированные индексы</p>
                          <p className="text-xs text-slate-500">Пересчитываем показатели в индекс с базой 100.</p>
                        </div>
                        <Switch checked={advancedOptions.includeNormalized} onCheckedChange={toggleAdvancedOption("includeNormalized")} />
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Лаговые корреляции</p>
                          <p className="text-xs text-slate-500">Сравнение текущих значений с прошлым (t-1, t-3, t-12).</p>
                        </div>
                        <Switch checked={advancedOptions.includeLagged} onCheckedChange={toggleAdvancedOption("includeLagged")} />
                      </div>

                      {advancedOptions.includeLagged && (
                        <div className="space-y-1">
                          <Label htmlFor="lag-input" className="text-xs text-slate-500">Периоды лагов</Label>
                          <Input
                            id="lag-input"
                            value={lagInput}
                            onChange={(event) => setLagInput(event.target.value)}
                            placeholder="Например: 1,3,12"
                          />
                          <p className="text-[11px] text-slate-400">Укажите целые числа через запятую. Максимум 52 периода.</p>
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Перекрёстные метрики</p>
                          <p className="text-xs text-slate-500">Отношения и разницы между показателями разных источников.</p>
                        </div>
                        <Switch checked={advancedOptions.includeCrossDataset} onCheckedChange={toggleAdvancedOption("includeCrossDataset")} />
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Агрегированные KPI</p>
                          <p className="text-xs text-slate-500">Средние значения по выбранным признакам внутри одного источника.</p>
                        </div>
                        <Switch checked={advancedOptions.includeAggregates} onCheckedChange={toggleAdvancedOption("includeAggregates")} />
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Категориальные признаки</p>
                          <p className="text-xs text-slate-500">One-hot кодирование лидирующих категорий (регион, сегмент, продукт).</p>
                        </div>
                        <Switch checked={advancedOptions.includeCategoryEncoding} onCheckedChange={toggleAdvancedOption("includeCategoryEncoding")} />
                      </div>

                      {advancedOptions.includeCategoryEncoding && (
                        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                          <p className="text-xs font-medium text-slate-600">Выберите категориальные поля</p>
                          {availableCategoricalFeatures.length ? (
                            availableCategoricalFeatures.map((feature) => (
                              <div key={feature.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`cat-${feature.id}`}
                                  checked={selectedCategoricalFeatures.includes(feature.id)}
                                  onCheckedChange={() =>
                                    setSelectedCategoricalFeatures((prev) =>
                                      prev.includes(feature.id)
                                        ? prev.filter((id) => id !== feature.id)
                                        : [...prev, feature.id]
                                    )
                                  }
                                />
                                <Label htmlFor={`cat-${feature.id}`} className="text-xs text-slate-600">
                                  {feature.label}
                                </Label>
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-400">Для выбранных источников не найдено строковых полей.</p>
                          )}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">Внешние факторы</p>
                          <p className="text-xs text-slate-500">Пометить источники с макроэкономикой, погодой, событиями.</p>
                        </div>
                        <Switch checked={advancedOptions.includeExternalFactors} onCheckedChange={toggleAdvancedOption("includeExternalFactors")} />
                      </div>

                      {advancedOptions.includeExternalFactors && (
                        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                          <p className="text-xs font-medium text-slate-600">Отметьте внешние источники</p>
                          {selectedDatasets.length ? (
                            selectedDatasets.map((datasetId) => {
                              const dataset = datasetMap.get(datasetId);
                              return (
                                <div key={datasetId} className="flex items-center gap-2">
                                  <Checkbox
                                    id={`ext-${datasetId}`}
                                    checked={externalDatasets.includes(datasetId)}
                                    onCheckedChange={() =>
                                      setExternalDatasets((prev) =>
                                        prev.includes(datasetId)
                                          ? prev.filter((id) => id !== datasetId)
                                          : [...prev, datasetId]
                                      )
                                    }
                                  />
                                  <Label htmlFor={`ext-${datasetId}`} className="text-xs text-slate-600">
                                    {dataset?.name || datasetId}
                                  </Label>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-xs text-slate-400">Сначала выберите наборы данных для анализа.</p>
                          )}
                        </div>
                      )}
                    </div>

                    <Button onClick={handleCalculate} disabled={isCalculating || selectedFeatures.length < 2} className="w-full gap-2">
                        {isCalculating ? "Рассчитываем..." : "Рассчитать корреляцию"}
                    </Button>
                </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-0 bg-white/70 backdrop-blur-xl shadow-xl">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-slate-900">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        Корреляционный анализ (локальный расчёт)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {isCalculating && <Skeleton className="w-full h-64" />}
                    {!isCalculating && !result && (
                        <div className="text-center py-16 text-slate-500">Выберите данные и признаки для расчета.</div>
                    )}
                    {result && (
                        <div className="space-y-6">
                            <div className="overflow-x-auto">
                                <TooltipProvider delayDuration={150}>
                                    <table className="w-full border-collapse border border-slate-200 rounded-lg overflow-hidden">
                                        <thead>
                                            <tr className="bg-slate-50">
                                                <th className="p-3 border border-slate-200 font-medium align-bottom bg-white/80 sticky left-0 backdrop-blur-sm">Признак</th>
                                                {result.correlation_matrix.map(row => (
                                                    <th
                                                        key={row.feature}
                                                        className="p-3 border border-slate-200 text-[11px] font-semibold text-slate-600 align-bottom"
                                                    >
                                                        <div className="rotate-[-35deg] origin-left whitespace-nowrap">{row.feature}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.correlation_matrix.map(row => (
                                                <tr key={row.feature} className="relative">
                                                    <td className="p-3 border border-slate-200 font-medium bg-slate-50 sticky left-0 backdrop-blur-sm">
                                                        {row.feature}
                                                    </td>
                                                    {Object.keys(row.correlations).map(key => {
                                                        const value = row.correlations[key];
                                                        const { backgroundColor, color, descriptor } = getCellPresentation(value);
                                                        const isHighlighted = hoveredCell && (hoveredCell.row === row.feature || hoveredCell.column === key);

                                                        return (
                                                            <Tooltip key={key}>
                                                                <TooltipTrigger asChild>
                                                                    <td
                                                                        onMouseEnter={() => setHoveredCell({ row: row.feature, column: key })}
                                                                        onMouseLeave={() => setHoveredCell(null)}
                                                                        className={`p-3 border border-slate-200 text-center text-xs font-semibold font-mono transition-shadow duration-200 ${isHighlighted ? "ring-2 ring-indigo-400 shadow-lg" : "shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)]"}`}
                                                                        style={{ backgroundColor, color }}
                                                                    >
                                                                        {value.toFixed(2)}
                                                                    </td>
                                                                </TooltipTrigger>
                                                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                                                    <div className="font-semibold text-slate-900 mb-1">{row.feature} ↔ {key}</div>
                                                                    <p className="text-slate-600">{descriptor}</p>
                                                                    <p className="text-slate-500 mt-1">Коэффициент: {value.toFixed(3)}</p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        );
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </TooltipProvider>
                            </div>

                            {result.meta && (
                              <div className="rounded-lg border border-indigo-100 bg-indigo-50/70 p-4 space-y-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                                    Профиль признаков
                                  </Badge>
                                  <span className="text-xs text-indigo-700">
                                    Всего переменных: {result.meta.featureCount}
                                  </span>
                                </div>
                                {result.meta.featureOverview && (
                                  <div className="flex flex-wrap gap-3 text-xs text-indigo-900">
                                    <span>Базовых: {result.meta.featureOverview.base}</span>
                                    <span>Производных: {result.meta.featureOverview.derived}</span>
                                  </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(result.meta.countByType || {}).map(([type, count]) => (
                                    <Badge
                                      key={type}
                                      variant="outline"
                                      className="border-indigo-200 bg-white/70 text-indigo-700"
                                    >
                                      {FEATURE_TYPE_LABELS[type] || type}: {count}
                                    </Badge>
                                  ))}
                                </div>
                                {result.meta.externalFactors?.length > 0 && (
                                  <div className="text-xs text-slate-600">
                                    Внешние факторы: {result.meta.externalFactors.map((label) => `«${label}»`).join(", ")}
                                  </div>
                                )}
                                {result.meta.laggedFeatures?.length > 0 && (
                                  <div className="text-xs text-slate-600">
                                    Лаги: {result.meta.laggedFeatures
                                      .map((item) => `${item.label} (t-${item.lag})`)
                                      .join(", ")}
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-[auto_1fr] bg-white/60 border border-slate-200 rounded-lg p-4">
                                <div className="text-sm font-semibold text-slate-700">Легенда</div>
                                <div className="space-y-2">
                                    <div className="h-3 w-full bg-gradient-to-r from-red-200 via-slate-100 to-emerald-200 rounded-full relative">
                                        <span className="absolute left-0 -top-5 text-[10px] uppercase tracking-wide text-slate-500">-1</span>
                                        <span className="absolute left-1/2 -translate-x-1/2 -top-5 text-[10px] uppercase tracking-wide text-slate-500">0</span>
                                        <span className="absolute right-0 -top-5 text-[10px] uppercase tracking-wide text-slate-500">+1</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
                                        {[
                                            { label: "Практически линейная", color: "bg-emerald-600 text-white" },
                                            { label: "Сильная", color: "bg-emerald-300 text-emerald-900" },
                                            { label: "Умеренная", color: "bg-emerald-100 text-emerald-700" },
                                            { label: "Слабая/нет", color: "bg-slate-100 text-slate-600" },
                                            { label: "Сильная отрицательная", color: "bg-red-300 text-red-900" },
                                            { label: "Практически противоположная", color: "bg-red-500 text-white" }
                                        ].map(item => (
                                            <span key={item.label} className={`px-2 py-1 rounded-full font-medium ${item.color}`}>
                                                {item.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            {result.strongest_correlations && result.strongest_correlations.length > 0 && (
                                <div className="bg-blue-50 rounded-lg p-4">
                                    <h4 className="font-semibold mb-3 text-blue-900">Наиболее сильные корреляции:</h4>
                                    <div className="space-y-2">
                                        {result.strongest_correlations.map((corr, i) => {
                                            const { backgroundColor, color } = getCellPresentation(corr.correlation);
                                            return (
                                                <div key={i} className="bg-white rounded-lg p-3 border border-blue-100">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-medium text-sm">{corr.feature1} ↔ {corr.feature2}</span>
                                                        <span
                                                            className="font-bold text-sm px-2 py-1 rounded shadow-sm"
                                                            style={{ backgroundColor, color }}
                                                        >
                                                            {corr.correlation.toFixed(3)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-600">{corr.interpretation}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            
                            <div className="bg-slate-50 rounded-lg p-4">
                                <h4 className="font-semibold mb-3 text-slate-900">Ключевые выводы:</h4>
                                <ul className="list-disc list-inside space-y-2 text-sm text-slate-700">
                                    {result.insights.map((insight, i) => <li key={i}>{insight}</li>)}
                                </ul>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
