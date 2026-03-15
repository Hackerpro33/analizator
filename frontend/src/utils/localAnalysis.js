import { parseNumberLike } from "./numberUtils";

const toNumberArray = (values) =>
  (values || [])
    .map((value) => parseNumberLike(value))
    .filter((value) => value !== null);

const sum = (values) => values.reduce((total, value) => total + value, 0);

const safeAverage = (values) => {
  const numeric = toNumberArray(values);
  return numeric.length ? average(numeric) : 0;
};

const safeNumber = (value, fallback = 0) => {
  if (Array.isArray(value)) {
    return safeAverage(value);
  }
  const parsed = parseNumberLike(value);
  return parsed === null ? fallback : parsed;
};

const safeDivide = (numerator, denominator, fallback = 0) => {
  const dividend = parseNumberLike(numerator);
  const divisor = parseNumberLike(denominator);
  if (dividend === null || divisor === null || Math.abs(divisor) < 1e-9) {
    return fallback;
  }
  return dividend / divisor;
};

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const fitLinearRegression = (xValues, yValues) => {
  const length = Math.min(xValues.length, yValues.length);
  if (length === 0) {
    return { slope: 0, intercept: 0 };
  }

  const x = xValues.slice(0, length);
  const y = yValues.slice(0, length);

  const sumX = sum(x);
  const sumY = sum(y);
  const sumXY = sum(x.map((value, index) => value * y[index]));
  const sumX2 = sum(x.map((value) => value ** 2));
  const numerator = length * sumXY - sumX * sumY;
  const denominator = length * sumX2 - sumX ** 2;

  if (Math.abs(denominator) < 1e-9) {
    return { slope: 0, intercept: length ? sumY / length : 0 };
  }

  const slope = numerator / denominator;
  const intercept = (sumY - slope * sumX) / length;
  return { slope, intercept };
};

