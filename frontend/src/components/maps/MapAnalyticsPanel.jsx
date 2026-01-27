import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, MapPin, TrendingUp, Activity, ShieldAlert, Flame } from "lucide-react";
import { computeMapAnalytics } from "@/utils/mapAnalytics";
import samplePoints from "./sampleData";

const formatNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  if (typeof value === "number") {
    return value.toLocaleString("ru-RU", {
      maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
    });
  }

  return value;
};

const formatPercent = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%`;
};

const buildInsights = (analytics) => {
  const insights = [];

  if (analytics.maxPoint && analytics.averageValue !== null) {
    const diff = analytics.maxPoint.value - analytics.averageValue;
    const percent = analytics.averageValue !== 0
      ? (diff / analytics.averageValue) * 100
      : null;
    insights.push(
      `${analytics.maxPoint.name || "Локация"} выделяется на карте со значением ${formatNumber(analytics.maxPoint.value)}${percent !== null ? `, что на ${percent.toFixed(1)}% выше среднего` : ""}.`
    );
  }

  if (analytics.forecast?.hasForecast && analytics.forecast.deltaFromValue !== null) {
    const sign = analytics.forecast.deltaFromValue >= 0 ? "рост" : "снижение";
    insights.push(
      `Прогноз показывает ${sign} в среднем на ${formatNumber(Math.abs(analytics.forecast.deltaFromValue))} относительно текущих значений.`
    );
  }

  if (analytics.correlation?.hasCorrelation && analytics.correlation.strongestPositive) {
    insights.push(
      `Наиболее сильная положительная связь у ${analytics.correlation.strongestPositive.name || "одной из точек"}: ${analytics.correlation.strongestPositive.correlation.toFixed(2)}.`
    );
  }

  if (analytics.categories.length > 1) {
    const topCategory = analytics.categories[0];
    insights.push(
      `Чаще всего встречается категория «${topCategory.name}» — ${topCategory.count} точек.`
    );
  }

  if (analytics.risk?.hasRisk) {
    const highRisk = analytics.risk.distribution.find((item) => item.level === "Высокий");
    if (highRisk) {
      insights.push(
        `Выделено ${highRisk.count} точек с высоким уровнем криминогенного риска — рекомендуется приоритизировать эти зоны.`
      );
    }

    if (analytics.risk.hotspots?.length) {
      const topHotspot = analytics.risk.hotspots[0];
      insights.push(
        `${topHotspot.name} демонстрирует наибольшую концентрацию инцидентов (${formatNumber(topHotspot.value)}), что указывает на необходимость оперативных мер.`
      );
    }

    if (analytics.risk.pressureIndex !== null) {
      insights.push(
        `Индекс криминогенной нагрузки ${formatPercent(analytics.risk.pressureIndex)} отражает разницу между средним уровнем происшествий и наиболее проблемными районами.`
      );
    }
  }

  if (analytics.layers?.demography?.hasData && analytics.layers.demography.topDensity) {
    insights.push(
      `${analytics.layers.demography.topDensity.name} лидирует по плотности (${formatNumber(
        analytics.layers.demography.topDensity.density
      )} чел./км²), при этом средняя нагрузка составляет ${
        analytics.layers.demography.averageDensity !== null
          ? formatNumber(analytics.layers.demography.averageDensity)
          : '—'
      }.`
    );
  }

  if (analytics.layers?.spatial?.hasData && analytics.layers.spatial.topOutlier) {
    insights.push(
      `${analytics.layers.spatial.topOutlier.name} выделяется пространственно: отклонение от соседей составляет ${analytics.layers.spatial.topOutlier.deviation.toFixed(
        1
      )}.`
    );
  }

  if (analytics.layers?.trend?.hasData && analytics.layers.trend.topGrowth) {
    insights.push(
      `${analytics.layers.trend.topGrowth.name} показывает самый высокий темп изменения (${formatPercent(
        analytics.layers.trend.topGrowth.change
      )}), в то время как средний тренд по карте ${
        analytics.layers.trend.averageChange !== null
          ? formatPercent(analytics.layers.trend.averageChange)
          : 'не рассчитан'
      }.`
    );
  }

  if (analytics.layers?.logistics?.hasData && analytics.layers.logistics.slowestRoute) {
    insights.push(
      `Самый продолжительный маршрут — ${analytics.layers.logistics.slowestRoute.name} (${formatNumber(
        analytics.layers.logistics.slowestRoute.travel
      )} мин). Рассмотрите оптимизацию коридора ${analytics.layers.logistics.corridors?.[0] || ''}.`
    );
  }

  if (analytics.layers?.climate?.hasData && analytics.layers.climate.highestRisk) {
    insights.push(
      `${analytics.layers.climate.highestRisk.name} имеет максимальный климатический риск ${formatPercent(
        analytics.layers.climate.highestRisk.risk
      )} — стоит подготовить план реагирования.`
    );
  }

  return insights.slice(0, 3);
};

export default function MapAnalyticsPanel({ data, config, datasets, isLoading }) {
  const selectedDataset = useMemo(
    () => datasets?.find((dataset) => dataset.id === config?.dataset_id),
    [datasets, config?.dataset_id]
  );

  const datasetLabel = useMemo(() => {
    if (selectedDataset?.name) {
      return selectedDataset.name;
    }

    if (config?.dataset_id === "sample") {
      return "Образец данных";
    }

    return "";
  }, [selectedDataset?.name, config]);

  const fallbackSample = useMemo(
    () => (config?.dataset_id === "sample" ? samplePoints : undefined),
    [config]
  );

  const analytics = useMemo(
    () =>
      computeMapAnalytics(data, config, {
        datasetSample: selectedDataset?.sample_data,
        datasetId: config?.dataset_id,
        datasetName: datasetLabel,
        fallbackSample,
      }),
    [data, config, selectedDataset?.sample_data, datasetLabel, fallbackSample]
  );

  const insights = useMemo(() => buildInsights(analytics), [analytics]);

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <BarChart3 className="w-5 h-5 text-emerald-500" />
          Аналитика карты
        </CardTitle>
        {analytics.datasetLabel && (
          <p className="text-sm text-slate-500">
            Источник данных: {analytics.datasetLabel}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : analytics.hasData ? (
          <>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>Точек на карте</span>
                  <MapPin className="h-4 w-4 text-blue-500" />
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {analytics.validPoints} <span className="text-sm font-normal text-slate-500">из {analytics.totalPoints}</span>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>Среднее {analytics.valueLabel.toLowerCase()}</span>
                  <TrendingUp className="h-4 w-4 text-purple-500" />
                </div>
                <div className="mt-1 text-2xl font-semibold text-slate-900">
                  {formatNumber(analytics.averageValue)}
                </div>
              </div>
              {analytics.maxPoint && (
                <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 shadow-sm">
                  <div className="flex items-center justify-between text-sm text-slate-500">
                    <span>Максимум</span>
                    <Activity className="h-4 w-4 text-rose-500" />
                  </div>
                  <div className="mt-1 text-2xl font-semibold text-slate-900">
                    {formatNumber(analytics.maxPoint.value)}
                  </div>
                  <div className="text-sm text-slate-600">
                    {analytics.maxPoint.name || "Без названия"}
                  </div>
                </div>
              )}
            </div>

            {analytics.categories.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-700">Распределение категорий</h4>
                <div className="flex flex-wrap gap-2">
                  {analytics.categories.map((category) => (
                    <Badge key={category.name} variant="secondary" className="rounded-full bg-blue-50 text-blue-700">
                      {category.name}
                      <span className="ml-2 text-xs text-blue-600">{category.count}</span>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {(analytics.layers?.demography?.hasData ||
              analytics.layers?.spatial?.hasData ||
              analytics.layers?.trend?.hasData ||
              analytics.layers?.hotspots?.hasData ||
              analytics.layers?.logistics?.hasData ||
              analytics.layers?.climate?.hasData) && (
              <div className="grid gap-3 md:grid-cols-2">
                {analytics.layers?.demography?.hasData && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-emerald-700">Демография</div>
                    <div className="mt-2 text-xs text-emerald-700 flex justify-between">
                      <span>Средняя плотность</span>
                      <span>{formatNumber(analytics.layers.demography.averageDensity)} чел./км²</span>
                    </div>
                    <div className="text-xs text-emerald-700 flex justify-between">
                      <span>Средний доход</span>
                      <span>{formatNumber(analytics.layers.demography.averageIncome)} ₽</span>
                    </div>
                    {analytics.layers.demography.lowestUnemployment && (
                      <div className="mt-1 text-xs text-emerald-700">
                        Минимальная безработица: <span className="font-semibold">{analytics.layers.demography.lowestUnemployment.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {analytics.layers?.spatial?.hasData && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-purple-700">Пространственные аномалии</div>
                    <div className="mt-2 text-xs text-purple-700">
                      Локация: <span className="font-semibold">{analytics.layers.spatial.topOutlier.name}</span>
                    </div>
                    <div className="text-xs text-purple-700">
                      Отклонение: {analytics.layers.spatial.topOutlier.deviation.toFixed(1)}
                    </div>
                    {analytics.layers.spatial.averageIntensity !== null && (
                      <div className="text-xs text-purple-700">
                        Средняя интенсивность: {analytics.layers.spatial.averageIntensity.toFixed(2)}
                      </div>
                    )}
                  </div>
                )}

                {analytics.layers?.trend?.hasData && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-rose-700">Динамика и сезонность</div>
                    <div className="mt-2 text-xs text-rose-700">
                      Средний тренд: {analytics.layers.trend.averageChange !== null ? formatPercent(analytics.layers.trend.averageChange) : '—'}
                    </div>
                    <div className="text-xs text-rose-700">
                      Волатильность: {analytics.layers.trend.averageVolatility !== null ? formatPercent(analytics.layers.trend.averageVolatility) : '—'}
                    </div>
                    {analytics.layers.trend.topGrowth && (
                      <div className="text-xs text-rose-700">
                        Лидер роста: <span className="font-semibold">{analytics.layers.trend.topGrowth.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {analytics.layers?.hotspots?.hasData && (
                  <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-red-700">Горячие точки</div>
                    <div className="mt-2 text-xs text-red-700">
                      Всего инцидентов: {formatNumber(analytics.layers.hotspots.total)}
                    </div>
                    {analytics.layers.hotspots.topIncident && (
                      <div className="text-xs text-red-700">
                        Лидирует: <span className="font-semibold">{analytics.layers.hotspots.topIncident.name}</span>
                      </div>
                    )}
                  </div>
                )}

                {analytics.layers?.logistics?.hasData && (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-sky-700">Логистика и сервис</div>
                    <div className="mt-2 text-xs text-sky-700">
                      Маршрутов: {analytics.layers.logistics.corridors?.length || 0}
                    </div>
                    {analytics.layers.logistics.fastestRoute && (
                      <div className="text-xs text-sky-700">
                        Быстрее всего: <span className="font-semibold">{analytics.layers.logistics.fastestRoute.name}</span> ({formatNumber(analytics.layers.logistics.fastestRoute.travel)} мин)
                      </div>
                    )}
                  </div>
                )}

                {analytics.layers?.climate?.hasData && (
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-4 shadow-sm">
                    <div className="text-sm font-semibold text-cyan-700">Погодные условия</div>
                    <div className="mt-2 text-xs text-cyan-700">
                      Средняя температура: {analytics.layers.climate.averageTemp !== null ? `${analytics.layers.climate.averageTemp.toFixed(1)}°C` : '—'}
                    </div>
                    <div className="text-xs text-cyan-700">
                      Осадки: {analytics.layers.climate.averagePrecip !== null ? `${analytics.layers.climate.averagePrecip.toFixed(1)} мм` : '—'}
                    </div>
                    {analytics.layers.climate.highestRisk && (
                      <div className="text-xs text-cyan-700">
                        Макс. риск: <span className="font-semibold">{analytics.layers.climate.highestRisk.name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {analytics.risk?.hasRisk && (
              <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                    <ShieldAlert className="h-4 w-4" />
                    Индекс криминогенной нагрузки
                  </div>
                  {analytics.risk.pressureIndex !== null && (
                    <span className="text-xs font-semibold text-rose-600">
                      {formatPercent(analytics.risk.pressureIndex)}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {analytics.risk.distribution.map((item) => (
                    <Badge
                      key={item.level}
                      variant="secondary"
                      className={`rounded-full border ${
                        item.level === "Высокий"
                          ? "border-rose-300 bg-rose-100 text-rose-700"
                          : item.level === "Средний"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {item.level}
                      <span className="ml-2 text-xs text-slate-600">{item.count}</span>
                    </Badge>
                  ))}
                </div>

                {analytics.risk.hotspots.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                      <Flame className="h-3 w-3" />
                      Точки повышенного риска
                    </div>
                    <ul className="space-y-2">
                      {analytics.risk.hotspots.map((hotspot, index) => (
                        <li
                          key={`${hotspot.name}-${index}`}
                          className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-sm text-slate-600"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{hotspot.name}</div>
                            <div className="text-xs text-slate-500">{hotspot.riskLevel} риск</div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-rose-600">{formatNumber(hotspot.value)}</div>
                            {(hotspot.lat !== null && hotspot.lon !== null) && (
                              <div className="text-[11px] text-slate-400">
                                {hotspot.lat.toFixed(2)}, {hotspot.lon.toFixed(2)}
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {(analytics.forecast?.hasForecast || analytics.correlation?.hasCorrelation) && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                {analytics.forecast?.hasForecast && (
                  <div>
                    <div className="text-sm font-semibold text-slate-700">Прогноз</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Среднее значение прогноза: <span className="font-semibold text-slate-900">{formatNumber(analytics.forecast.average)}</span>
                    </div>
                    {analytics.forecast.deltaFromValue !== null && (
                      <div className="text-sm text-slate-600">
                        Отклонение от текущих значений: {formatNumber(analytics.forecast.deltaFromValue)}
                      </div>
                    )}
                  </div>
                )}

                {analytics.forecast?.hasForecast && analytics.forecast.highestGrowthPoint && (
                  <div className="rounded-lg bg-white/70 p-3 text-sm text-slate-600">
                    Локация с наибольшим ростом: <span className="font-semibold text-slate-900">{analytics.forecast.highestGrowthPoint.name || "Без названия"}</span>
                  </div>
                )}

                {analytics.correlation?.hasCorrelation && (
                  <div className="text-sm text-slate-600">
                    Средняя корреляция: <span className="font-semibold text-slate-900">{analytics.correlation.average?.toFixed(2)}</span>
                  </div>
                )}

                {analytics.correlation?.hasCorrelation && (
                  <div className="flex flex-col gap-2 text-sm text-slate-600">
                    {analytics.correlation.strongestPositive && (
                      <div>
                        Сильнейшая положительная связь: <span className="font-semibold text-slate-900">{analytics.correlation.strongestPositive.name || "Без названия"}</span>
                        {" "}
                        ({analytics.correlation.strongestPositive.correlation.toFixed(2)})
                      </div>
                    )}
                    {analytics.correlation.strongestNegative && (
                      <div>
                        Сильнейшая отрицательная связь: <span className="font-semibold text-slate-900">{analytics.correlation.strongestNegative.name || "Без названия"}</span>
                        {" "}
                        ({analytics.correlation.strongestNegative.correlation.toFixed(2)})
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {insights.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <h4 className="text-sm font-semibold text-slate-700">Ключевые наблюдения</h4>
                <ul className="space-y-2 text-sm text-slate-600">
                  {insights.map((insight, index) => (
                    <li key={index} className="rounded-lg bg-white/70 p-3 shadow-sm">
                      {insight}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
            Недостаточно данных для расчёта аналитики. Выберите набор данных и убедитесь, что указаны корректные столбцы широты, долготы и значения.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
