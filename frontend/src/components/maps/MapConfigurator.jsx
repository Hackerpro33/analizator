import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Compass, Save, X, RefreshCw } from "lucide-react";
import { parseNumberLike } from "@/utils/numberUtils";
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";

const LAT_KEYWORDS = ['lat', 'latitude', 'широт', 'широта', 'y_coord', 'y coordinate'];
const LON_KEYWORDS = ['lon', 'lng', 'longitude', 'долгот', 'долгота', 'x_coord', 'x coordinate'];
const TIME_KEYWORDS = ['date', 'time', 'period', 'год', 'месяц', 'квартал', 'недел', 'timestamp', 'year', 'month', 'quarter'];

const DEFAULT_CONFIG = {
  title: '',
  dataset_id: '',
  lat_column: '',
  lon_column: '',
  value_column: '',
  overlay_type: 'none',
  time_column: '',
  base_period: '',
  comparison_period: '',
  demography_population_column: '',
  demography_income_column: '',
  demography_unemployment_column: '',
  spatial_metric_column: '',
  spatial_neighbor_count: 6,
  trend_metric_column: '',
  trend_periods: 4,
  hotspot_metric_column: '',
  hotspot_method: 'dbscan',
  logistics_corridor_column: '',
  logistics_travel_time_column: '',
  logistics_service_radius_column: '',
  climate_temperature_column: '',
  climate_precipitation_column: '',
  climate_risk_column: '',
};

const parseNumber = (value) => parseNumberLike(value);

const isNumericType = (type) => {
  const normalized = (type || '').toLowerCase();
  return ['number', 'float', 'double', 'decimal', 'integer', 'int', 'long'].includes(normalized);
};

const isTemporalType = (type) => {
  const normalized = (type || '').toLowerCase();
  return ['date', 'datetime', 'timestamp', 'time', 'year', 'month'].some((token) => normalized.includes(token));
};

