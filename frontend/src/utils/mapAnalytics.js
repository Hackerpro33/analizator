import { findFirstValue, findNameField, parseCoordinate, parseNumericValue } from "./mapUtils";

const LAT_CANDIDATES = ["lat", "latitude", "Lat", "Latitude"];
const LON_CANDIDATES = ["lon", "lng", "long", "longitude", "Lon", "Lng"];
const VALUE_CANDIDATES = [
  "value",
  "metric",
  "amount",
  "total",
  "count",
  "crime",
  "crimes",
  "incidents",
  "incident_count",
  "crime_rate",
  "severity",
  "violations",
];
const FORECAST_CANDIDATES = ["forecast", "prediction", "expected"];
const CORRELATION_CANDIDATES = ["correlation", "corr", "r", "pearson"];
const CATEGORY_CANDIDATES = ["category", "segment", "type", "class"];

const toNumber = (value) => {
  const parsed = parseNumericValue(value);
  return parsed === null ? null : parsed;
};

const buildCandidates = (preferred, defaults) => {
  const list = [];
  if (preferred && !defaults.includes(preferred)) {
    list.push(preferred);
  }
  return [...list, ...defaults];
};

const normalizePoint = (point, config) => {
  const latCandidates = buildCandidates(config?.lat_column, LAT_CANDIDATES);
  const lonCandidates = buildCandidates(config?.lon_column, LON_CANDIDATES);
  const valueCandidates = buildCandidates(config?.value_column, VALUE_CANDIDATES);

  const latRaw = findFirstValue(point, latCandidates);
  const lonRaw = findFirstValue(point, lonCandidates);
  const valueRaw = findFirstValue(point, valueCandidates);
  const forecastRaw = findFirstValue(point, buildCandidates(config?.forecast_column, FORECAST_CANDIDATES));
  const correlationRaw = findFirstValue(point, buildCandidates(config?.correlation_column, CORRELATION_CANDIDATES));
  const categoryRaw = findFirstValue(point, buildCandidates(config?.category_column, CATEGORY_CANDIDATES));

  const lat = parseCoordinate(latRaw);
  const lon = parseCoordinate(lonRaw);
  const value = toNumber(valueRaw);
  const forecast = toNumber(forecastRaw);
  const correlation = toNumber(correlationRaw);
  const category = categoryRaw || null;
  const name = findNameField(point) || point?.name || null;

  return {
    original: point,
    lat,
    lon,
    value,
    forecast,
    correlation,
    category,
    name,
  };
};

const getOriginalValue = (normalizedPoint, column, fallbackKeys = []) => {
  if (!normalizedPoint) return null;
  const source = normalizedPoint.original || {};
  if (column && source[column] !== undefined && source[column] !== null) {
    return source[column];
  }
  for (const key of fallbackKeys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
    if (normalizedPoint[key] !== undefined && normalizedPoint[key] !== null) {
      return normalizedPoint[key];
    }
  }
  return null;
};

const aggregateCategories = (points) => {
  const map = new Map();
  for (const point of points) {
    const category = point.category || "Без категории";
    map.set(category, (map.get(category) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
};

const calcAverage = (values) => {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
};

const percentile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
};

const buildRiskProfile = (points) => {
  if (!points.length) {
    return { hasRisk: false, distribution: [], hotspots: [], pressureIndex: null };
  }

  const values = points.map((point) => point.value).filter((value) => value !== null);
  if (!values.length) {
    return { hasRisk: false, distribution: [], hotspots: [], pressureIndex: null };
  }

  const highThreshold = percentile(values, 0.75);
  const mediumThreshold = percentile(values, 0.5);

  const classify = (value) => {
    if (value === null) return "Не определено";
    if (highThreshold !== null && value >= highThreshold) return "Высокий";
    if (mediumThreshold !== null && value >= mediumThreshold) return "Средний";
    return "Низкий";
  };

  const distributionMap = new Map();
  const highValues = [];
  const enrichedPoints = points.map((point) => {
    const riskLevel = classify(point.value);
    distributionMap.set(riskLevel, (distributionMap.get(riskLevel) || 0) + 1);
    if (riskLevel === "Высокий" && point.value !== null) {
      highValues.push(point.value);
    }
    return {
      ...point,
      riskLevel,
    };
  });

  const hotspots = enrichedPoints
    .filter((point) => point.riskLevel === "Высокий")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 5)
    .map((point) => ({
      name: point.name || "Без названия",
      value: point.value,
      riskLevel: point.riskLevel,
      lat: point.lat,
      lon: point.lon,
    }));

  const averageValue = calcAverage(values);
  const averageHigh = calcAverage(highValues);
  const pressureIndex =
    averageValue && averageHigh
      ? (averageHigh - averageValue) / Math.abs(averageValue)
      : null;

  const distribution = Array.from(distributionMap.entries())
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => {
      const order = ["Высокий", "Средний", "Низкий", "Не определено"];
      return order.indexOf(a.level) - order.indexOf(b.level);
    });

  return {
    hasRisk: hotspots.length > 0,
    distribution,
    hotspots,
    pressureIndex,
    thresholds: {
      high: highThreshold,
      medium: mediumThreshold,
    },
  };
};

