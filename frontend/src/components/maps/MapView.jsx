import React, { useMemo } from 'react';
import { MapContainer, Popup, CircleMarker, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge } from "@/components/ui/badge";
import { parseCoordinate, parseNumericValue, findNameField, findFirstValue } from "@/utils/mapUtils";
import samplePoints, { sampleTimeSeries } from "./sampleData";

const DEFAULT_POSITION = [55.7558, 37.6173];

const getValueByColumn = (point, column, fallbackKeys = []) => {
  if (column && point && point[column] !== undefined && point[column] !== null) {
    return point[column];
  }
  for (const key of fallbackKeys) {
    if (point && point[key] !== undefined && point[key] !== null) {
      return point[key];
    }
  }
  return null;
};

const resolveDemography = (point, config) => ({
  density: parseNumericValue(
    getValueByColumn(point, config?.demography_population_column, [
      'population_density',
      'density',
    ])
  ),
  income: parseNumericValue(
    getValueByColumn(point, config?.demography_income_column, ['average_income', 'income'])
  ),
  unemployment: parseNumericValue(
    getValueByColumn(point, config?.demography_unemployment_column, ['unemployment_rate'])
  ),
});

const resolveTrend = (point, config) => ({
  value: parseNumericValue(
    getValueByColumn(point, config?.trend_metric_column || config?.value_column, ['value'])
  ),
  change: parseNumericValue(getValueByColumn(point, null, ['trend_change', 'change_rate', 'growth_rate'])),
  volatility: parseNumericValue(getValueByColumn(point, null, ['trend_volatility', 'volatility_level'])),
});

const resolveHotspot = (point, config) => ({
  metric: parseNumericValue(
    getValueByColumn(point, config?.hotspot_metric_column || config?.value_column, ['incident_count', 'value'])
  ),
  change: parseNumericValue(getValueByColumn(point, null, ['incident_change', 'change_percent'])),
});

const resolveLogistics = (point, config) => ({
  corridor: getValueByColumn(point, config?.logistics_corridor_column, ['logistics_corridor', 'corridor', 'route']),
  travelTime: parseNumericValue(
    getValueByColumn(point, config?.logistics_travel_time_column, ['travel_time_minutes', 'travel_minutes'])
  ),
  serviceRadius: parseNumericValue(
    getValueByColumn(point, config?.logistics_service_radius_column, ['service_radius_km', 'radius_km'])
  ),
});

const resolveClimate = (point, config) => ({
  temperature: parseNumericValue(
    getValueByColumn(point, config?.climate_temperature_column, ['weather_temperature', 'temperature'])
  ),
  precipitation: parseNumericValue(
    getValueByColumn(point, config?.climate_precipitation_column, ['weather_precipitation', 'precipitation'])
  ),
  risk: parseNumericValue(
    getValueByColumn(point, config?.climate_risk_column, ['climate_risk', 'risk_index'])
  ),
});

const computeSpatialDetails = (points, config) => {
  if (config?.overlay_type !== 'spatial' || !Array.isArray(points) || points.length < 3) {
    return null;
  }

  const metricColumn = config?.spatial_metric_column || config?.value_column;
  if (!metricColumn) {
    return null;
  }

  const entries = points
    .map((point, index) => {
      const lat = config?.lat_column
        ? parseCoordinate(point[config.lat_column])
        : parseCoordinate(point.lat);
      const lon = config?.lon_column
        ? parseCoordinate(point[config.lon_column])
        : parseCoordinate(point.lon);
      const metric = parseNumericValue(
        getValueByColumn(point, metricColumn, ['value', 'metric'])
      );
      if (lat === null || lon === null || metric === null) {
        return null;
      }
      return { index, lat, lon, metric };
    })
    .filter(Boolean);

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
      map.set(entry.index, { neighborAverage: null, deviation: null, intensity: null });
      return;
    }

    const neighborAverage =
      neighbors.reduce((sum, neighbor) => sum + neighbor.metric, 0) / neighbors.length;
    const deviation = entry.metric - neighborAverage;
    const intensity = neighborAverage !== 0 ? deviation / Math.abs(neighborAverage) : null;

    map.set(entry.index, { neighborAverage, deviation, intensity });
  });

  return map;
};