export default function MapConfigurator({
  datasets = [],
  onSave,
  onCancel,
  initialConfig,
  forecastData,
  correlationData,
  isEmbedded,
  onConfigChange,
}) {
  const [config, setConfig] = useState(initialConfig || DEFAULT_CONFIG);
  const [selectedDataset, setSelectedDataset] = useState(null);

  const datasetSamples = useMemo(() => selectedDataset?.sample_data || [], [selectedDataset]);

  const numericColumns = useMemo(() => {
    if (!selectedDataset) return [];
    const rows = datasetSamples;
    return (selectedDataset.columns || []).filter((col) => {
      if (isNumericType(col.type)) {
        return true;
      }
      if (!rows.length) {
        return false;
      }
      const numericValues = rows
        .map((row) => parseNumber(row[col.name]))
        .filter((value) => value !== null);
      if (!numericValues.length) {
        return false;
      }
      return numericValues.length / rows.length >= 0.5;
    });
  }, [selectedDataset, datasetSamples]);

  const stringColumns = useMemo(() => {
    if (!selectedDataset) return [];
    const rows = datasetSamples;
    return (selectedDataset.columns || []).filter((col) => {
      if (isNumericType(col.type) || isTemporalType(col.type)) {
        return false;
      }
      if (!rows.length) {
        return true;
      }
      const values = rows
        .map((row) => row?.[col.name])
        .filter((value) => value !== null && value !== undefined && value !== '');
      if (!values.length) {
        return false;
      }
      const uniqueCount = new Set(values.map((value) => String(value))).size;
      return uniqueCount <= values.length * 0.8;
    });
  }, [selectedDataset, datasetSamples]);

  const timeColumns = useMemo(() => {
    if (!selectedDataset) return [];
    const rows = datasetSamples;
    return (selectedDataset.columns || []).filter((col) => {
      const lowerName = (col.name || '').toLowerCase();
      const hasKeyword = TIME_KEYWORDS.some((kw) => lowerName.includes(kw));
      if (isTemporalType(col.type) || hasKeyword) {
        return true;
      }
      if (!rows.length) {
        return false;
      }
      const values = rows
        .map((row) => row?.[col.name])
        .filter((value) => value !== null && value !== undefined && value !== '');
      if (!values.length) {
        return false;
      }
      const stringRatio = values.filter((value) => typeof value === 'string' || typeof value === 'number').length / values.length;
      return stringRatio >= 0.6;
    });
  }, [selectedDataset, datasetSamples]);

  const availablePeriods = useMemo(() => {
    if (!selectedDataset || !config.time_column) {
      return [];
    }

    const seen = new Set();
    const periods = [];
    datasetSamples.forEach((row) => {
      const rawValue = row?.[config.time_column];
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        return;
      }
      const key = String(rawValue);
      if (!seen.has(key)) {
        seen.add(key);
        periods.push(key);
      }
    });

    periods.sort((a, b) => a.localeCompare(b, 'ru-RU', { numeric: true, sensitivity: 'base' }));
    return periods;
  }, [selectedDataset, datasetSamples, config.time_column]);

  useEffect(() => {
    const incomingConfig = initialConfig || DEFAULT_CONFIG;
    setConfig((prev) => ({ ...prev, ...incomingConfig }));

    if (incomingConfig.dataset_id) {
      handleDatasetChange(incomingConfig.dataset_id, incomingConfig);
    } else {
      setSelectedDataset(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialConfig, datasets]);

  const emitConfig = (nextConfig) => {
    setConfig((prev) => {
      const prevString = JSON.stringify(prev);
      const nextString = JSON.stringify(nextConfig);
      if (onConfigChange && prevString !== nextString) {
        onConfigChange(nextConfig);
      }
      return nextConfig;
    });
  };

  useEffect(() => {
    if (!config.time_column && (config.base_period || config.comparison_period)) {
      emitConfig({
        ...config,
        base_period: '',
        comparison_period: '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.time_column, config.base_period, config.comparison_period]);

  useEffect(() => {
    if (!config.time_column || availablePeriods.length === 0) {
      return;
    }

    let changed = false;
    const nextConfig = { ...config };

    if (!config.base_period || !availablePeriods.includes(config.base_period)) {
      nextConfig.base_period = availablePeriods[0];
      changed = true;
    }

    const currentComparison = config.comparison_period;
    const needsComparisonUpdate =
      !currentComparison ||
      !availablePeriods.includes(currentComparison) ||
      currentComparison === nextConfig.base_period;

    if (needsComparisonUpdate) {
      const fallback = [...availablePeriods].reverse().find((period) => period !== nextConfig.base_period);
      const resolvedFallback = fallback || '';
      if (resolvedFallback !== currentComparison) {
        nextConfig.comparison_period = resolvedFallback;
        changed = true;
      }
    }

    if (changed) {
      emitConfig(nextConfig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.time_column, availablePeriods, config.base_period, config.comparison_period]);

  const detectCoordinateColumns = (dataset, currentConfig = {}) => {
    if (!dataset) {
      return { lat: '', lon: '', value: '' };
    }

    const rows = dataset.sample_data || [];
    const columns = dataset.columns || [];

    const numericCols = columns.filter((col) =>
      isNumericType(col.type) ||
      (rows.length > 0 && rows.some((row) => parseNumber(row[col.name]) !== null))
    );

    const evaluateColumn = (colName, type) => {
      const keywords = type === 'lat' ? LAT_KEYWORDS : LON_KEYWORDS;
      const lowerName = colName.toLowerCase();
      const hasKeyword = keywords.some((kw) => lowerName.includes(kw));
      const rangeCheck = type === 'lat'
        ? (value) => value >= -90 && value <= 90
        : (value) => value >= -180 && value <= 180;

      const values = rows
        .map((row) => parseNumber(row[colName]))
        .filter((value) => value !== null);

      const rangeScore = values.length
        ? values.filter(rangeCheck).length / values.length
        : 0;

      let score = rangeScore;
      if (hasKeyword) {
        score += 1.5;
      }
      if (rangeScore >= 0.9) {
        score += 0.5;
      }
      return score;
    };

    const resolveCoordinate = (type, excludeColumn) => {
      const existing = type === 'lat' ? currentConfig.lat_column : currentConfig.lon_column;
      if (existing) {
        return existing;
      }

      let bestCandidate = '';
      let bestScore = 0;
      numericCols.forEach((col) => {
        if (col.name === excludeColumn) return;
        const score = evaluateColumn(col.name, type);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = col.name;
        }
      });

      if (!bestCandidate && numericCols.length) {
        const fallback = numericCols.find((col) => col.name !== excludeColumn);
        return fallback ? fallback.name : '';
      }

      return bestCandidate;
    };

    const lat = resolveCoordinate('lat');
    const lon = resolveCoordinate('lon', lat);

    const valueColumn = currentConfig.value_column
      ? currentConfig.value_column
      : (() => {
          const candidate = numericCols.find(
            (col) => col.name !== lat && col.name !== lon,
          );
          return candidate ? candidate.name : '';
        })();

    return {
      lat,
      lon,
      value: valueColumn,
    };
  };

  const detectTimeColumn = (dataset, currentConfig = {}) => {
    if (!dataset) {
      return '';
    }

    if (currentConfig.time_column) {
      return currentConfig.time_column;
    }

    const rows = dataset.sample_data || [];
    const columns = dataset.columns || [];

    let bestCandidate = '';
    let bestScore = 0;

    columns.forEach((col) => {
      const lowerName = (col.name || '').toLowerCase();
      const hasKeyword = TIME_KEYWORDS.some((kw) => lowerName.includes(kw));
      const temporalType = isTemporalType(col.type);

      const values = rows
        .map((row) => row?.[col.name])
        .filter((value) => value !== null && value !== undefined && value !== '');

      let score = 0;
      if (temporalType) {
        score += 2;
      }
      if (hasKeyword) {
        score += 1.5;
      }
      if (values.length) {
        const uniqueRatio = new Set(values.map((value) => String(value))).size / values.length;
        if (uniqueRatio >= 0.5) {
          score += 0.5;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = col.name;
      }
    });

    return bestCandidate;
  };

  const extractUniquePeriods = (rows, column) => {
    if (!column) {
      return [];
    }

    const seen = new Set();
    const periods = [];

    rows.forEach((row) => {
      const value = row?.[column];
      if (value === null || value === undefined || value === '') {
        return;
      }
      const key = String(value);
      if (!seen.has(key)) {
        seen.add(key);
        periods.push(key);
      }
    });

    periods.sort((a, b) => a.localeCompare(b, 'ru-RU', { numeric: true, sensitivity: 'base' }));
    return periods;
  };

  const handleDatasetChange = (datasetId, incomingConfig) => {
    const dataset = datasets.find((d) => d.id === datasetId);
    setSelectedDataset(dataset || null);

    if (!dataset) {
      if (datasetId === 'sample') {
        emitConfig({
          ...(incomingConfig || config),
          dataset_id: datasetId,
        });
        return;
      }

      const resetConfig = {
        ...(incomingConfig || config),
        dataset_id: datasetId,
        lat_column: '',
        lon_column: '',
        value_column: '',
        time_column: '',
        base_period: '',
        comparison_period: '',
      };
      emitConfig(resetConfig);
      return;
    }

    const nextConfig = {
      ...(incomingConfig || config),
      dataset_id: datasetId,
    };

    if (!nextConfig.title && dataset.name) {
      nextConfig.title = dataset.name;
    }

    const detected = detectCoordinateColumns(dataset, nextConfig);
    const detectedTimeColumn = detectTimeColumn(dataset, nextConfig);
    const uniquePeriods = extractUniquePeriods(dataset.sample_data || [], detectedTimeColumn);

    const basePeriod =
      nextConfig.base_period && uniquePeriods.includes(nextConfig.base_period)
        ? nextConfig.base_period
        : uniquePeriods[0] || '';

    const latestPeriod = uniquePeriods.length ? uniquePeriods[uniquePeriods.length - 1] : '';

    let comparisonPeriod =
      nextConfig.comparison_period && uniquePeriods.includes(nextConfig.comparison_period)
        ? nextConfig.comparison_period
        : latestPeriod;

    if (comparisonPeriod === basePeriod && uniquePeriods.length > 1) {
      comparisonPeriod = uniquePeriods[uniquePeriods.length - 1];
      if (comparisonPeriod === basePeriod) {
        comparisonPeriod = uniquePeriods.find((period) => period !== basePeriod) || '';
      }
    }

    const mergedConfig = {
      ...nextConfig,
      lat_column: detected.lat,
      lon_column: detected.lon,
      value_column: detected.value,
      time_column: detectedTimeColumn || '',
      base_period: detectedTimeColumn ? basePeriod : '',
      comparison_period: detectedTimeColumn ? comparisonPeriod : '',
    };

    emitConfig(mergedConfig);
  };

  const handleInputChange = (field, value) => {
    let normalizedValue = value === '__none__' ? '' : value;
    if (field === 'title') {
      normalizedValue = clampName(normalizedValue);
    }
    const updatedConfig = {
      ...config,
      [field]: normalizedValue,
    };
    emitConfig(updatedConfig);
  };

  const handleSubmit = () => {
    if (!config.dataset_id || !config.lat_column || !config.lon_column) {
      alert("Пожалуйста, выберите набор данных и столбцы широты/долготы.");
      return;
    }
    onSave(config);
  };

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl h-full">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <Compass className="w-5 h-5 text-purple-500" />
          Настройка карты
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <Label htmlFor="map-title" className="elegant-text">Название карты</Label>
          <Input
            id="map-title"
            placeholder="например, Расположение магазинов"
            value={config.title}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => handleInputChange('title', e.target.value)}
            className="elegant-text"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="map-dataset" className="elegant-text">Набор данных</Label>
          <Select onValueChange={(value) => handleDatasetChange(value)} value={config.dataset_id || undefined}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите набор данных" />
            </SelectTrigger>
            <SelectContent>
              {datasets.map(dataset => (
                <SelectItem key={dataset.id} value={dataset.id} className="elegant-text">
                  {dataset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedDataset && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lat-column" className="elegant-text">Столбец широты</Label>
                <Select onValueChange={(value) => handleInputChange('lat_column', value)} value={config.lat_column || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Широта" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map(col => (
                      <SelectItem key={col.name} value={col.name} className="elegant-text">
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lon-column" className="elegant-text">Столбец долготы</Label>
                <Select onValueChange={(value) => handleInputChange('lon_column', value)} value={config.lon_column || undefined}>
                  <SelectTrigger>
                    <SelectValue placeholder="Долгота" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map(col => (
                      <SelectItem key={col.name} value={col.name} className="elegant-text">
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="value-column" className="elegant-text">Столбец значений для маркеров (опционально)</Label>
              <Select onValueChange={(value) => handleInputChange('value_column', value)} value={config.value_column || undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец значений" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="elegant-text">Без значений</SelectItem>
                  {numericColumns.map(col => (
                    <SelectItem key={col.name} value={col.name} className="elegant-text">
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(timeColumns.length > 0 || config.time_column) && (
              <div className="space-y-2">
                <Label className="elegant-text">Столбец периода (для сравнения по времени)</Label>
                <Select
                  onValueChange={(value) => handleInputChange('time_column', value)}
                  value={config.time_column || '__none__'}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите столбец времени" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="elegant-text">Без периода</SelectItem>
                    {timeColumns.map((col) => (
                      <SelectItem key={col.name} value={col.name} className="elegant-text">
                        {col.name}
                      </SelectItem>
                    ))}
                    {config.time_column && !timeColumns.some((col) => col.name === config.time_column) && (
                      <SelectItem value={config.time_column} className="elegant-text">
                        {config.time_column}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500">
                  Укажите поле с датами, периодами или временными метками, чтобы видеть рост и снижение на карте.
                </p>
              </div>
            )}

            {config.time_column && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="elegant-text">Базовый период</Label>
                  <Select
                    onValueChange={(value) => handleInputChange('base_period', value)}
                    value={config.base_period || undefined}
                    disabled={!availablePeriods.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите период" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePeriods.map((period) => (
                        <SelectItem key={period} value={period} className="elegant-text">
                          {period}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="elegant-text">Сравниваемый период</Label>
                  <Select
                    onValueChange={(value) => handleInputChange('comparison_period', value)}
                    value={config.comparison_period || undefined}
                    disabled={availablePeriods.length <= 1}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={availablePeriods.length > 1 ? 'Выберите период' : 'Недостаточно значений'} />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePeriods
                        .filter((period) => availablePeriods.length === 1 || period !== config.base_period)
                        .map((period) => (
                          <SelectItem key={period} value={period} className="elegant-text">
                            {period}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="elegant-text">Наложение данных</Label>
              <Select onValueChange={(value) => handleInputChange('overlay_type', value)} value={config.overlay_type}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите тип наложения" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="elegant-text">Без наложения</SelectItem>
                  <SelectItem value="heatmap" className="elegant-text">Тепловая карта</SelectItem>
                  <SelectItem value="clusters" className="elegant-text">Кластеры</SelectItem>
                  <SelectItem value="demography" className="elegant-text">Демография и экономика</SelectItem>
                  <SelectItem value="spatial" className="elegant-text">Пространственные зависимости</SelectItem>
                  <SelectItem value="trend" className="elegant-text">Динамика во времени</SelectItem>
                  <SelectItem value="hotspots" className="elegant-text">Горячие точки</SelectItem>
                  <SelectItem value="logistics" className="elegant-text">Логистика и сервис</SelectItem>
                  <SelectItem value="climate" className="elegant-text">Погода и климат</SelectItem>
                  {forecastData && (
                    <SelectItem value="forecast" className="elegant-text">Данные прогноза</SelectItem>
                  )}
                  {correlationData && (
                    <SelectItem value="correlation" className="elegant-text">Корреляционные данные</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {config.overlay_type === 'demography' && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="elegant-text">Плотность населения</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.demography_population_column || undefined}
                    onValueChange={(value) => handleInputChange('demography_population_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`pop-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Средний доход</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.demography_income_column || undefined}
                    onValueChange={(value) => handleInputChange('demography_income_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`income-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Безработица</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.demography_unemployment_column || undefined}
                    onValueChange={(value) => handleInputChange('demography_unemployment_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`unemp-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {config.overlay_type === 'spatial' && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-2">
                  <Label className="elegant-text">Показатель для пространственного веса</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.spatial_metric_column || config.value_column || undefined}
                    onValueChange={(value) => handleInputChange('spatial_metric_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`spatial-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Соседей для анализа (k)</Label>
                  <Input
                    type="number"
                    min={3}
                    max={15}
                    value={config.spatial_neighbor_count ?? 6}
                    onChange={(event) => handleInputChange('spatial_neighbor_count', Number(event.target.value))}
                  />
                </div>
              </div>
            )}

            {config.overlay_type === 'trend' && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="elegant-text">Метрика для тренда</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.trend_metric_column || config.value_column || undefined}
                    onValueChange={(value) => handleInputChange('trend_metric_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`trend-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Окно сезонности (периодов)</Label>
                  <Input
                    type="number"
                    min={2}
                    max={24}
                    value={config.trend_periods ?? 4}
                    onChange={(event) => handleInputChange('trend_periods', Number(event.target.value))}
                  />
                </div>
              </div>
            )}

            {config.overlay_type === 'hotspots' && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label className="elegant-text">Метрика для кластеризации</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.hotspot_metric_column || config.value_column || undefined}
                    onValueChange={(value) => handleInputChange('hotspot_metric_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`hotspot-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Метод выявления</Label>
                  <Select
                    value={config.hotspot_method || 'dbscan'}
                    onValueChange={(value) => handleInputChange('hotspot_method', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите метод" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dbscan" className="elegant-text">DBSCAN (плотность)</SelectItem>
                      <SelectItem value="kmeans" className="elegant-text">k-means (k=5)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {config.overlay_type === 'logistics' && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1 md:col-span-1">
                  <Label className="elegant-text">Коридор / маршрут</Label>
                  <Select
                    disabled={!stringColumns.length}
                    value={config.logistics_corridor_column || undefined}
                    onValueChange={(value) => handleInputChange('logistics_corridor_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={stringColumns.length ? 'Выберите столбец' : 'Нет текстовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {stringColumns.map((col) => (
                        <SelectItem key={`logistics-corridor-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Время в пути (мин)</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.logistics_travel_time_column || undefined}
                    onValueChange={(value) => handleInputChange('logistics_travel_time_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`travel-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Радиус обслуживания (км)</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.logistics_service_radius_column || undefined}
                    onValueChange={(value) => handleInputChange('logistics_service_radius_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`radius-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {config.overlay_type === 'climate' && (
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="elegant-text">Температура</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.climate_temperature_column || undefined}
                    onValueChange={(value) => handleInputChange('climate_temperature_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`temp-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Осадки</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.climate_precipitation_column || undefined}
                    onValueChange={(value) => handleInputChange('climate_precipitation_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`prec-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="elegant-text">Риск ЧС</Label>
                  <Select
                    disabled={!numericColumns.length}
                    value={config.climate_risk_column || undefined}
                    onValueChange={(value) => handleInputChange('climate_risk_column', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={numericColumns.length ? 'Выберите столбец' : 'Нет числовых полей'} />
                    </SelectTrigger>
                    <SelectContent>
                      {numericColumns.map((col) => (
                        <SelectItem key={`risk-${col.name}`} value={col.name} className="elegant-text">
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

        </>
      )}

        <div className="flex gap-3 pt-6">
          {isEmbedded ? (
            <Button onClick={handleSubmit} className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 gap-2 elegant-text">
              <RefreshCw className="w-4 h-4" /> Обновить карту
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel} className="flex-1 gap-2 elegant-text">
                <X className="w-4 h-4" /> Отмена
              </Button>
              <Button onClick={handleSubmit} className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 gap-2 elegant-text">
                <Save className="w-4 h-4" /> Сохранить карту
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