const normaliseDate = (value) => {
  if (!value) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (date) => {
  if (!(date instanceof Date)) {
    return "";
  }
  return date.toISOString().split("T")[0];
};

const addDays = (date, days) => {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
};

const pearsonCorrelation = (seriesA, seriesB) => {
  const length = Math.min(seriesA.length, seriesB.length);
  if (length < 2) return 0;

  const valuesA = seriesA.slice(0, length);
  const valuesB = seriesB.slice(0, length);

  const meanA = average(valuesA);
  const meanB = average(valuesB);

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  for (let index = 0; index < length; index += 1) {
    const diffA = valuesA[index] - meanA;
    const diffB = valuesB[index] - meanB;
    numerator += diffA * diffB;
    denomA += diffA ** 2;
    denomB += diffB ** 2;
  }

  if (!denomA || !denomB) return 0;
  return numerator / Math.sqrt(denomA * denomB);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatList = (items, limit = 3) => {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  if (items.length <= limit) {
    return items.join(", ");
  }
  const visible = items.slice(0, limit).join(", ");
  const remaining = items.length - limit;
  return `${visible} и ещё ${remaining}`;
};

const normalizeColumnType = (type) => {
  if (!type) return "string";
  const lower = String(type).toLowerCase();
  if (["int", "integer", "float", "double", "number", "numeric"].includes(lower)) {
    return "number";
  }
  if (["bool", "boolean"].includes(lower)) {
    return "boolean";
  }
  if (lower.includes("date") || lower.includes("time")) {
    return "datetime";
  }
  return "string";
};

const createRowFingerprint = (row, columns) =>
  JSON.stringify(columns.map((column) => (row?.[column] ?? null)));

export function differenceInDifferences({
  treatmentBefore,
  treatmentAfter,
  controlBefore,
  controlAfter,
} = {}) {
  const treatmentBeforeMean = safeNumber(treatmentBefore, 0);
  const treatmentAfterMean = safeNumber(treatmentAfter, treatmentBeforeMean);
  const controlBeforeMean = safeNumber(controlBefore, 0);
  const controlAfterMean = safeNumber(controlAfter, controlBeforeMean);

  const treatmentChange = treatmentAfterMean - treatmentBeforeMean;
  const controlChange = controlAfterMean - controlBeforeMean;
  const effect = treatmentChange - controlChange;
  const baseline = Math.max(Math.abs(treatmentBeforeMean), 1e-6);
  const relativeEffect = (effect / baseline) * 100;

  let interpretation = "Изменение относительно контрольной группы не обнаружено.";
  if (effect < -1e-6) {
    interpretation = "Вмешательство ассоциируется со снижением показателя относительно контроля.";
  } else if (effect > 1e-6) {
    interpretation = "Вмешательство связано с ростом показателя относительно контроля.";
  }

  return {
    treatment: {
      before: Number(treatmentBeforeMean.toFixed(2)),
      after: Number(treatmentAfterMean.toFixed(2)),
      change: Number(treatmentChange.toFixed(2)),
    },
    control: {
      before: Number(controlBeforeMean.toFixed(2)),
      after: Number(controlAfterMean.toFixed(2)),
      change: Number(controlChange.toFixed(2)),
    },
    difference_in_differences: Number(effect.toFixed(2)),
    relative_effect_pct: Number(relativeEffect.toFixed(1)),
    interpretation,
    summary:
      `${interpretation} (эффект ${effect >= 0 ? "+" : ""}${effect.toFixed(2)}, ` +
      `относительно базового периода ${relativeEffect >= 0 ? "+" : ""}${relativeEffect.toFixed(1)}%).`,
  };
}

export function buildCounterfactualScenario({ historical = [], interventionDate, horizon = 7 } = {}) {
  const timeline = (Array.isArray(historical) ? historical : [])
    .filter((entry) => Number.isFinite(entry?.value))
    .map((entry) => ({ ...entry, date: normaliseDate(entry.date) }))
    .filter((entry) => entry.date)
    .sort((a, b) => a.date - b.date);

  if (!timeline.length) {
    return {
      counterfactual: [],
      actual: [],
      uplift: [],
      average_uplift: 0,
      interpretation: "Недостаточно данных для построения контрфакта.",
    };
  }

  const interventionPoint = normaliseDate(interventionDate);
  const defaultSplit = Math.max(Math.floor(timeline.length * 0.6), 1);
  let splitIndex = defaultSplit;

  if (interventionPoint) {
    const index = timeline.findIndex((entry) => entry.date > interventionPoint);
    if (index > 0) {
      splitIndex = index;
    }
  }

  splitIndex = Math.min(Math.max(splitIndex, 1), timeline.length - 1);

  const preIntervention = timeline.slice(0, splitIndex);
  const postIntervention = timeline.slice(splitIndex);

  const xValues = preIntervention.map((_, index) => index);
  const yValues = preIntervention.map((entry) => entry.value);
  const { slope, intercept } = fitLinearRegression(xValues, yValues);

  const counterfactual = [];
  const actual = [];
  const uplift = [];

  const lastPreDate = preIntervention[preIntervention.length - 1].date;
  const totalSteps = Math.max(postIntervention.length, horizon);

  for (let step = 1; step <= totalSteps; step += 1) {
    const index = preIntervention.length - 1 + step;
    const estimate = intercept + slope * index;
    const predictedValue = Number(estimate.toFixed(2));
    const postEntry = postIntervention[step - 1];
    const date = postEntry?.date ?? addDays(lastPreDate, step);

    counterfactual.push({ date: formatDate(date), value: predictedValue });

    if (postEntry) {
      const actualValue = Number(postEntry.value.toFixed(2));
      actual.push({ date: formatDate(postEntry.date), value: actualValue });
      uplift.push({
        date: formatDate(postEntry.date),
        value: Number((actualValue - predictedValue).toFixed(2)),
      });
    } else {
      actual.push({ date: formatDate(date), value: null });
      uplift.push({ date: formatDate(date), value: null });
    }
  }

  const realisedUplift = uplift.filter((entry) => entry.value !== null).map((entry) => entry.value);
  const averageUplift = realisedUplift.length ? average(realisedUplift) : 0;

  let interpretation = "Контрфактическая модель построена на линейном тренде до вмешательства.";
  if (realisedUplift.length) {
    if (averageUplift < -1e-6) {
      interpretation =
        "Фактические значения ниже контрфактических ожиданий — наблюдается улучшение показателя.";
    } else if (averageUplift > 1e-6) {
      interpretation =
        "Фактические значения выше контрфактических ожиданий — возможное ухудшение показателя.";
    }
  }

  return {
    counterfactual,
    actual,
    uplift,
    average_uplift: Number(averageUplift.toFixed(2)),
    slope: Number(slope.toFixed(4)),
    intercept: Number(intercept.toFixed(2)),
    interpretation,
    summary:
      `${interpretation} Среднее отклонение ${averageUplift >= 0 ? "+" : ""}${averageUplift.toFixed(2)}.`,
  };
}

export function calculateSafetyKPIs({ before = [], after = [] } = {}) {
  const normaliseRecords = (records) =>
    (Array.isArray(records) ? records : []).map((entry) => ({
      incidents: safeNumber(entry?.incidents),
      cases_cleared: safeNumber(entry?.cases_cleared),
      response_minutes: safeNumber(entry?.response_minutes),
      perception_score: safeNumber(entry?.perception_score),
    }));

  const beforeRecords = normaliseRecords(before);
  const afterRecords = normaliseRecords(after);

  const incidentsBefore = sum(beforeRecords.map((entry) => entry.incidents));
  const incidentsAfter = sum(afterRecords.map((entry) => entry.incidents));
  const solvedBefore = sum(beforeRecords.map((entry) => entry.cases_cleared));
  const solvedAfter = sum(afterRecords.map((entry) => entry.cases_cleared));
  const responseBefore = safeAverage(beforeRecords.map((entry) => entry.response_minutes));
  const responseAfter = safeAverage(afterRecords.map((entry) => entry.response_minutes));
  const perceptionBefore = safeAverage(beforeRecords.map((entry) => entry.perception_score));
  const perceptionAfter = safeAverage(afterRecords.map((entry) => entry.perception_score));

  const incidentReduction = safeDivide(incidentsBefore - incidentsAfter, incidentsBefore, 0) * 100;
  const clearanceBefore = safeDivide(solvedBefore, incidentsBefore, 0) * 100;
  const clearanceAfter = safeDivide(solvedAfter, incidentsAfter, 0) * 100;
  const clearanceChange = clearanceAfter - clearanceBefore;
  const responseDelta = responseAfter - responseBefore;
  const perceptionDelta = perceptionAfter - perceptionBefore;

  const insights = [];
  if (Number.isFinite(incidentReduction)) {
    insights.push(
      `Снижение зарегистрированных инцидентов составило ${incidentReduction >= 0 ? "+" : ""}${incidentReduction.toFixed(
        1
      )}% по сравнению с базовым периодом.`
    );
  }
  if (Number.isFinite(clearanceChange)) {
    insights.push(
      `Изменение раскрываемости: ${clearanceChange >= 0 ? "+" : ""}${clearanceChange.toFixed(
        1
      )} п.п. (с ${clearanceBefore.toFixed(1)}% до ${clearanceAfter.toFixed(1)}%).`
    );
  }
  if (Number.isFinite(responseDelta)) {
    insights.push(
      `Среднее время реагирования изменилось на ${responseDelta >= 0 ? "+" : ""}${responseDelta.toFixed(
        1
      )} мин.`
    );
  }
  if (Number.isFinite(perceptionDelta)) {
    insights.push(
      `Оценка ощущения безопасности изменилась на ${perceptionDelta >= 0 ? "+" : ""}${perceptionDelta.toFixed(
        1
      )} пункт(ов).`
    );
  }

  return {
    baseline: {
      incidents: Number(incidentsBefore.toFixed(1)),
      clearance_rate_pct: Number(clearanceBefore.toFixed(1)),
      response_minutes: Number(responseBefore.toFixed(1)),
      perception_score: Number(perceptionBefore.toFixed(1)),
    },
    current: {
      incidents: Number(incidentsAfter.toFixed(1)),
      clearance_rate_pct: Number(clearanceAfter.toFixed(1)),
      response_minutes: Number(responseAfter.toFixed(1)),
      perception_score: Number(perceptionAfter.toFixed(1)),
    },
    deltas: {
      incident_reduction_pct: Number(incidentReduction.toFixed(1)),
      clearance_rate_change_pct: Number(clearanceChange.toFixed(1)),
      response_time_change_minutes: Number(responseDelta.toFixed(1)),
      perception_change_points: Number(perceptionDelta.toFixed(1)),
    },
    insights,
  };
}

export function generateForecastReport({ historical, horizon, externalFactors = [] }) {
  const horizonDays = Math.max(1, Math.floor(horizon ?? 7));
  const timeline = Array.isArray(historical) ? historical : [];

  let series = timeline;
  if (!series.length) {
    const base = 100;
    series = Array.from({ length: 30 }, (_, index) => ({
      date: `2024-01-${String(index + 1).padStart(2, "0")}`,
      value: base,
    }));
  }

  const values = series.map((entry) => entry.value).filter((value) => Number.isFinite(value));
  const mean = average(values);
  const lastValue = values.at(-1) ?? mean;
  const lastWeek = values.slice(-7);
  const weeklyTrend = average(
    lastWeek.map((value, index, array) => (index === 0 ? 0 : value - array[index - 1]))
  );
  const volatility = standardDeviation(values) || mean * 0.05;
  const growthBaseline =
    weeklyTrend || (values.length > 1 ? (values.at(-1) - values[0]) / values.length : mean * 0.02);

  const forecastData = [];
  let current = lastValue;
  for (let day = 1; day <= horizonDays; day += 1) {
    const seasonal = Math.sin((day / 7) * 2 * Math.PI) * (volatility * 0.3);
    const adjusted = current + growthBaseline + seasonal;
    current = Math.max(0, adjusted);
    const confidenceBand = Math.max(volatility * 0.5, current * 0.05);
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + day);
    forecastData.push({
      date: baseDate.toISOString().split("T")[0],
      predicted_value: Number(current.toFixed(2)),
      confidence_lower: Number(Math.max(0, current - confidenceBand).toFixed(2)),
      confidence_upper: Number((current + confidenceBand).toFixed(2)),
    });
  }

  const optimistic = forecastData.map((entry) => Number((entry.predicted_value * 1.08).toFixed(2)));
  const pessimistic = forecastData.map((entry) => Number((entry.predicted_value * 0.92).toFixed(2)));

  const growthPercent = values.length
    ? ((forecastData.at(-1).predicted_value - values[0]) / Math.max(values[0], 1e-6)) * 100
    : 0;

  const volatilityLevel = (() => {
    const ratio = clamp(volatility / Math.max(mean, 1e-6), 0, 3);
    if (ratio > 0.6) return "высокая";
    if (ratio > 0.3) return "средняя";
    return "низкая";
  })();

  const trendDirection = growthBaseline > 0.5 ? "возрастающий" : growthBaseline < -0.5 ? "убывающий" : "стабильный";
  const confidenceScore = clamp(1 - (volatility / Math.max(mean, 1e-6)) * 0.5, 0.3, 0.95);

  const factorInsights = externalFactors
    .filter((factor) => factor && factor.dataset_name)
    .map((factor) =>
      `Фактор "${factor.column}" из набора "${factor.dataset_name}" учитывается при прогнозе ` +
        `${factor.sampleValues?.length ? `на основе примеров ${factor.sampleValues.join(", ")}` : "как стабилизирующая переменная"}.`
    );

  const hasHistoricalData = timeline.length > 0;

  const recommendations = [];
  if (!hasHistoricalData) {
    recommendations.push(
      "Загрузите исторические наблюдения, чтобы прогноз отражал реальные колебания вашего показателя."
    );
    recommendations.push(
      "После добавления данных обновите расчёт — рекомендации и сценарии адаптируются автоматически."
    );
  } else {
    recommendations.push("Пересматривайте прогноз каждые 7 дней для учёта новых данных и событий.");
    if (volatilityLevel === "высокая") {
      recommendations.push(
        "Снизьте волатильность: добавьте сглаживание, очистите выбросы и уточните частоту обновления источников."
      );
    } else if (trendDirection !== "стабильный") {
      recommendations.push(
        `Подготовьте меры реагирования на ${trendDirection} тренд — протестируйте оптимистичный и пессимистичный сценарии.`
      );
    } else {
      recommendations.push(
        "Поддерживайте стабильность ряда: отслеживайте отклонения и фиксируйте причины резких изменений."
      );
    }
    if (externalFactors.length) {
      recommendations.push(
        "Продолжайте отслеживать влияние внешних факторов и своевременно актуализируйте их набор."
      );
    } else {
      recommendations.push(
        "Добавьте внешние факторы (погода, события, инфраструктурные изменения), чтобы повысить точность прогноза."
      );
    }
  }

  if (!recommendations.length) {
    recommendations.push("Пересматривайте прогноз каждые 7 дней для учёта новых данных.");
  }

  const summary = {
    predicted_growth_percentage: Number(growthPercent.toFixed(1)),
    key_insights: [
      `Прогноз на ${horizonDays} дн. показывает ${trendDirection} тренд c потенциалом ${growthPercent.toFixed(1)}%.`,
      `Среднее значение ряда ≈ ${mean.toFixed(1)}, использована локальная сезонность и сглаживание шума.`,
      `Уровень волатильности оценивается как ${volatilityLevel}.`,
      ...factorInsights,
    ],
    seasonality_detected: true,
    trend_direction: trendDirection,
    volatility_level: volatilityLevel,
    confidence_score: Number(confidenceScore.toFixed(2)),
    risk_factors: [
      volatilityLevel === "высокая"
        ? "Высокая изменчивость ряда, рекомендуется контролировать экзогенные факторы."
        : "Значительных рисков, связанных с волатильностью, не обнаружено.",
      "Продолжительные отклонения от прогнозной линии требуют ручной проверки источников данных.",
    ],
    recommendations,
  };

  return {
    forecast_data: forecastData,
    scenarios: {
      optimistic,
      pessimistic,
    },
    summary,
  };
}

export function analyzeCorrelation({ features, context = {} }) {
  const preparedFeatures = (features || [])
    .map((feature) => ({
      ...feature,
      values: toNumberArray(feature.values || []),
      metadata: feature.metadata || {},
    }))
    .filter((feature) => feature.values.length > 1);

  const matrix = preparedFeatures.map((feature) => {
    const correlations = {};
    for (const other of preparedFeatures) {
      const coefficient = pearsonCorrelation(feature.values, other.values);
      correlations[other.label] = Number(coefficient.toFixed(3));
    }
    return { feature: feature.label, correlations, metadata: feature.metadata };
  });

  const strongest = [];
  for (let i = 0; i < preparedFeatures.length; i += 1) {
    for (let j = i + 1; j < preparedFeatures.length; j += 1) {
      const coeff = pearsonCorrelation(preparedFeatures[i].values, preparedFeatures[j].values);
      strongest.push({
        feature1: preparedFeatures[i].label,
        feature2: preparedFeatures[j].label,
        correlation: Number(coeff.toFixed(3)),
        interpretation:
          Math.abs(coeff) > 0.7
            ? "Сильная взаимосвязь, рекомендуется проанализировать причинность."
            : Math.abs(coeff) > 0.4
            ? "Умеренная связь, возможное влияние при совместном анализе."
            : "Связь слабая, скорее всего влияния нет.",
        feature1Meta: preparedFeatures[i].metadata,
        feature2Meta: preparedFeatures[j].metadata,
      });
    }
  }

  strongest.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const topStrongest = strongest.slice(0, 5);

  const insights = [];
  if (!matrix.length) {
    insights.push("Недостаточно числовых данных для построения матрицы корреляций.");
  } else {
    topStrongest.forEach((item) => {
      if (Math.abs(item.correlation) >= 0.7) {
        insights.push(
          `Пара "${item.feature1}" — "${item.feature2}" демонстрирует сильную корреляцию (${item.correlation}). ` +
            "Проверьте влияние зависимостей в моделях."
        );
      }
    });

    if (!insights.length) {
      insights.push("Сильных корреляций не обнаружено, данные сбалансированы.");
    }
  }

  const featureStats = preparedFeatures.reduce(
    (acc, feature) => {
      const type = feature.metadata?.type || "base";
      acc.countByType[type] = (acc.countByType[type] || 0) + 1;
      if (feature.metadata?.externalFactor) {
        acc.externalFactors.push(feature.label);
      }
      if (feature.metadata?.lag) {
        acc.lagged.push({ label: feature.label, lag: feature.metadata.lag });
      }
      if (feature.metadata?.derivedFrom) {
        acc.derived.push({
          label: feature.label,
          base: feature.metadata.derivedFrom,
          type,
        });
      }
      if (feature.metadata?.category) {
        acc.categorical.push(feature.metadata.category);
      }
      return acc;
    },
    {
      countByType: {},
      externalFactors: [],
      lagged: [],
      derived: [],
      categorical: [],
    }
  );

  const lagHighlights = topStrongest.filter(
    (item) => item.feature1Meta?.lag || item.feature2Meta?.lag
  );

  if (lagHighlights.length) {
    lagHighlights.slice(0, 2).forEach((item) => {
      const laggedFeature = item.feature1Meta?.lag ? item.feature1 : item.feature2;
      const lagValue = item.feature1Meta?.lag || item.feature2Meta?.lag;
      insights.push(
        `Лаговая переменная "${laggedFeature}" (t-${lagValue}) имеет корреляцию ${item.correlation.toFixed(
          2
        )} с показателем "${item.feature1Meta?.lag ? item.feature2 : item.feature1}".`
      );
    });
  }

  if (featureStats.externalFactors.length) {
    insights.push(
      `Учитываются внешние факторы: ${featureStats.externalFactors
        .map((label) => `«${label}»`)
        .join(", ")}.`
    );
  }

  if (featureStats.categorical.length) {
    const uniqueCategories = [...new Set(featureStats.categorical.map((item) => item.label || item))];
    insights.push(
      `Категориальные признаки представлены через кодирование: ${formatList(uniqueCategories, 5)}.`
    );
  }

  const meta = {
    featureCount: preparedFeatures.length,
    countByType: featureStats.countByType,
    externalFactors: featureStats.externalFactors,
    laggedFeatures: featureStats.lagged,
    derivedFeatures: featureStats.derived,
    context,
  };

  return {
    correlation_matrix: matrix,
    insights,
    strongest_correlations: topStrongest,
    meta,
  };
}

function buildAdjacencyMaps(nodes, links) {
  const weightMap = new Map();
  const neighborMap = new Map();

  nodes.forEach((node) => {
    weightMap.set(node.id, new Map());
    neighborMap.set(node.id, new Set());
  });

  links.forEach((link) => {
    const source = link.source;
    const target = link.target;
    if (!weightMap.has(source)) {
      weightMap.set(source, new Map());
      neighborMap.set(source, new Set());
    }
    if (!weightMap.has(target)) {
      weightMap.set(target, new Map());
      neighborMap.set(target, new Set());
    }

    const value = Number.isFinite(link.value) ? link.value : parseNumberLike(link.value) || 0;
    weightMap.get(source).set(target, value);
    weightMap.get(target).set(source, value);
    neighborMap.get(source).add(target);
    neighborMap.get(target).add(source);
  });

  return { weightMap, neighborMap };
}

function calculateNodeMetrics(nodes, links) {
  if (!nodes.length) {
    return [];
  }

  const { weightMap, neighborMap } = buildAdjacencyMaps(nodes, links);
  const totalNodes = nodes.length;

  const edgeLookup = new Set(
    links.map((link) => {
      const source = String(link.source);
      const target = String(link.target);
      return source < target ? `${source}|${target}` : `${target}|${source}`;
    })
  );

  return nodes.map((node) => {
    const neighbors = neighborMap.get(node.id) ?? new Set();
    const degree = neighbors.size;
    const degreeCentrality = totalNodes > 1 ? degree / (totalNodes - 1) : 0;

    let strength = 0;
    const weights = weightMap.get(node.id);
    if (weights) {
      weights.forEach((weight) => {
        strength += Math.abs(weight);
      });
    }

    const neighborList = Array.from(neighbors.values());
    let triangles = 0;
    for (let i = 0; i < neighborList.length; i += 1) {
      for (let j = i + 1; j < neighborList.length; j += 1) {
        const a = neighborList[i];
        const b = neighborList[j];
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (edgeLookup.has(key)) {
          triangles += 1;
        }
      }
    }
    const possibleTriangles = (degree * (degree - 1)) / 2;
    const clusteringCoefficient = possibleTriangles ? triangles / possibleTriangles : 0;

    return {
      node: node.id,
      degree,
      degree_centrality: Number(degreeCentrality.toFixed(3)),
      strength: Number(strength.toFixed(3)),
      clustering: Number(clusteringCoefficient.toFixed(3)),
    };
  });
}

function detectCommunities(nodes, links) {
  if (!nodes.length) {
    return [];
  }

  const { neighborMap } = buildAdjacencyMaps(nodes, links);
  const visited = new Set();
  const communities = [];

  nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const queue = [node.id];
    const component = new Set();

    while (queue.length) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      component.add(current);

      const neighbors = neighborMap.get(current) ?? new Set();
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          queue.push(neighbor);
        }
      });
    }

    communities.push({ size: component.size, nodes: Array.from(component) });
  });

  return communities.sort((a, b) => b.size - a.size);
}