const formatValue = (value) => {
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

const getCategoryColor = (category) => {
  const colors = {
    'Мегаполис': 'bg-red-100 text-red-700',
    'Культурный центр': 'bg-purple-100 text-purple-700',
    'Промышленный': 'bg-orange-100 text-orange-700',
    'Научный': 'bg-blue-100 text-blue-700',
    'Региональный': 'bg-green-100 text-green-700',
    'Образовательный': 'bg-indigo-100 text-indigo-700',
    'Торговый': 'bg-yellow-100 text-yellow-700'
  };
  return colors[category] || 'bg-gray-100 text-gray-700';
};

export default function MapView({
  data,
  config,
  height = 'clamp(720px, 78vh, 960px)',
  overlayInfo,
  analyticsOverlay,
}) {
  const timeComparisonActive = useMemo(() => {
    return Boolean(
      config?.time_column &&
      config?.base_period &&
      config?.comparison_period &&
      config.base_period !== config.comparison_period
    );
  }, [config?.time_column, config?.base_period, config?.comparison_period]);

  const defaultPoints = useMemo(() => {
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    if (config?.dataset_id && config.dataset_id !== 'sample') {
      return [];
    }
    return samplePoints;
  }, [data, config?.dataset_id]);

  const comparisonSource = useMemo(() => {
    if (!timeComparisonActive) {
      return [];
    }
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    if (config?.dataset_id === 'sample') {
      return sampleTimeSeries;
    }
    return [];
  }, [timeComparisonActive, data, config?.dataset_id]);

  const comparisonPoints = useMemo(() => {
    if (!timeComparisonActive || comparisonSource.length === 0) {
      return [];
    }

    const latColumn = config?.lat_column || 'lat';
    const lonColumn = config?.lon_column || 'lon';
    const valueColumn = config?.value_column || 'value';
    const timeColumn = config?.time_column;
    const basePeriod = config?.base_period ? String(config.base_period) : '';
    const comparisonPeriod = config?.comparison_period ? String(config.comparison_period) : '';

    const locations = new Map();

    comparisonSource.forEach((row, index) => {
      const latValue = parseCoordinate(
        findFirstValue(row, [latColumn, 'lat', 'latitude', 'Lat', 'LAT'])
      );
      const lonValue = parseCoordinate(
        findFirstValue(row, [lonColumn, 'lon', 'longitude', 'Lng', 'LON'])
      );
      const rawValue = findFirstValue(row, [valueColumn, 'value', 'amount', 'metric', 'measure']);
      const value = parseNumericValue(rawValue);
      const periodValue = row?.[timeColumn];
      const period = periodValue !== null && periodValue !== undefined ? String(periodValue) : null;

      if (latValue === null || lonValue === null || value === null || period === null) {
        return;
      }

      const name = findNameField(row) || row?.name || row?.city || `Локация ${index + 1}`;
      const key = `${latValue.toFixed(6)}_${lonValue.toFixed(6)}_${name}`;

      if (!locations.has(key)) {
        locations.set(key, {
          lat: latValue,
          lon: lonValue,
          name,
          category: row?.category,
          description: row?.description,
          baseValue: null,
          comparisonValue: null,
          history: {},
          rawPoints: [],
        });
      }

      const entry = locations.get(key);
      entry.history[period] = value;
      entry.rawPoints.push({ period, value, original: row });

      if (period === basePeriod) {
        entry.baseValue = value;
      }

      if (period === comparisonPeriod) {
        entry.comparisonValue = value;
      }

      if (!entry.category && row?.category) {
        entry.category = row.category;
      }

      if (!entry.description && row?.description) {
        entry.description = row.description;
      }
    });

    return Array.from(locations.values())
      .filter((entry) => entry.baseValue !== null && entry.comparisonValue !== null)
      .map((entry) => {
        const change = entry.comparisonValue - entry.baseValue;
        const changePercent = entry.baseValue !== 0 ? change / entry.baseValue : null;
        return {
          ...entry,
          change,
          changePercent,
          basePeriod,
          comparisonPeriod,
        };
      });
  }, [timeComparisonActive, comparisonSource, config?.lat_column, config?.lon_column, config?.value_column, config?.time_column, config?.base_period, config?.comparison_period]);

  const pointsToRender = timeComparisonActive && comparisonPoints.length > 0 ? comparisonPoints : defaultPoints;

  const spatialStats = useMemo(
    () => computeSpatialDetails(pointsToRender, config),
    [pointsToRender, config]
  );

  const shouldShowEmptyState = useMemo(() => {
    if (timeComparisonActive) {
      return comparisonPoints.length === 0;
    }

    if (!config?.dataset_id || config.dataset_id === 'sample') {
      return false;
    }

    return !Array.isArray(data) || data.length === 0;
  }, [timeComparisonActive, comparisonPoints.length, config?.dataset_id, data]);

  const firstValidPoint = useMemo(() => {
    if (timeComparisonActive && comparisonPoints.length > 0) {
      return comparisonPoints[0];
    }

    return defaultPoints.find((point) => {
      const latValue = config?.lat_column ? parseCoordinate(point[config.lat_column]) : parseCoordinate(point.lat);
      const lonValue = config?.lon_column ? parseCoordinate(point[config.lon_column]) : parseCoordinate(point.lon);
      return latValue !== null && lonValue !== null;
    });
  }, [timeComparisonActive, comparisonPoints, defaultPoints, config?.lat_column, config?.lon_column]);

  const mapCenter = firstValidPoint
    ? [
        timeComparisonActive && comparisonPoints.length > 0
          ? firstValidPoint.lat
          : config?.lat_column
            ? parseCoordinate(firstValidPoint[config.lat_column])
            : parseCoordinate(firstValidPoint.lat),
        timeComparisonActive && comparisonPoints.length > 0
          ? firstValidPoint.lon
          : config?.lon_column
            ? parseCoordinate(firstValidPoint[config.lon_column])
            : parseCoordinate(firstValidPoint.lon),
      ]
    : (() => {
        if (!pointsToRender.length) {
          return DEFAULT_POSITION;
        }
        const fallbackLat = timeComparisonActive && comparisonPoints.length > 0
          ? comparisonPoints[0].lat
          : config?.lat_column
            ? parseCoordinate(pointsToRender[0][config.lat_column])
            : parseCoordinate(pointsToRender[0].lat);
        const fallbackLon = timeComparisonActive && comparisonPoints.length > 0
          ? comparisonPoints[0].lon
          : config?.lon_column
            ? parseCoordinate(pointsToRender[0][config.lon_column])
            : parseCoordinate(pointsToRender[0].lon);
        if (fallbackLat !== null && fallbackLon !== null) {
          return [fallbackLat, fallbackLon];
        }
        return DEFAULT_POSITION;
      })();

  const getMarkerColor = (point, index, overlayData) => {
    const rawValue = config?.value_column ? point[config.value_column] : point.value;
    const value = parseNumericValue(rawValue);
    const forecastValue = parseNumericValue(point.forecast);
    const correlationValue = parseNumericValue(point.correlation);
    const overlayType = config?.overlay_type;

    if (overlayType === 'forecast' && forecastValue !== null) {
      const intensity = forecastValue / 1000;
      return `hsl(${120 - intensity * 120}, 70%, 50%)`;
    }
    if (overlayType === 'correlation' && correlationValue !== null) {
      const intensity = Math.abs(correlationValue);
      return `hsl(${correlationValue > 0 ? 240 : 0}, 70%, ${50 + intensity * 30}%)`;
    }

    if (overlayType === 'demography' && overlayData?.demography) {
      const density = overlayData.demography.density;
      if (density !== null && density !== undefined) {
        const scaled = Math.max(0, Math.min(density / 6000, 1));
        return `hsl(${240 - scaled * 180}, 70%, ${55 - scaled * 15}%)`;
      }
      const income = overlayData.demography.income;
      if (income !== null && income !== undefined) {
        const scaled = Math.max(0, Math.min(income / 120000, 1));
        return `hsl(${200 - scaled * 140}, 70%, ${60 - scaled * 10}%)`;
      }
    }

    if (overlayType === 'spatial' && spatialStats?.has(index)) {
      const stats = spatialStats.get(index);
      if (stats?.intensity !== null && Number.isFinite(stats.intensity)) {
        const clamped = Math.max(-1, Math.min(stats.intensity, 1));
        const hue = clamped >= 0 ? 160 : 0;
        const lightness = 55 - Math.min(Math.abs(clamped) * 25, 25);
        return `hsl(${hue}, 75%, ${lightness}%)`;
      }
    }

    if (overlayType === 'trend' && overlayData?.trend) {
      const change = overlayData.trend.change;
      if (change !== null && change !== undefined) {
        const scaled = Math.max(-0.3, Math.min(change, 0.3));
        const hue = scaled >= 0 ? 10 : 180;
        const intensity = Math.abs(scaled) / 0.3;
        return `hsl(${hue}, 75%, ${55 - intensity * 20}%)`;
      }
    }

    if (overlayType === 'hotspots' && overlayData?.hotspot) {
      const incidents = overlayData.hotspot.metric;
      if (incidents !== null && incidents !== undefined) {
        const scaled = Math.max(0, Math.min(incidents / 400, 1));
        return `hsl(${15}, 85%, ${60 - scaled * 20}%)`;
      }
    }

    if (overlayType === 'logistics' && overlayData?.logistics) {
      const travel = overlayData.logistics.travelTime;
      if (travel !== null && travel !== undefined) {
        const scaled = Math.max(0, Math.min(travel / 120, 1));
        return `hsl(${150 - scaled * 120}, 70%, ${55 - scaled * 10}%)`;
      }
    }

    if (overlayType === 'climate' && overlayData?.climate) {
      const risk = overlayData.climate.risk;
      if (risk !== null && risk !== undefined) {
        const scaled = Math.max(0, Math.min(risk, 1));
        return `hsl(${scaled * 10}, 80%, ${60 - scaled * 25}%)`;
      }
      const temperature = overlayData.climate.temperature;
      if (temperature !== null && temperature !== undefined) {
        const scaled = Math.max(-20, Math.min(temperature, 30));
        return `hsl(${200 - ((scaled + 20) / 50) * 200}, 70%, 55%)`;
      }
    }

    const intensity = value ? value / 850 : 0;
    return `hsl(${240 - intensity * 60}, 70%, ${45 + intensity * 15}%)`;
  };

  const getMarkerRadius = (point, overlayData) => {
    const rawValue = config?.value_column ? point[config.value_column] : point.value;
    const value = parseNumericValue(rawValue);
    const baseRadius = 8;
    const forecastValue = parseNumericValue(point.forecast);
    const correlationValue = parseNumericValue(point.correlation);

    if (config?.overlay_type === 'forecast' && forecastValue !== null) {
      return baseRadius + (forecastValue / 100);
    }
    if (config?.overlay_type === 'correlation' && correlationValue !== null) {
      return baseRadius + (Math.abs(correlationValue) * 12);
    }
    if (config?.overlay_type === 'demography' && overlayData?.demography?.density !== null) {
      return baseRadius + Math.min(overlayData.demography.density / 500, 18);
    }
    if (config?.overlay_type === 'spatial' && overlayData?.spatial?.deviation !== null) {
      return baseRadius + Math.min(Math.abs(overlayData.spatial.deviation), 15);
    }
    if (config?.overlay_type === 'trend' && overlayData?.trend?.volatility !== null) {
      return baseRadius + Math.min(overlayData.trend.volatility * 20, 12);
    }
    if (config?.overlay_type === 'hotspots' && overlayData?.hotspot?.metric !== null) {
      return baseRadius + Math.min(overlayData.hotspot.metric / 40, 16);
    }
    if (config?.overlay_type === 'logistics' && overlayData?.logistics?.serviceRadius !== null) {
      return baseRadius + Math.min(overlayData.logistics.serviceRadius / 30, 14);
    }
    if (config?.overlay_type === 'climate' && overlayData?.climate?.risk !== null) {
      return baseRadius + Math.min(overlayData.climate.risk * 20, 12);
    }
    return baseRadius + ((value || 0) / 100);
  };

  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;

  return (
    <div
      className="relative w-full overflow-hidden rounded-[28px] border border-white/70 bg-slate-950/95 shadow-[0_30px_70px_rgba(15,23,42,0.22)]"
      style={{ height: resolvedHeight, minHeight: resolvedHeight }}
    >
      <MapContainer
        center={mapCenter}
        zoom={pointsToRender.length > 0 ? 5 : 4}
        scrollWheelZoom={true}
        className="map-neon-theme"
        attributionControl={false}
        style={{
          height: '100%',
          width: '100%',
        }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
        />
        {timeComparisonActive && comparisonPoints.length > 0
          ? comparisonPoints.map((point) => {
              const color = point.change > 0
                ? '#ef4444'
                : point.change < 0
                  ? '#22c55e'
                  : '#f97316';
              const magnitude = Math.abs(point.change);
              const radius = 10 + Math.min(12, Math.log(magnitude + 1) * 2.5);

              return (
                <CircleMarker
                  key={`${point.lat}-${point.lon}-${point.basePeriod}-${point.comparisonPeriod}`}
                  center={[point.lat, point.lon]}
                  radius={radius}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.82,
                    weight: 2,
                  }}
                >
                  <Popup>
                    <div className="space-y-3 min-w-64">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900 heading-text text-lg">
                          {point.name}
                        </h3>
                        {point.category && (
                          <Badge className={getCategoryColor(point.category)}>
                            {point.category}
                          </Badge>
                        )}
                      </div>

                      {point.description && (
                        <p className="text-sm text-slate-600 elegant-text">
                          {point.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center p-2 bg-slate-50 rounded">
                          <div className="text-sm font-semibold text-slate-700">
                            {formatValue(point.baseValue)}
                          </div>
                          <div className="text-xs text-slate-500">{point.basePeriod}</div>
                        </div>
                        <div className="text-center p-2 bg-slate-50 rounded">
                          <div className="text-sm font-semibold text-slate-700">
                            {formatValue(point.comparisonValue)}
                          </div>
                          <div className="text-xs text-slate-500">{point.comparisonPeriod}</div>
                        </div>
                      </div>

                      <div className="rounded bg-white/70 border border-slate-200 p-2">
                        <div className="text-xs uppercase text-slate-500">Динамика</div>
                        <div className={`text-lg font-semibold ${point.change > 0 ? 'text-red-600' : point.change < 0 ? 'text-green-600' : 'text-slate-600'}`}>
                          {point.change > 0 ? '+' : ''}{formatValue(point.change)}
                          {point.changePercent !== null && (
                            <span className="ml-2 text-sm text-slate-500">
                              {point.changePercent > 0 ? '+' : ''}{formatPercent(point.changePercent)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-xs text-slate-400 border-t pt-2 elegant-text">
                        Координаты: {point.lat.toFixed(4)}°, {point.lon.toFixed(4)}°
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })
          : pointsToRender.map((point, index) => {
              const lat = config?.lat_column ? parseCoordinate(point[config.lat_column]) : parseCoordinate(point.lat);
              const lon = config?.lon_column ? parseCoordinate(point[config.lon_column]) : parseCoordinate(point.lon);
              const rawValue = config?.value_column ? point[config.value_column] : point.value;
              const value = parseNumericValue(rawValue);
              const name = findNameField(point) || point.name || point.city || `Точка ${index + 1}`;

              const overlayType = config?.overlay_type;
              const overlayData = {
                demography: overlayType === 'demography' ? resolveDemography(point, config) : null,
                spatial: overlayType === 'spatial' && spatialStats?.has(index) ? spatialStats.get(index) : null,
                trend: overlayType === 'trend' ? resolveTrend(point, config) : null,
                hotspot: overlayType === 'hotspots' ? resolveHotspot(point, config) : null,
                logistics: overlayType === 'logistics' ? resolveLogistics(point, config) : null,
                climate: overlayType === 'climate' ? resolveClimate(point, config) : null,
              };

              if (lat === null || lon === null) {
                return null;
              }

              return (
                <CircleMarker
                  key={`${lat}-${lon}-${index}`}
                  center={[lat, lon]}
                  radius={getMarkerRadius(point, overlayData)}
                  pathOptions={{
                    color: getMarkerColor(point, index, overlayData),
                    fillColor: getMarkerColor(point, index, overlayData),
                    fillOpacity: 0.7,
                    weight: 2
                  }}
                >
                  <Popup>
                    <div className="space-y-3 min-w-64">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-slate-900 heading-text text-lg">
                          {name}
                        </h3>
                        {point.category && (
                          <Badge className={getCategoryColor(point.category)}>
                            {point.category}
                          </Badge>
                        )}
                      </div>

                      {point.description && (
                        <p className="text-sm text-slate-600 elegant-text">
                          {point.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {value !== null && value !== undefined && (
                          <div className="text-center p-2 bg-slate-50 rounded">
                            <div className="text-sm font-semibold text-slate-700">{typeof value === 'number' ? value.toLocaleString('ru-RU') : value}</div>
                            <div className="text-xs text-slate-500">{config?.value_column || 'Значение'}</div>
                          </div>
                        )}

                        {config?.overlay_type === 'forecast' && point.forecast && (
                          <div className="text-center p-2 bg-green-50 rounded">
                            <div className="text-sm font-semibold text-green-700">{point.forecast}</div>
                            <div className="text-xs text-green-600">Прогноз</div>
                          </div>
                        )}

                        {config?.overlay_type === 'correlation' && point.correlation !== undefined && (
                          <div className="text-center p-2 bg-blue-50 rounded">
                            <div className="text-sm font-semibold text-blue-700">{point.correlation.toFixed(2)}</div>
                            <div className="text-xs text-blue-600">Корреляция</div>
                          </div>
                        )}
                      </div>

                      <div className="text-xs text-slate-400 border-t pt-2 elegant-text">
                        Координаты: {lat.toFixed(4)}°, {lon.toFixed(4)}°
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
      </MapContainer>
      {(overlayInfo || analyticsOverlay) && (
        <div className="pointer-events-none absolute inset-0 z-30 flex h-full flex-col justify-between px-8 py-8">
          {overlayInfo && (
            <div className="flex w-[min(380px,calc(100%-64px))] flex-col gap-4 text-white">
              <div className="rounded-3xl border border-white/25 bg-slate-900/65 p-4 shadow-[0_25px_60px_rgba(2,6,23,0.6)] backdrop-blur-xl">
                <p className="text-[11px] uppercase tracking-[0.4em] text-white/70">Источник</p>
                <p className="mt-2 text-2xl font-semibold">{overlayInfo.highlights?.[0]?.value || '—'}</p>
              </div>
              <div className="rounded-3xl border border-white/25 bg-slate-900/60 p-4 text-sm shadow-[0_25px_60px_rgba(2,6,23,0.55)] backdrop-blur-xl">
                <div className="grid grid-cols-2 gap-3">
                  {overlayInfo.highlights?.slice(1).map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/20 bg-white/10 p-3">
                      <p className="text-[11px] uppercase tracking-widest text-white/70">{item.label}</p>
                      <p className="mt-1 text-base font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-white/15 bg-white/10 p-3 text-xs">
                  <p className="mb-2 text-[11px] uppercase tracking-widest text-white/70">Параметры карты</p>
                  <div className="space-y-1 text-white/90">
                    {overlayInfo.settings?.map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span>{item.label}</span>
                        <span className="font-semibold">{item.value}</span>
                      </div>
                    ))}
                  </div>
                  {overlayInfo.tip && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-gradient-to-r from-indigo-500/50 via-blue-500/40 to-cyan-500/35 px-3 py-2 text-xs">
                      <p className="font-semibold uppercase tracking-widest text-white/90">{overlayInfo.tip.title}</p>
                      <p className="text-white/85">{overlayInfo.tip.text}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {analyticsOverlay && (
            <div className="flex w-full justify-center">
              <div className="w-full max-w-5xl rounded-[32px] border border-white/25 bg-slate-950/70 p-6 text-white shadow-[0_40px_90px_rgba(2,6,23,0.65)] backdrop-blur-2xl">
                <div className="flex flex-col gap-6 lg:flex-row">
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.4em] text-white/70">
                      <span>Аналитика карты</span>
                      <span>{analyticsOverlay.datasetLabel}</span>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                      {analyticsOverlay.stats?.map((stat) => (
                        <div key={stat.label} className="rounded-2xl border border-white/20 bg-white/10 p-4">
                          <p className="text-[11px] uppercase tracking-widest text-white/70">{stat.label}</p>
                          <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                          {stat.subLabel && (
                            <p className="text-xs text-emerald-300">{stat.subLabel}</p>
                          )}
                        </div>
                      ))}
                    </div>
                    {analyticsOverlay.risk && (
                      <div className="mt-4 grid gap-4 md:grid-cols-3 text-sm">
                        <div className="rounded-2xl border border-rose-300/25 bg-white/10 p-4">
                          <p className="text-[11px] uppercase tracking-widest text-white/70">Риск</p>
                          <p className="mt-2 text-lg font-semibold text-rose-200">
                            {analyticsOverlay.risk.highRisk}
                          </p>
                          <p className="text-xs text-white/60">Высокий уровень</p>
                        </div>
                        <div className="rounded-2xl border border-amber-200/25 bg-white/10 p-4">
                          <p className="text-[11px] uppercase tracking-widest text-white/70">Индекс давления</p>
                          <p className="mt-2 text-lg font-semibold text-amber-200">
                            {analyticsOverlay.risk.pressure}
                          </p>
                        </div>
                        {analyticsOverlay.risk.hotspot && (
                          <div className="rounded-2xl border border-emerald-200/25 bg-white/10 p-4">
                            <p className="text-[11px] uppercase tracking-widest text-white/70">Горячая точка</p>
                            <p className="mt-2 text-lg font-semibold text-emerald-200">
                              {analyticsOverlay.risk.hotspot.name}
                            </p>
                            <p className="text-xs text-white/70">
                              {formatValue(analyticsOverlay.risk.hotspot.value)}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {analyticsOverlay.features?.length ? (
                    <div className="rounded-3xl border border-white/20 bg-white/10 p-5 text-sm text-white/80">
                      <p className="text-xs uppercase tracking-widest text-white/60">Возможности карты</p>
                      <ul className="mt-3 space-y-1">
                        {analyticsOverlay.features.map((feature) => (
                          <li key={feature}>• {feature}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      {shouldShowEmptyState && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-white/80 px-4 py-2 text-sm text-slate-600 shadow-md">
            Нет данных для отображения. Проверьте выбранные столбцы и периоды.
          </div>
        </div>
      )}
    </div>
  );
}
