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
  };
};