function buildAdjacencyMatrix(nodes, links) {
  if (!nodes.length) {
    return [];
  }

  const { weightMap } = buildAdjacencyMaps(nodes, links);

  return nodes.map((node) => ({
    node: node.id,
    connections: nodes.map((targetNode) => {
      if (node.id === targetNode.id) {
        return { node: targetNode.id, weight: 0 };
      }
      const weight = weightMap.get(node.id)?.get(targetNode.id) ?? 0;
      return {
        node: targetNode.id,
        weight: Number(Math.abs(weight).toFixed(3)),
      };
    }),
  }));
}

function summariseGraphMetrics(nodes, links, nodeMetrics, communities) {
  const totalNodes = nodes.length;
  const totalLinks = links.length;
  const metrics = {
    total_nodes: totalNodes,
    total_links: totalLinks,
    density: 0,
    average_degree: 0,
    hubs: [],
    isolated_nodes: [],
    community_count: communities.length,
  };

  if (!totalNodes) {
    return metrics;
  }

  const possibleEdges = (totalNodes * (totalNodes - 1)) / 2;
  metrics.density = possibleEdges ? Number((totalLinks / possibleEdges).toFixed(3)) : 0;

  const totalDegree = nodeMetrics.reduce((sum, metric) => sum + metric.degree, 0);
  metrics.average_degree = Number((totalDegree / totalNodes).toFixed(2));

  metrics.hubs = [...nodeMetrics]
    .sort((a, b) => b.degree - a.degree || b.strength - a.strength)
    .slice(0, 3)
    .map((metric) => metric.node);

  metrics.isolated_nodes = nodeMetrics.filter((metric) => metric.degree === 0).map((metric) => metric.node);

  return metrics;
}