const pickExtremePoint = (points, comparator) => {
  return points.reduce((acc, point) => {
    if (!point.value && point.value !== 0) return acc;
    if (!acc) return point;
    return comparator(point.value, acc.value) ? point : acc;
  }, null);
};

const buildSpatialNeighborMap = (points, config) => {
  const metricColumn = config?.spatial_metric_column || config?.value_column;
  if (!metricColumn) {
    return null;
  }

  const entries = points
    .map((point, index) => ({
      index,
      lat: point.lat,
      lon: point.lon,
      metric: toNumber(getOriginalValue(point, metricColumn, ['value', 'metric'])),
      name: point.name || findNameField(point.original) || `Локация ${index + 1}`,
    }))
    .filter((entry) => entry.lat !== null && entry.lon !== null && entry.metric !== null);

  if (entries.length < 3) {
    return null;
  }

  const neighborCount = Math.max(
    3,
    Math.min(Number(config?.spatial_neighbor_count) || 6, entries.length - 1)
  );

  const map = new Map();

  entries.forEach((entry, idx) => {
    const neighbors = entries
      .filter((_, neighborIdx) => neighborIdx !== idx)
      .map((other) => ({
        distance: Math.hypot(entry.lat - other.lat, entry.lon - other.lon),
        metric: other.metric,
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, neighborCount);

    if (!neighbors.length) {
      return;
    }

    const neighborAverage =
      neighbors.reduce((sum, neighbor) => sum + neighbor.metric, 0) / neighbors.length;
    const deviation = entry.metric - neighborAverage;
    const intensity = neighborAverage !== 0 ? deviation / Math.abs(neighborAverage) : null;

    map.set(entry.index, { neighborAverage, deviation, intensity, name: entry.name });
  });

  return map.size ? map : null;
};

const summarizeDemography = (points, config) => {
  const entries = points.map((point) => ({
    name: point.name || findNameField(point.original) || 'Без названия',
    density: toNumber(getOriginalValue(point, config?.demography_population_column, ['population_density', 'density'])),
    income: toNumber(getOriginalValue(point, config?.demography_income_column, ['average_income', 'income'])),
    unemployment: toNumber(
      getOriginalValue(point, config?.demography_unemployment_column, ['unemployment_rate'])
    ),
  }));

  const densities = entries.filter((entry) => entry.density !== null);
  const incomes = entries.filter((entry) => entry.income !== null);
  const unemployment = entries.filter((entry) => entry.unemployment !== null);

  if (!densities.length && !incomes.length && !unemployment.length) {
    return { hasData: false };
  }

  const averageDensity = densities.length ? calcAverage(densities.map((entry) => entry.density)) : null;
  const averageIncome = incomes.length ? calcAverage(incomes.map((entry) => entry.income)) : null;
  const averageUnemployment =
    unemployment.length ? calcAverage(unemployment.map((entry) => entry.unemployment)) : null;

  const topDensity = densities.length
    ? [...densities].sort((a, b) => b.density - a.density)[0]
    : null;
  const lowestUnemployment = unemployment.length
    ? [...unemployment].sort((a, b) => a.unemployment - b.unemployment)[0]
    : null;

  return {
    hasData: true,
    averageDensity,
    averageIncome,
    averageUnemployment,
    topDensity,
    lowestUnemployment,
  };
};

const summarizeSpatial = (points, config) => {
  const neighborMap = buildSpatialNeighborMap(points, config);
  if (!neighborMap) {
    return { hasData: false };
  }

  const deviations = [];
  neighborMap.forEach((stats, index) => {
    if (stats.deviation === null || Number.isNaN(stats.deviation)) {
      return;
    }
    const point = points[index];
    deviations.push({
      name: stats.name || point.name || findNameField(point.original) || `Локация ${index + 1}`,
      deviation: stats.deviation,
      intensity: stats.intensity,
      neighborAverage: stats.neighborAverage,
    });
  });

  if (!deviations.length) {
    return { hasData: false };
  }

  const topOutlier = [...deviations].sort((a, b) => Math.abs(b.deviation) - Math.abs(a.deviation))[0];
  const averageIntensity = calcAverage(
    deviations
      .map((entry) => (entry.intensity !== null && Number.isFinite(entry.intensity) ? Math.abs(entry.intensity) : null))
      .filter((value) => value !== null)
  );

  return {
    hasData: true,
    topOutlier,
    averageIntensity,
    neighborCount: Math.max(3, Math.min(Number(config?.spatial_neighbor_count) || 6, deviations.length)),
  };
};

const summarizeTrend = (points, _config) => {
  const entries = points.map((point) => ({
    name: point.name || findNameField(point.original) || 'Без названия',
    change: toNumber(getOriginalValue(point, null, ['trend_change', 'change_rate', 'growth_rate'])),
    volatility: toNumber(getOriginalValue(point, null, ['trend_volatility', 'volatility_level'])),
  }));

  const changes = entries.filter((entry) => entry.change !== null);
  const volatilities = entries.filter((entry) => entry.volatility !== null);

  if (!changes.length && !volatilities.length) {
    return { hasData: false };
  }

  const averageChange = changes.length ? calcAverage(changes.map((entry) => entry.change)) : null;
  const averageVolatility = volatilities.length
    ? calcAverage(volatilities.map((entry) => entry.volatility))
    : null;
  const topGrowth = changes.length
    ? [...changes].sort((a, b) => b.change - a.change)[0]
    : null;
  const topDrop = changes.length
    ? [...changes].sort((a, b) => a.change - b.change)[0]
    : null;

  return {
    hasData: true,
    averageChange,
    averageVolatility,
    topGrowth,
    topDrop,
  };
};

const summarizeHotspot = (points, config) => {
  const entries = points.map((point) => ({
    name: point.name || findNameField(point.original) || 'Без названия',
    metric: toNumber(
      getOriginalValue(point, config?.hotspot_metric_column || config?.value_column, ['incident_count', 'value'])
    ),
    change: toNumber(getOriginalValue(point, null, ['incident_change', 'change_percent'])),
  }));

  const metrics = entries.filter((entry) => entry.metric !== null);
  if (!metrics.length) {
    return { hasData: false };
  }

  const total = metrics.reduce((sum, entry) => sum + entry.metric, 0);
  const topIncident = [...metrics].sort((a, b) => b.metric - a.metric)[0];
  const growthLeaders = entries
    .filter((entry) => entry.metric !== null && entry.change !== null)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0))
    .slice(0, 3);

  return {
    hasData: true,
    total,
    topIncident,
    growthLeaders,
  };
};

