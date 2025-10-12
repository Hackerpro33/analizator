import { describe, it, expect } from "vitest";

import { computeMapAnalytics } from "../mapAnalytics";
import samplePoints from "../../components/maps/sampleData";

describe("computeMapAnalytics", () => {
  it("normalizes points and calculates statistics", () => {
    const data = [
      {
        lat: "55.75",
        lon: "37.61",
        value: "100",
        forecast: "120",
        correlation: "0.8",
        category: "Center",
        name: "Moscow",
      },
      {
        latitude: 60.0,
        longitude: 30.3,
        metric: 80,
        forecast: 70,
        corr: "-0.4",
        segment: "North",
        city_name: "Saint-Petersburg",
      },
      {
        lat: null,
        lon: null,
        value: "n/a",
      },
    ];

    const result = computeMapAnalytics(data, { value_column: "value" }, { datasetName: "Cities" });

    expect(result.hasData).toBe(true);
    expect(result.totalPoints).toBe(3);
    expect(result.validPoints).toBe(2);
    expect(result.averageValue).toBeCloseTo(90);
    expect(result.maxPoint?.name).toBe("Moscow");
    expect(result.minPoint?.name).toBe("Saint-Petersburg");
    expect(result.categories[0]).toMatchObject({ name: "Center", count: 1 });
    expect(result.forecast.hasForecast).toBe(true);
    expect(result.forecast.deltaFromValue).toBeCloseTo(5, 0);
    expect(result.correlation.hasCorrelation).toBe(true);
    expect(result.correlation.strongestPositive?.name).toBe("Moscow");
    expect(result.correlation.strongestNegative?.name).toBe("Saint-Petersburg");
  });

  it("falls back to provided samples", () => {
    const fallbackSample = [{ lat: 10, lon: 20, value: 5 }];
    const result = computeMapAnalytics([], { value_column: "value" }, { fallbackSample });
    expect(result.hasData).toBe(true);
    expect(result.totalPoints).toBe(1);
  });

  it("returns empty state when no data available", () => {
    const result = computeMapAnalytics(null, {}, {});
    expect(result.hasData).toBe(false);
    expect(result.valueLabel).toBe("Значение");
  });

  it("builds full analytics stack for realistic sample dataset", () => {
    const analytics = computeMapAnalytics(
      samplePoints,
      {
        value_column: "value",
        hotspot_metric_column: "incident_count",
        demography_population_column: "population_density",
        demography_income_column: "average_income",
        demography_unemployment_column: "unemployment_rate",
        logistics_corridor_column: "logistics_corridor",
        logistics_travel_time_column: "travel_time_minutes",
        logistics_service_radius_column: "service_radius_km",
        climate_temperature_column: "weather_temperature",
        climate_precipitation_column: "weather_precipitation",
        climate_risk_column: "climate_risk",
      },
      { datasetName: "Демонстрационный набор", datasetId: "sample" }
    );

    expect(analytics.totalPoints).toBe(samplePoints.length);
    expect(analytics.averageValue).toBeCloseTo(525, 5);
    expect(analytics.categories[0]).toMatchObject({ name: "Промышленный", count: 2 });

    expect(analytics.risk.hasRisk).toBe(true);
    expect(analytics.risk.distribution).toEqual([
      { level: "Высокий", count: 2 },
      { level: "Средний", count: 2 },
      { level: "Низкий", count: 4 },
    ]);
    expect(analytics.risk.hotspots[0]).toMatchObject({ name: "Москва", value: 850 });
    expect(analytics.risk.pressureIndex).toBeCloseTo(0.495, 3);

    expect(analytics.forecast.hasForecast).toBe(true);
    expect(analytics.forecast.average).toBeCloseTo(571.25, 2);
    expect(analytics.forecast.deltaFromValue).toBeCloseTo(46.25, 2);
    expect(analytics.forecast.highestGrowthPoint?.name).toBe("Москва");

    expect(analytics.correlation.hasCorrelation).toBe(true);
    expect(analytics.correlation.average).toBeCloseTo(0.7675, 4);
    expect(analytics.correlation.strongestPositive?.name).toBe("Москва");

    expect(analytics.layers.hotspots.hasData).toBe(true);
    expect(analytics.layers.hotspots.total).toBe(1657);
    expect(analytics.layers.hotspots.topIncident?.name).toBe("Москва");
    expect(analytics.layers.hotspots.growthLeaders.map((entry) => entry.name)).toEqual([
      "Красноярск",
      "Екатеринбург",
      "Ростов-на-Дону",
    ]);

    expect(analytics.layers.logistics.hasData).toBe(true);
    expect(analytics.layers.logistics.fastestRoute?.name).toBe("Москва");
    expect(analytics.layers.logistics.slowestRoute?.name).toBe("Красноярск");
    expect(analytics.layers.logistics.corridors).toEqual([
      "Центральный хаб",
      "Балтийский порт",
      "Уральский транзит",
      "Транссиб",
      "Северный широтный",
      "Поволжский маршрут",
      "Приволжская магистраль",
      "Южный международный",
    ]);
    expect(analytics.layers.logistics.maxRadius?.radius).toBe(240);

    expect(analytics.layers.climate.hasData).toBe(true);
    expect(analytics.layers.climate.highestRisk?.name).toBe("Красноярск");
    expect(analytics.layers.climate.averageTemp).toBeCloseTo(-8.875, 3);
    expect(analytics.layers.climate.averagePrecip).toBeCloseTo(12.25, 2);

    expect(analytics.layers.demography.hasData).toBe(true);
    expect(analytics.layers.demography.averageDensity).toBeCloseTo(3236.25, 2);
    expect(analytics.layers.demography.averageIncome).toBeCloseTo(69875, 2);
    expect(analytics.layers.demography.lowestUnemployment?.name).toBe("Москва");

    expect(analytics.layers.trend.hasData).toBe(true);
    expect(analytics.layers.trend.averageChange).toBeCloseTo(0.069625, 6);
    expect(analytics.layers.trend.topDrop?.name).toBe("Саратов");

    expect(analytics.layers.spatial.hasData).toBe(true);
    expect(analytics.layers.spatial.topOutlier?.name).toBe("Москва");
    expect(analytics.layers.spatial.neighborCount).toBe(6);
  });
});