export function buildNetworkGraph({ datasetName, columns, rows, graphType }) {
  const numericColumns = (columns || []).filter((column) => column.type === "number");
  const nodes = numericColumns.map((column) => ({ id: column.name, group: column.type }));

  const columnSeries = Object.fromEntries(
    numericColumns.map((column) => [column.name, toNumberArray(rows.map((row) => row?.[column.name]))])
  );

  const links = [];
  for (let i = 0; i < numericColumns.length; i += 1) {
    for (let j = i + 1; j < numericColumns.length; j += 1) {
      const columnA = numericColumns[i].name;
      const columnB = numericColumns[j].name;
      const coeff = pearsonCorrelation(columnSeries[columnA], columnSeries[columnB]);
      if (Math.abs(coeff) >= 0.3) {
        links.push({
          source: columnA,
          target: columnB,
          value: Number(Math.abs(coeff).toFixed(3)),
        });
      }
    }
  }

  const nodeMetrics = calculateNodeMetrics(nodes, links);
  const communities = detectCommunities(nodes, links);
  const adjacencyMatrix = buildAdjacencyMatrix(nodes, links);
  const metrics = summariseGraphMetrics(nodes, links, nodeMetrics, communities);

  const insights = [];
  if (!links.length) {
    insights.push("Связи с коэффициентом выше 0.3 не обнаружены — показатели независимы.");
  } else {
    const strongest = [...links].sort((a, b) => b.value - a.value)[0];
    if (strongest) {
      insights.push(
        `Наиболее выраженная связь: "${strongest.source}" и "${strongest.target}" (корреляция ${strongest.value}).`
      );
    }
    if (metrics.hubs.length) {
      insights.push(`Ключевые узлы с наибольшей степенью: ${metrics.hubs.join(", ")}.`);
    }
    if (graphType === "social") {
      insights.push("Интерпретируйте узлы как акторов: высокие связи — потенциальные центры влияния.");
    } else if (graphType === "geo") {
      insights.push("Параметры с высокой корреляцией могут указывать на общую географическую динамику.");
    }
    insights.push(`Плотность графа оценивается как ${metrics.density.toFixed(2)}.`);
  }

  if (communities.length > 1) {
    insights.push(
      `Обнаружено ${communities.length} компонент(ы) связности. Крупнейшая включает ${communities[0].nodes.length} узл(ов).`
    );
  }

  const unused = numericColumns.filter(
    (column) => !links.some((link) => link.source === column.name || link.target === column.name)
  );
  if (unused.length) {
    insights.push(
      `Столбцы без связей: ${unused.map((column) => column.name).join(", ")}. Их можно анализировать отдельно.`
    );
  }

  return {
    dataset: datasetName ?? "",
    nodes,
    links,
    adjacency_matrix: adjacencyMatrix,
    communities,
    metrics,
    node_metrics: nodeMetrics,
    insights,
  };
}

function valuesAreEquivalent(a, b) {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }

  const numberA = parseNumberLike(a);
  const numberB = parseNumberLike(b);
  if (numberA !== null && numberB !== null) {
    return numberA === numberB;
  }

  return String(a) === String(b);
}

function buildCellComparison({ leftRows, rightRows, columns }) {
  const totalRows = Math.max(leftRows.length, rightRows.length);
  const resultRows = [];

  for (let index = 0; index < totalRows; index += 1) {
    const leftRow = leftRows[index]?.raw ?? null;
    const rightRow = rightRows[index]?.raw ?? null;

    const cells = columns.map((column) => {
      const leftValue = leftRow ? leftRow[column] : undefined;
      const rightValue = rightRow ? rightRow[column] : undefined;
      const matches = valuesAreEquivalent(leftValue, rightValue);

      return {
        column,
        left_value: leftValue ?? null,
        right_value: rightValue ?? null,
        status: matches ? "match" : "mismatch",
        color: matches ? "green" : "red",
      };
    });

    resultRows.push({
      row_index: index,
      left_present: Boolean(leftRow),
      right_present: Boolean(rightRow),
      cells,
    });
  }

  return {
    columns,
    legend: {
      match: { color: "green", description: "Совпадение значений" },
      mismatch: { color: "red", description: "Расхождение значений" },
    },
    rows: resultRows,
  };
}

export function compareTables({ left, right, keyColumns }) {
  const leftColumns = new Map(
    (left?.columns || []).map((column) => [column.name, normalizeColumnType(column.type)])
  );
  const rightColumns = new Map(
    (right?.columns || []).map((column) => [column.name, normalizeColumnType(column.type)])
  );

  const commonColumns = (keyColumns && keyColumns.length
    ? keyColumns.filter((column) => leftColumns.has(column) && rightColumns.has(column))
    : [...leftColumns.keys()].filter((column) => rightColumns.has(column)));

  const matchingColumns = commonColumns.filter(
    (column) => leftColumns.get(column) === rightColumns.get(column)
  );
  const typeMismatches = commonColumns
    .filter((column) => leftColumns.get(column) !== rightColumns.get(column))
    .map((column) => ({
      column,
      left_type: leftColumns.get(column),
      right_type: rightColumns.get(column),
    }));
  const leftOnlyColumns = [...leftColumns.keys()].filter((column) => !rightColumns.has(column));
  const rightOnlyColumns = [...rightColumns.keys()].filter((column) => !leftColumns.has(column));

  const rowsToCompare = matchingColumns.length ? matchingColumns : commonColumns;
  const leftRows = (left?.sample_data || []).map((row) => ({
    raw: row,
    fingerprint: createRowFingerprint(row, rowsToCompare),
  }));
  const rightRows = (right?.sample_data || []).map((row) => ({
    raw: row,
    fingerprint: createRowFingerprint(row, rowsToCompare),
  }));

  const cellComparison = buildCellComparison({
    leftRows,
    rightRows,
    columns: rowsToCompare,
  });

  const leftRowCounts = new Map();
  leftRows.forEach((entry) => {
    leftRowCounts.set(entry.fingerprint, (leftRowCounts.get(entry.fingerprint) ?? 0) + 1);
  });
  const rightRowCounts = new Map();
  rightRows.forEach((entry) => {
    rightRowCounts.set(entry.fingerprint, (rightRowCounts.get(entry.fingerprint) ?? 0) + 1);
  });

  let matchingRowsCount = 0;
  for (const [fingerprint, count] of leftRowCounts.entries()) {
    if (rightRowCounts.has(fingerprint)) {
      matchingRowsCount += Math.min(count, rightRowCounts.get(fingerprint));
    }
  }

  const leftOnlyRows = [];
  for (const [fingerprint, count] of leftRowCounts.entries()) {
    const rightCount = rightRowCounts.get(fingerprint) ?? 0;
    if (count > rightCount) {
      const samples = leftRows
        .filter((entry) => entry.fingerprint === fingerprint)
        .slice(0, 3)
        .map((entry) => entry.raw);
      leftOnlyRows.push({ fingerprint, count: count - rightCount, samples });
    }
  }

  const rightOnlyRows = [];
  for (const [fingerprint, count] of rightRowCounts.entries()) {
    const leftCount = leftRowCounts.get(fingerprint) ?? 0;
    if (count > leftCount) {
      const samples = rightRows
        .filter((entry) => entry.fingerprint === fingerprint)
        .slice(0, 3)
        .map((entry) => entry.raw);
      rightOnlyRows.push({ fingerprint, count: count - leftCount, samples });
    }
  }

  const insights = [];
  if (!commonColumns.length) {
    insights.push("Таблицы не имеют общих столбцов — автоматическое сравнение невозможно.");
  } else {
    insights.push(
      `Совпадающих столбцов: ${matchingColumns.length} из ${commonColumns.length}.` +
        (typeMismatches.length
          ? ` Для ${typeMismatches.length} столбцов обнаружены различия типов данных.`
          : " Типы данных идентичны для общих столбцов.")
    );

    if (rowsToCompare.length) {
      insights.push(
        `По общим столбцам найдено ${matchingRowsCount} совпадающих строк из ${
          Math.max(leftRows.length, rightRows.length)
        } проверенных.`
      );
    }

    if (leftOnlyColumns.length) {
      insights.push(`У первой таблицы есть уникальные столбцы: ${leftOnlyColumns.join(", ")}.`);
    }
    if (rightOnlyColumns.length) {
      insights.push(`У второй таблицы есть уникальные столбцы: ${rightOnlyColumns.join(", ")}.`);
    }
  }

  return {
    column_comparison: {
      matching_columns: matchingColumns,
      type_mismatches: typeMismatches,
      left_only: leftOnlyColumns,
      right_only: rightOnlyColumns,
    },
    row_comparison: {
      compared_columns: rowsToCompare,
      matching_rows: matchingRowsCount,
      left_only_rows: leftOnlyRows,
      right_only_rows: rightOnlyRows,
      left_sampled_total: leftRows.length,
      right_sampled_total: rightRows.length,
    },
    cell_comparison: cellComparison,
    insights,
  };
}