const summarizeLogistics = (points, config) => {
  const entries = points.map((point) => ({
    name: point.name || findNameField(point.original) || 'Без названия',
    corridor: getOriginalValue(point, config?.logistics_corridor_column, ['logistics_corridor', 'corridor', 'route']),
    travel: toNumber(
      getOriginalValue(point, config?.logistics_travel_time_column, ['travel_time_minutes', 'travel_minutes'])
    ),
    radius: toNumber(
      getOriginalValue(point, config?.logistics_service_radius_column, ['service_radius_km', 'radius_km'])
    ),
  }));

  const travels = entries.filter((entry) => entry.travel !== null);
  const radiuses = entries.filter((entry) => entry.radius !== null);
  const corridors = entries.map((entry) => entry.corridor).filter(Boolean);

  if (!travels.length && !radiuses.length && !corridors.length) {
    return { hasData: false };
  }

  const slowestRoute = travels.length ? [...travels].sort((a, b) => b.travel - a.travel)[0] : null;
  const fastestRoute = travels.length ? [...travels].sort((a, b) => a.travel - b.travel)[0] : null;
  const maxRadius = radiuses.length ? [...radiuses].sort((a, b) => b.radius - a.radius)[0] : null;

  return {
    hasData: true,
    corridors: Array.from(new Set(corridors)),
    fastestRoute,
    slowestRoute,
    maxRadius,
  };
};

const summarizeClimate = (points, config) => {
  const entries = points.map((point) => ({
    name: point.name || findNameField(point.original) || 'Без названия',
    temperature: toNumber(
      getOriginalValue(point, config?.climate_temperature_column, ['weather_temperature', 'temperature'])
    ),
    precipitation: toNumber(
      getOriginalValue(point, config?.climate_precipitation_column, ['weather_precipitation', 'precipitation'])
    ),
    risk: toNumber(getOriginalValue(point, config?.climate_risk_column, ['climate_risk', 'risk_index'])),
  }));

  const temperatures = entries.filter((entry) => entry.temperature !== null);
  const precipitations = entries.filter((entry) => entry.precipitation !== null);
  const risks = entries.filter((entry) => entry.risk !== null);

  if (!temperatures.length && !precipitations.length && !risks.length) {
    return { hasData: false };
  }

  const averageTemp = temperatures.length ? calcAverage(temperatures.map((entry) => entry.temperature)) : null;
  const averagePrecip = precipitations.length
    ? calcAverage(precipitations.map((entry) => entry.precipitation))
    : null;
  const highestRisk = risks.length ? [...risks].sort((a, b) => b.risk - a.risk)[0] : null;

  return {
    hasData: true,
    averageTemp,
    averagePrecip,
    highestRisk,
  };
};