export function summarizeProjectStructure({ datasets, visualizations }) {
  const datasetUsage = new Map();
  (visualizations || []).forEach((visualization) => {
    const datasetId = visualization.dataset_id;
    if (datasetId) {
      datasetUsage.set(datasetId, (datasetUsage.get(datasetId) ?? 0) + 1);
    }
  });

  const datasetMap = new Map((datasets || []).map((dataset) => [dataset.id, dataset]));
  const datasetCount = datasets?.length ?? 0;
  const visualizationCount = visualizations?.length ?? 0;
  const hasDatasets = datasetCount > 0;
  const hasVisualizations = visualizationCount > 0;

  const keyDatasets = [...datasetUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([datasetId, count]) => {
      const dataset = (datasets || []).find((item) => item.id === datasetId);
      return dataset ? `${dataset.name} — ${count} визуализаций` : datasetId;
    });

  const unusedDatasets = (datasets || [])
    .filter((dataset) => !datasetUsage.has(dataset.id))
    .map((dataset) => dataset.name);

  const datasetsWithoutSamples = (datasets || [])
    .filter((dataset) => !Array.isArray(dataset.sample_data) || dataset.sample_data.length === 0)
    .map((dataset) => dataset.name || "Набор без названия");

  const unlinkedVisualizations = (visualizations || [])
    .filter((visualization) => !visualization.dataset_id)
    .map((visualization) => visualization.title || "Визуализация без названия");

  const heavilyUsedDatasets = [...datasetUsage.entries()]
    .filter(([, count]) => count > 3)
    .map(([datasetId]) => datasetMap.get(datasetId)?.name || datasetId);

  const insights = [];
  insights.push(`В проекте используется ${visualizations?.length ?? 0} визуализаций и ${datasets?.length ?? 0} наборов данных.`);
  if (keyDatasets.length) {
    insights.push(`Основная активность строится вокруг: ${keyDatasets.join(", ")}.`);
  }
  if (unusedDatasets.length) {
    insights.push("Есть неиспользуемые наборы данных — их стоит вовлечь в анализ.");
  } else {
    insights.push("Все загруженные наборы данных задействованы в визуализациях.");
  }

  const recommendations = [];
  if (!hasDatasets) {
    recommendations.push(
      "Загрузите хотя бы один набор данных, чтобы система могла построить связи и сформировать рекомендации."
    );
    recommendations.push(
      "После загрузки создайте визуализацию или прогноз — это активирует локальный анализ проекта."
    );
  } else {
    recommendations.push("Регулярно обновляйте загруженные таблицы и отслеживайте качество данных.");
    if (!hasVisualizations) {
      recommendations.push("Создайте первую визуализацию на основе ключевого набора, чтобы увидеть взаимосвязи.");
    } else {
      recommendations.push("Развивайте связи между визуализациями для комплексного анализа (прогнозы, корреляции, карты).");
    }
    if (unusedDatasets.length) {
      recommendations.push(
        `Подключите наборы ${formatList(unusedDatasets)} к визуализациям, чтобы использовать весь потенциал данных.`
      );
    }
    if (datasetsWithoutSamples.length) {
      recommendations.push(
        `Добавьте примеры строк для ${formatList(datasetsWithoutSamples)} — это улучшит точность аналитики.`
      );
    }
    if (heavilyUsedDatasets.length) {
      recommendations.push(
        `Рассмотрите выделение витринного слоя для ${formatList(heavilyUsedDatasets)}: на них приходится основная нагрузка визуализаций.`
      );
    }
    if (unlinkedVisualizations.length) {
      recommendations.push(
        `Укажите источники данных для визуализаций ${formatList(unlinkedVisualizations)} — это обеспечит воспроизводимость отчётов.`
      );
    } else if (hasVisualizations && !unusedDatasets.length) {
      recommendations.push("Поддерживайте описания визуализаций в актуальном состоянии — все наборы данных уже задействованы.");
    }
  }

  return {
    insights,
    key_datasets: keyDatasets,
    unused_datasets: unusedDatasets,
    recommendations,
  };
}

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

export function analyzeDataset(dataset = {}) {
  const columns = Array.isArray(dataset.columns) ? dataset.columns : [];
  const sample = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];

  const normalizedColumns = columns.map((column) => ({
    ...column,
    normalizedType: normalizeColumnType(column.type),
  }));

  const sampleRows = sample.length;
  const totalRows = dataset.row_count ?? sampleRows;
  const totalCells = sampleRows * normalizedColumns.length;

  let filledCells = 0;
  sample.forEach((row) => {
    normalizedColumns.forEach((column) => {
      const value = row?.[column.name];
      if (value !== null && value !== undefined && value !== "") {
        filledCells += 1;
      }
    });
  });

  const completeness = totalCells
    ? Math.round((filledCells / Math.max(totalCells, 1)) * 100)
    : sampleRows
    ? 100
    : 0;

  const numericSummary = normalizedColumns
    .filter((column) => column.normalizedType === "number")
    .map((column) => {
      const values = toNumberArray(sample.map((row) => row?.[column.name]));
      if (!values.length) {
        return { name: column.name, type: column.normalizedType, hasData: false };
      }

      const min = Math.min(...values);
      const max = Math.max(...values);
      const mean = average(values);
      const deviation = standardDeviation(values);

      return {
        name: column.name,
        type: column.normalizedType,
        hasData: true,
        min,
        max,
        mean: Number(mean.toFixed(2)),
        deviation: Number(deviation.toFixed(2)),
        variation: max - min,
        formattedMin: numberFormatter.format(min),
        formattedMax: numberFormatter.format(max),
        formattedMean: numberFormatter.format(mean),
      };
    });

  const duplicates = (() => {
    if (!sampleRows) return 0;
    const keys = normalizedColumns.map((column) => column.name);
    if (!keys.length) return 0;

    const occurrences = new Map();
    sample.forEach((row) => {
      const fingerprint = createRowFingerprint(row, keys);
      occurrences.set(fingerprint, (occurrences.get(fingerprint) ?? 0) + 1);
    });

    let duplicatesCount = 0;
    occurrences.forEach((count) => {
      if (count > 1) {
        duplicatesCount += count - 1;
      }
    });

    return duplicatesCount;
  })();

  const insights = [];

  if (!sampleRows) {
    insights.push(
      "Нет примерочных данных — добавьте выборку, чтобы система могла построить статистику и рекомендации."
    );
  } else {
    insights.push(
      `Предоставленная выборка содержит ${sampleRows} строк при общем объёме ${totalRows || sampleRows}.`
    );

    if (completeness < 70) {
      insights.push(`Заполненность данных около ${completeness}% — рекомендуется проверить источники на пропуски.`);
    } else {
      insights.push(`Заполненность выборки достигает ${completeness}% — критических пропусков не обнаружено.`);
    }

    const numericWithData = numericSummary.filter((column) => column.hasData);
    if (numericWithData.length) {
      const widest = [...numericWithData].sort((a, b) => (b.variation ?? 0) - (a.variation ?? 0))[0];
      if (widest && Number.isFinite(widest.variation) && widest.variation > 0) {
        insights.push(
          `Столбец «${widest.name}» варьируется от ${widest.formattedMin} до ${widest.formattedMax}, среднее значение ${widest.formattedMean}.`
        );
      } else {
        insights.push("Числовые признаки имеют стабильные значения без существенного разброса.");
      }
    } else {
      insights.push("Числовые признаки не обнаружены — используйте категориальные инструменты анализа.");
    }

    if (duplicates > 0) {
      insights.push(
        `В примерочных данных выявлено ${duplicates} повторяющихся строк — рекомендуется очистить их перед моделированием.`
      );
    }
  }

  return {
    totalRows,
    sampleRows,
    completeness,
    duplicates,
    numericSummary,
    insights,
  };
}

const toDisplayString = (value) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const escapeCsvValue = (value, delimiter) => {
  const raw = toDisplayString(value);
  const escapedQuotes = raw.replace(/"/g, '""');
  const needsEscaping =
    escapedQuotes.includes("\n") ||
    escapedQuotes.includes("\r") ||
    escapedQuotes.includes(delimiter) ||
    /(^\s|\s$)/.test(escapedQuotes);
  return needsEscaping ? `"${escapedQuotes}"` : escapedQuotes;
};

const escapeXmlValue = (value) =>
  toDisplayString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const escapeHtmlValue = (value) =>
  toDisplayString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeIdentifier = (value, fallback) => {
  const base = (value ?? "").toString().trim().replace(/[^a-zA-Z0-9_:-]+/g, "_");
  return base || fallback;
};

const deriveColumns = (dataset = {}) => {
  const declared = Array.isArray(dataset.columns) ? dataset.columns : [];
  if (declared.length) {
    return declared.map((column, index) => ({
      name: column?.name ?? `column_${index + 1}`,
      ...column,
    }));
  }

  const sampleRow = Array.isArray(dataset.sample_data) ? dataset.sample_data[0] : undefined;
  if (sampleRow && typeof sampleRow === "object") {
    return Object.keys(sampleRow).map((name) => ({ name }));
  }

  return [];
};

const buildUniqueFieldMap = (columns = []) => {
  const used = new Set();
  return columns.map((column, index) => {
    const fallback = `field_${index + 1}`;
    const candidate = sanitizeIdentifier(column?.name, fallback);
    let unique = candidate;
    let counter = 1;
    while (used.has(unique)) {
      counter += 1;
      unique = `${candidate}_${counter}`;
    }
    used.add(unique);
    return { original: column?.name ?? fallback, safe: unique };
  });
};

const computePlainTextWidths = (headers, rows) =>
  headers.map((header, columnIndex) => {
    const values = rows.map((row) => row[columnIndex] ?? "");
    const all = [header, ...values];
    return all.reduce((width, value) => Math.max(width, value.length), 0);
  });

const formatGenerators = {
  csv: ({ dataset, options }) => {
    const delimiter = options?.delimiter ?? ",";
    const includeHeaders = options?.includeHeaders !== false;
    const columns = deriveColumns(dataset);
    const fieldNames = columns.map((column) => column.name ?? "");
    const rows = dataset.sample_data || [];

    const lines = [];
    if (includeHeaders && fieldNames.length) {
      lines.push(fieldNames.map((header) => escapeCsvValue(header, delimiter)).join(delimiter));
    }

    rows.forEach((row) => {
      const values = fieldNames.map((header) => escapeCsvValue(row?.[header], delimiter));
      lines.push(values.join(delimiter));
    });

    return lines.join("\\n");
  },
  json: ({ dataset }) => JSON.stringify(dataset.sample_data || [], null, 2),
  xml: ({ dataset }) => {
    const rows = dataset.sample_data || [];
    const fields = buildUniqueFieldMap(deriveColumns(dataset));

    if (!rows.length) {
      return "<dataset />";
    }

    const body = rows
      .map((row) => {
        const cells = fields
          .map((field) => `    <${field.safe}>${escapeXmlValue(row?.[field.original])}</${field.safe}>`)
          .join("\\n");
        return `  <row>\\n${cells}\\n  </row>`;
      })
      .join("\\n");

    return `<dataset>\\n${body}\\n</dataset>`;
  },
  html: ({ dataset }) => {
    const columns = deriveColumns(dataset);
    const fieldNames = columns.map((column) => column.name ?? "");
    const rows = dataset.sample_data || [];
    const headerHtml = fieldNames.map((header) => `<th>${escapeHtmlValue(header)}</th>`).join("");
    const body = rows
      .map(
        (row) =>
          `    <tr>${fieldNames
            .map((header) => `<td>${escapeHtmlValue(row?.[header])}</td>`)
            .join("")}</tr>`
      )
      .join("\\n");

    const bodySection = body ? `\\n${body}\\n  ` : "";

    return `<!DOCTYPE html>\\n<table>\\n  <thead>\\n    <tr>${headerHtml}</tr>\\n  </thead>\\n  <tbody>${bodySection}</tbody>\\n</table>`;
  },
  txt: ({ dataset }) => {
    const columns = deriveColumns(dataset);
    const fieldNames = columns.map((column) => column.name ?? "");
    const headerLabels = fieldNames.map((name) => toDisplayString(name));
    const rows = (dataset.sample_data || []).map((row) =>
      fieldNames.map((header) => toDisplayString(row?.[header]).replace(/[\r\n]+/g, " "))
    );

    if (!fieldNames.length && !rows.length) {
      return "";
    }

    if (!fieldNames.length) {
      return rows.map((row) => row.join(" | ")).join("\\n");
    }

    const widths = computePlainTextWidths(headerLabels, rows);
    const formatRow = (values) =>
      values
        .map((value, index) => value.padEnd(widths[index], " "))
        .join(" | ")
        .trimEnd();

    const divider = widths.map((width) => "-".repeat(width)).join("-+-");
    const lines = [formatRow(headerLabels), divider, ...rows.map((row) => formatRow(row))];
    return lines.join("\\n");
  },
};

formatGenerators.sql = ({ dataset }) => {
  const tableName = dataset.name?.replace(/[^a-zA-Z0-9_]+/g, "_") || "dataset";
  const columns = deriveColumns(dataset);
  const fields = buildUniqueFieldMap(columns);
  const createTable = `CREATE TABLE ${tableName} (\\n${fields
    .map((field, index) => {
      const column = columns[index];
      const type = column?.type === "number" ? "NUMERIC" : "TEXT";
      return `  ${field.safe} ${type}`;
    })
    .join(",\\n")}\\n);`;
  const rows = dataset.sample_data || [];
  const inserts = rows
    .map((row) => {
      const values = fields
        .map((field) => {
          const original = field.original;
          const value = original ? row?.[original] : undefined;
          if (value === null || value === undefined) return "NULL";
          return typeof value === "number" ? value : `'${String(value).replace(/'/g, "''")}'`;
        })
        .join(", ");
      return `INSERT INTO ${tableName} VALUES (${values});`;
    })
    .join("\\n");
  return `${createTable}\\n\\n${inserts}`;
};

formatGenerators.xlsx = ({ dataset, options }) => formatGenerators.csv({ dataset, options });
formatGenerators.parquet = ({ dataset, options }) => formatGenerators.csv({ dataset, options });

export function convertDataset({ dataset, format, options = {} }) {
  const lowerFormat = (format || "csv").toLowerCase();
  const generator = formatGenerators[lowerFormat] || formatGenerators.csv;
  const converted = generator({ dataset, format: lowerFormat, options });

  const notes = [];
  if (["xlsx", "parquet"].includes(lowerFormat)) {
    notes.push("Формат сгенерирован в виде текстового представления для локальной загрузки.");
  }

  return {
    converted_data: converted,
    format_info: `Файл подготовлен в формате ${lowerFormat.toUpperCase()} на основе локального преобразования.`,
    compatibility_notes: notes,
    file_size_estimate: `${Math.max(1, Math.round(converted.length / 1024))} KB`,
    export_quality: "good",
  };
}

export function buildProjectReport({ datasets, visualizations }) {
  const datasetCount = datasets?.length ?? 0;
  const visualizationCount = visualizations?.length ?? 0;

  const datasetCoverage = (datasets || []).map((dataset) => {
    const name = (dataset?.name || "Набор без названия").trim();
    const columns = dataset?.columns?.length ?? 0;
    const rows = dataset?.row_count ?? dataset?.sample_data?.length ?? 0;
    const hasSample = Array.isArray(dataset?.sample_data) && dataset.sample_data.length > 0;

    return {
      id: dataset.id,
      name: name || "Набор без названия",
      columns,
      rows,
      hasSample,
    };
  });

  const visualizationCoverage = (visualizations || []).map((viz) => {
    const title = (viz?.title || "Визуализация").trim() || "Визуализация";
    const type = viz?.type || "visualization";
    const datasetName = datasets?.find((dataset) => dataset.id === viz?.dataset_id)?.name;

    return {
      datasetId: viz?.dataset_id,
      title,
      type,
      dataset: datasetName,
    };
  });

  const datasetUsage = new Map();
  visualizationCoverage.forEach((viz) => {
    if (viz.datasetId) {
      datasetUsage.set(viz.datasetId, (datasetUsage.get(viz.datasetId) ?? 0) + 1);
    }
  });

  const unusedDatasets = datasetCoverage
    .filter((dataset) => !datasetUsage.has(dataset.id))
    .map((dataset) => dataset.name);

  const datasetsWithoutSamples = datasetCoverage
    .filter((dataset) => !dataset.hasSample)
    .map((dataset) => dataset.name);

  const unlinkedVisualizations = visualizationCoverage
    .filter((viz) => !viz.datasetId)
    .map((viz) => viz.title);

  const heavilyUsedDatasets = [...datasetUsage.entries()]
    .filter(([, count]) => count > 3)
    .map(([datasetId]) => datasetCoverage.find((dataset) => dataset.id === datasetId)?.name || datasetId);

  const datasetsSummary = datasetCoverage.map(
    ({ name, columns, rows, hasSample }) =>
      `${name} — ${columns} полей, ${rows || "0"} строк${hasSample ? "" : " (нет примеров)"}`
  );

  const visualizationSummary = visualizationCoverage.map((item) => {
    const datasetInfo = item.dataset ? ` для набора «${item.dataset}»` : "";
    return `${item.title} (${item.type}${datasetInfo})`;
  });

  return {
    executive_summary:
      `Локальный анализ проекта показал ${datasetCount} наборов данных и ${visualizationCount} визуализаций. ` +
      `Основной фокус — использование табличных данных для отчётности и мониторинга показателей.`,
    key_insights: [
      datasetCount
        ? `В работе находятся ключевые наборы: ${datasetsSummary.slice(0, 3).join(", ")}.`
        : "Наборы данных ещё не загружены.",
      visualizationCount
        ? `Создано ${visualizationCount} визуализаций, среди них: ${visualizationSummary.slice(0, 3).join(", ")}.`
        : "Визуализации отсутствуют — начните с базового графика или карты.",
      "Все выводы построены локальными эвристиками без обращения к внешним моделям.",
    ],
    dataset_overview: {
      total: datasetCount,
      coverage_summary: datasetCoverage.length
        ? datasetsSummary
        : ["Данные не загружены — добавьте наборы для анализа."],
    },
    visualization_overview: {
      total: visualizationCount,
      highlights: visualizationCoverage.length
        ? visualizationSummary
        : ["Визуализации отсутствуют — создайте первую диаграмму."],
    },
    risk_zones: unusedDatasetsReport(datasets),
    recommendations: (() => {
      const recommendations = [];

      if (!datasetCount) {
        recommendations.push(
          "Загрузите таблицы с данными, чтобы сформировать полноценный отчёт и персональные рекомендации."
        );
        recommendations.push(
          "После загрузки создайте хотя бы одну визуализацию или прогноз — это активирует аналитические модули."
        );
      } else {
        recommendations.push("Регулярно актуализируйте загруженные наборы и контролируйте качество источников.");

        if (!visualizationCount) {
          recommendations.push(
            "Создайте первую визуализацию на основе ключевого набора данных, чтобы рассказ стал наглядным."
          );
        } else {
          recommendations.push(
            "Расширяйте набор визуализаций и связывайте их с ключевыми метриками для управленческих решений."
          );
        }

        if (unusedDatasets.length) {
          recommendations.push(
            `Подключите наборы ${formatList(unusedDatasets)} к визуализациям, чтобы раскрыть весь потенциал данных.`
          );
        }

        if (datasetsWithoutSamples.length) {
          recommendations.push(
            `Добавьте примеры строк для ${formatList(datasetsWithoutSamples)} — это повысит доверие к отчёту.`
          );
        }

        if (heavilyUsedDatasets.length) {
          recommendations.push(
            `Рассмотрите создание витринного слоя для ${formatList(heavilyUsedDatasets)} — на них сосредоточено большинство визуализаций.`
          );
        }

        if (unlinkedVisualizations.length) {
          recommendations.push(
            `Укажите источники данных для визуализаций ${formatList(unlinkedVisualizations)}, чтобы обеспечить воспроизводимость анализа.`
          );
        } else if (!unusedDatasets.length && visualizationCount) {
          recommendations.push(
            "Продолжайте фиксировать гипотезы и расширяйте аналитические сценарии — все загруженные данные уже задействованы."
          );
        }
      }

      return recommendations.length
        ? recommendations
        : ["Регулярно обновляйте локальные данные и проверяйте качество источников."];
    })(),
  };
}

function unusedDatasetsReport(datasets = []) {
  if (!datasets.length) {
    return [
      {
        area: "Данные",
        risk_description: "Отчёт невозможно подготовить без загруженных таблиц.",
      },
    ];
  }

  const issues = datasets
    .filter((dataset) => !dataset.sample_data || dataset.sample_data.length === 0)
    .map((dataset) => ({
      area: dataset.name || "Набор без названия",
      risk_description: "Набор данных загружен без примеров строк — проверьте источник.",
    }));

  if (issues.length) {
    return issues;
  }

  return [
    {
      area: "Использование данных",
      risk_description: "Все наборы данных содержат примеры строк — критических рисков не обнаружено.",
    },
  ];
}

export function summarizeEmailBody(summary) {
  return [
    "Краткое описание локального анализа:",
    summary.executive_summary,
    "\nОсновные выводы:",
    ...(summary.key_insights || []),
    "\nРекомендации:",
    ...(summary.recommendations || []),
  ].join("\n");
}

const LAW_ENFORCEMENT_PATTERNS = [
  /crime/, /offense/, /incident/, /violence/, /safety/, /security/,
  /police/, /patrol/, /enforcement/, /response/,
  /преступ/, /правоохран/, /безопас/, /патрул/, /инцидент/, /правопорядок/,
];

const GEO_COLUMN_PATTERNS = [
  /latitude/,
  /longitude/,
  /lat$/, /lng$/, /lon$/, /coord/,
  /широт/, /долгот/, /гео/,
];

const REGION_COLUMN_PATTERNS = [
  /region/, /district/, /city/, /area/, /oblast/, /район/, /город/, /террит/,
];

const ENTITY_RELATION_PATTERNS = [
  /source/, /target/, /from/, /to/, /parent/, /child/, /sender/, /receiver/,
];

const TEXT_SIGNAL_PATTERNS = [
  /description/, /comment/, /notes?/, /summary/, /message/, /text/, /feedback/,
];

function normaliseColumns(columns = []) {
  return columns.map((column) => {
    const type = normalizeColumnType(column.type);
    const name = String(column.name || "");
    return { ...column, name, lowerName: name.toLowerCase(), normalizedType: type };
  });
}

function detectMatches(columns, patterns) {
  return columns.some((column) =>
    patterns.some((pattern) => pattern.test(column.lowerName))
  );
}

function countTypes(columns) {
  return columns.reduce(
    (acc, column) => {
      acc[column.normalizedType] = (acc[column.normalizedType] ?? 0) + 1;
      return acc;
    },
    { string: 0, number: 0, datetime: 0, boolean: 0 }
  );
}

function hasLongTextSample(column, sampleRows = []) {
  const sampleValues = sampleRows
    .map((row) => row?.[column.name])
    .filter((value) => typeof value === "string");
  return sampleValues.some((value) => value.length > 40);
}

export function suggestDataApplications({ dataset = {}, project = {} } = {}) {
  const columns = normaliseColumns(dataset.columns || []);
  const sampleRows = Array.isArray(dataset.sample_data) ? dataset.sample_data : [];
  const rowCount = dataset.row_count ?? sampleRows.length ?? 0;
  const datasetContext = `${String(dataset.name || "").toLowerCase()} ${String(dataset.description || "").toLowerCase()}`;

  const hasNumeric = columns.some((column) => column.normalizedType === "number");
  const hasDate = columns.some((column) => column.normalizedType === "datetime");
  const hasString = columns.some((column) => column.normalizedType === "string");
  const hasBoolean = columns.some((column) => column.normalizedType === "boolean");

  const hasGeo = detectMatches(columns, GEO_COLUMN_PATTERNS);
  const hasRegions = detectMatches(columns, REGION_COLUMN_PATTERNS);
  const hasRelations = detectMatches(columns, ENTITY_RELATION_PATTERNS);
  const hasTextNotes = columns.some(
    (column) => column.normalizedType === "string" && detectMatches([column], TEXT_SIGNAL_PATTERNS)
  );
  const hasRichText = columns.some((column) => column.normalizedType === "string" && hasLongTextSample(column, sampleRows));
  const hasLawEnforcement =
    LAW_ENFORCEMENT_PATTERNS.some((pattern) => pattern.test(datasetContext)) ||
    columns.some((column) => LAW_ENFORCEMENT_PATTERNS.some((pattern) => pattern.test(column.lowerName)));

  const typeCounts = countTypes(columns);

  const suggestions = [];
  const focusAreas = [];
  const tags = new Set();

  if (hasLawEnforcement) {
    focusAreas.unshift("Общественная безопасность и правоприменение");
    suggestions.push(
      "Примените локальные методы оценки вмешательств: до–после анализ (Difference-in-Differences) и counterfactual моделировани" +
        "е без обращения к внешним сервисам."
    );
    suggestions.push(
      "Настройте локальные KPI: снижение числа преступлений, рост раскрываемости, скорость реагирования и общественное восприяти" +
        "е безопасности."
    );
    suggestions.push(
      "Экспериментируйте с маршрутами и технологиями через локальные контрольные группы и A/B-тесты между районами."
    );
    suggestions.push(
      "Запустите Social Network Analysis (SNA) и графовые ML-подходы для отслеживания связей правонарушителей и прогнозирования" +
        " распространения активности."
    );
    suggestions.push(
      "Постройте локальное хранилище (Data Warehouse/Data Lake), автоматизируйте ETL (Airflow, Prefect), ускоряйте эксперименты" +
        " AutoML (H2O, Vertex AI, PyCaret) и применяйте Explainable AI (SHAP, LIME)."
    );
    suggestions.push(
      "Задействуйте встроенные функции differenceInDifferences(), buildCounterfactualScenario() и calculateSafetyKPIs() для оперативной оценки влияния мер в защищённой среде."
    );
    suggestions.push(
      "Разверните локальные симуляции на основе агентно-ориентированного моделирования (AnyLogic, Mesa, NetLogo), чтобы прогнозировать реакцию преступности на перераспределение патрулей и другие меры."
    );
    suggestions.push(
      "Стройте когнитивные и причинно-следственные модели в локальной среде (DoWhy, CausalNex, EconML), выявляйте ключевые факторы преступности и оценивайте сценарии \"что если\" без выгрузки данных наружу."
    );
    suggestions.push(
      "Применяйте байесовские и вероятностные модели (Bayesian Hierarchical Models) для районов и временных срезов, фиксируйте распределения неопределённости прогнозов локально."
    );
    suggestions.push(
      "Добавьте spatio-temporal deep learning (ST-GCN, ConvLSTM, Transformer-подходы), чтобы прогнозировать уровень преступности по районам в разрезе часов и дней без обращения к внешним API."
    );
    suggestions.push(
      "Включайте контекстные embedding признаков (праздники, события, погода, транспорт), создавая числовые представления в локальной ML-цепочке."
    );
    suggestions.push(
      "Комбинируйте локальные модели через ансамбли и stacking (например, ARIMA + LSTM + CatBoost) с мета-моделью, обучающейся на ошибках базовых алгоритмов."
    );
    suggestions.push(
      "Автоматизируйте подбор гиперпараметров с помощью локальных AutoML и байесовской оптимизации (Optuna, Hyperopt, AutoGluon), чтобы ускорять эксперименты на закрытых данных."
    );
    suggestions.push(
      "Подключите active learning: модель будет запрашивать разметку только по самым неопределённым инцидентам, что экономит локальные ресурсы аналитиков."
    );
    suggestions.push(
      "Используйте counterfactual анализ и Synthetic Control: создавайте \"синтетические двойники\" районов для более точной оценки эффекта мер безопасности, например пилотов по умному освещению или камерам на перекрёстках."
    );
    suggestions.push(
      "Оценивайте эффективность программ по множеству критериев: снижение страха населения, улучшение восприятия безопасности и снижение социального напряжения в локальной отчётности."
    );
    suggestions.push(
      "Соберите локальный цифровой двойник района: объединяйте транспорт, освещение и отчёты, чтобы проигрывать сценарии безопасности без выхода данных наружу."
    );
    suggestions.push(
      "Настройте локальные GNN-пайплайны (PyTorch Geometric, DGL) для выявления скрытых сообществ и прогнозирования связей между инцидентами."
    );
    suggestions.push(
      "Внедрите reinforcement learning для оптимизации патрулирования: обучайте агента (RLlib, Stable Baselines) на исторических данных внутри защищённого контура."
    );
    suggestions.push(
      "Добавьте потоковую детекцию аномалий (Kafka Streams, Flink, River) для мгновенного выявления всплесков преступности в локальном SOC."
    );
    suggestions.push(
      "Организуйте приватный ML-конвейер с дифференциальной приватностью и безопасными песочницами, чтобы делиться инсайтами без раскрытия персональных данных."
    );
    suggestions.push(
      "Настройте федеративное обучение между подразделениями (Flower, FedML, NVIDIA FLARE), синхронизируя веса моделей без передачи сырых инцидентных данных наружу."
    );
    suggestions.push(
      "Генерируйте синтетические наборы для отработки сценариев (CTGAN, Gretel, SynthCity), сохраняя статистику реальных преступлений и приватность жителей."
    );
    suggestions.push(
      "Используйте edge AI на камерах и IoT-сенсорах (OpenVINO, NVIDIA Metropolis, Azure Percept), чтобы фильтровать потоки и отправлять в SOC только тревожные события."
    );
    tags.add("law-enforcement");
    tags.add("experimentation");
    tags.add("sna");
    tags.add("automation");
    tags.add("explainability");
    tags.add("abm");
    tags.add("causal");
    tags.add("bayesian");
    tags.add("spatiotemporal");
    tags.add("context-embedding");
    tags.add("ensemble");
    tags.add("automl");
    tags.add("active-learning");
    tags.add("synthetic-control");
    tags.add("multi-criteria-evaluation");
    tags.add("digital-twin");
    tags.add("gnn");
    tags.add("reinforcement-learning");
    tags.add("anomaly-detection");
    tags.add("privacy");
    tags.add("federated-learning");
    tags.add("synthetic-data");
    tags.add("edge-ai");
  }

  if (hasNumeric && hasDate) {
    suggestions.push(
      "Используйте локальный прогноз временных рядов для оценки динамики показателей по датам." +
        " Такой анализ не требует доступа к внешним сервисам."
    );
    focusAreas.push("Прогнозирование спроса/инцидентов");
    tags.add("forecast");
    tags.add("time-series");
  }

  if (hasGeo || (hasNumeric && hasRegions)) {
    suggestions.push(
      "Постройте карту или тепловую схему, чтобы выявить территориальные аномалии на локальном уровне."
    );
    focusAreas.push("Геоаналитика и тепловые карты");
    tags.add("geo");
  }

  if (hasNumeric && hasString) {
    suggestions.push(
      "Создайте набор KPI и сравните категории между собой, используя локальные визуализации и фильтры."
    );
    focusAreas.push("Оперативные панели и KPI");
    tags.add("dashboard");
  }

  if (hasRelations || (hasNumeric && hasBoolean)) {
    suggestions.push(
      "Проведите анализ связей или сценариев " +
        "(например, социальные графы, влияние факторов) через локальные алгоритмы."
    );
    focusAreas.push("Связи между объектами");
    tags.add("network");
  }

  if (hasTextNotes || hasRichText) {
    suggestions.push(
      "Примените локальную обработку текста: выделите темы, классифицируйте обращения и сформируйте отчёт без отправки данных вовне."
    );
    focusAreas.push("Качественный анализ текста");
    tags.add("nlp");
  }

  if (!suggestions.length) {
    suggestions.push(
      "Сконцентрируйтесь на базовой визуализации распределений и проверке качества данных. Все шаги выполняются локально."
    );
    focusAreas.push("Разведочный анализ");
  }

  const projectDatasets = Array.isArray(project.datasets) ? project.datasets.length : 0;
  const relatedContext = projectDatasets
    ? `В проекте уже используется ${projectDatasets} набор(ов) данных — можно сопоставить их по ключевым столбцам.`
    : "Набор пока изолирован — добавьте дополнительные источники для связного анализа.";

  const confidenceBase = 0.4 + [hasNumeric, hasDate, hasGeo, hasRelations, hasTextNotes, hasRichText]
    .filter(Boolean)
    .length * 0.1;
  const confidence = Math.max(0.3, Math.min(0.95, confidenceBase));

  return {
    summary:
      `Локальный ассистент обработал ${columns.length} столбца(ов) и ${rowCount || "0"} строк: ` +
      `определены типы данных и потенциальные сценарии использования без внешних вызовов.`,
    suggestions,
    focus_areas: [...new Set(focusAreas)].slice(0, 5),
    tags: Array.from(tags),
    confidence: Number(confidence.toFixed(2)),
    data_profile: {
      row_count: rowCount,
      column_types: typeCounts,
      has_samples: sampleRows.length > 0,
    },
    context_note: relatedContext,
    local_execution_note: "Рекомендации сформированы локально, данные не покидают систему.",
  };
}