export const computeMapAnalytics = (rawData, config, options = {}) => {
  const {
    fallbackSample = [],
    datasetSample = [],
    datasetName = "",
    datasetId,
  } = options;

  let dataset = Array.isArray(rawData) ? rawData : [];

  const shouldUseDatasetSample =
    datasetId === "sample" && Array.isArray(datasetSample) && datasetSample.length;

  if (!dataset.length && shouldUseDatasetSample) {
    dataset = datasetSample;
  }

  const shouldUseFallback = Array.isArray(fallbackSample) && fallbackSample.length;

  if (!dataset.length && shouldUseFallback) {
    dataset = fallbackSample;
  }

  if (!dataset.length) {
    return {
      hasData: false,
      datasetLabel: datasetName,
      valueLabel: config?.value_column || "Значение",
      totalPoints: 0,
      validPoints: 0,
      averageValue: null,
      maxPoint: null,
      minPoint: null,
      categories: [],
      forecast: {
        hasForecast: false,
        average: null,
        deltaFromValue: null,
        highestGrowthPoint: null,
      },
      correlation: {
        hasCorrelation: false,
        average: null,
        strongestPositive: null,
        strongestNegative: null,
      },
      risk: { ...buildRiskProfile([]), thresholds: { high: null, medium: null } },
      layers: {
        demography: { hasData: false },
        spatial: { hasData: false },
        trend: { hasData: false },
        hotspots: { hasData: false },
        logistics: { hasData: false },
        climate: { hasData: false },
      },
    };
  }

  const normalizedPoints = dataset.map((point) => normalizePoint(point, config));
  const validPoints = normalizedPoints.filter((point) => point.lat !== null && point.lon !== null);
  const numericPoints = normalizedPoints.filter((point) => point.value !== null);

  const values = numericPoints.map((point) => point.value);
  const averageValue = calcAverage(values);
  const maxPoint = pickExtremePoint(numericPoints, (next, current) => next > current);
  const minPoint = pickExtremePoint(numericPoints, (next, current) => next < current);
  const categories = aggregateCategories(validPoints);
  const risk = buildRiskProfile(numericPoints);

  const demography = summarizeDemography(normalizedPoints, config);
  const spatial = summarizeSpatial(validPoints, config);
  const trend = summarizeTrend(normalizedPoints, config);
  const hotspotsSummary = summarizeHotspot(normalizedPoints, config);
  const logisticsSummary = summarizeLogistics(normalizedPoints, config);
  const climateSummary = summarizeClimate(normalizedPoints, config);

  const forecastPoints = normalizedPoints.filter((point) => point.forecast !== null);
  const forecastValues = forecastPoints.map((point) => point.forecast);
  const averageForecast = calcAverage(forecastValues);

  const correlationPoints = normalizedPoints.filter((point) => point.correlation !== null);
  const averageCorrelation = calcAverage(correlationPoints.map((point) => point.correlation));
  const strongestPositive = correlationPoints.reduce((acc, point) => {
    if (!acc || point.correlation > acc.correlation) {
      return point;
    }
    return acc;
  }, null);
  const strongestNegative = correlationPoints.reduce((acc, point) => {
    if (!acc || point.correlation < acc.correlation) {
      return point;
    }
    return acc;
  }, null);

  return {
    hasData: validPoints.length > 0,
    datasetLabel: datasetName,
    valueLabel: config?.value_column || "Значение",
    totalPoints: dataset.length,
    validPoints: validPoints.length,
    averageValue,
    maxPoint,
    minPoint,
    categories,
    forecast: {
      hasForecast: forecastPoints.length > 0,
      average: averageForecast,
      deltaFromValue:
        averageValue !== null && averageForecast !== null
          ? averageForecast - averageValue
          : null,
      highestGrowthPoint: forecastPoints.reduce((acc, point) => {
        if (!acc) return point;
        const accDelta = acc.forecast - (acc.value ?? 0);
        const pointDelta = point.forecast - (point.value ?? 0);
        return pointDelta > accDelta ? point : acc;
      }, null),
    },
    correlation: {
      hasCorrelation: correlationPoints.length > 0,
      average: averageCorrelation,
      strongestPositive,
      strongestNegative,
    },
    risk,
    layers: {
      demography,
      spatial,
      trend,
      hotspots: hotspotsSummary,
      logistics: logisticsSummary,
      climate: climateSummary,
    },
  };
};
