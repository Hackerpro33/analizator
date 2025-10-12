const samplePoints = [
  {
    lat: 55.7558,
    lon: 37.6173,
    value: 850,
    name: "Москва",
    category: "Мегаполис",
    forecast: 920,
    correlation: 0.88,
    description: "Столица России, центр экономической активности",
    population_density: 4950,
    average_income: 98000,
    unemployment_rate: 0.025,
    trend_change: 0.11,
    trend_volatility: 0.18,
    incident_count: 340,
    incident_change: 0.07,
    logistics_corridor: "Центральный хаб",
    travel_time_minutes: 38,
    service_radius_km: 160,
    weather_temperature: -4,
    weather_precipitation: 14,
    climate_risk: 0.32
  },
  {
    lat: 59.9311,
    lon: 30.3609,
    value: 720,
    name: "Санкт-Петербург",
    category: "Культурный центр",
    forecast: 780,
    correlation: 0.75,
    description: "Северная столица, культурный и образовательный центр",
    population_density: 3840,
    average_income: 87000,
    unemployment_rate: 0.032,
    trend_change: 0.09,
    trend_volatility: 0.15,
    incident_count: 260,
    incident_change: 0.02,
    logistics_corridor: "Балтийский порт",
    travel_time_minutes: 52,
    service_radius_km: 140,
    weather_temperature: -6,
    weather_precipitation: 18,
    climate_risk: 0.28
  },
  {
    lat: 56.8431,
    lon: 60.6454,
    value: 480,
    name: "Екатеринбург",
    category: "Промышленный",
    forecast: 510,
    correlation: 0.82,
    description: "Крупный промышленный центр Урала",
    population_density: 2900,
    average_income: 68000,
    unemployment_rate: 0.045,
    trend_change: 0.06,
    trend_volatility: 0.22,
    incident_count: 210,
    incident_change: 0.11,
    logistics_corridor: "Уральский транзит",
    travel_time_minutes: 64,
    service_radius_km: 190,
    weather_temperature: -12,
    weather_precipitation: 9,
    climate_risk: 0.41
  },
  {
    lat: 55.0415,
    lon: 82.9346,
    value: 520,
    name: "Новосибирск",
    category: "Научный",
    forecast: 580,
    correlation: 0.79,
    description: "Научный центр Сибири",
    population_density: 2760,
    average_income: 64000,
    unemployment_rate: 0.048,
    trend_change: 0.08,
    trend_volatility: 0.2,
    incident_count: 195,
    incident_change: 0.04,
    logistics_corridor: "Транссиб",
    travel_time_minutes: 72,
    service_radius_km: 210,
    weather_temperature: -16,
    weather_precipitation: 11,
    climate_risk: 0.37
  },
  {
    lat: 56.0184,
    lon: 92.8672,
    value: 380,
    name: "Красноярск",
    category: "Региональный",
    forecast: 420,
    correlation: 0.71,
    description: "Административный центр Красноярского края",
    population_density: 2380,
    average_income: 61000,
    unemployment_rate: 0.051,
    trend_change: 0.05,
    trend_volatility: 0.24,
    incident_count: 182,
    incident_change: 0.13,
    logistics_corridor: "Северный широтный",
    travel_time_minutes: 88,
    service_radius_km: 240,
    weather_temperature: -18,
    weather_precipitation: 10,
    climate_risk: 0.45
  },
  {
    lat: 53.2001,
    lon: 50.15,
    value: 450,
    name: "Самара",
    category: "Промышленный",
    forecast: 490,
    correlation: 0.77,
    description: "Авиакосмическая промышленность",
    population_density: 3010,
    average_income: 63000,
    unemployment_rate: 0.046,
    trend_change: 0.07,
    trend_volatility: 0.19,
    incident_count: 168,
    incident_change: 0.06,
    logistics_corridor: "Поволжский маршрут",
    travel_time_minutes: 58,
    service_radius_km: 170,
    weather_temperature: -9,
    weather_precipitation: 12,
    climate_risk: 0.34
  },
  {
    lat: 51.5312,
    lon: 46.0073,
    value: 410,
    name: "Саратов",
    category: "Образовательный",
    forecast: 440,
    correlation: 0.73,
    description: "Образовательный и научный центр Поволжья",
    population_density: 2740,
    average_income: 58000,
    unemployment_rate: 0.049,
    trend_change: 0.045,
    trend_volatility: 0.17,
    incident_count: 144,
    incident_change: 0.03,
    logistics_corridor: "Приволжская магистраль",
    travel_time_minutes: 62,
    service_radius_km: 150,
    weather_temperature: -7,
    weather_precipitation: 9,
    climate_risk: 0.29
  },
  {
    lat: 47.2357,
    lon: 39.7015,
    value: 390,
    name: "Ростов-на-Дону",
    category: "Торговый",
    forecast: 430,
    correlation: 0.69,
    description: "Торговые ворота Юга России",
    population_density: 3310,
    average_income: 60000,
    unemployment_rate: 0.044,
    trend_change: 0.052,
    trend_volatility: 0.16,
    incident_count: 158,
    incident_change: 0.08,
    logistics_corridor: "Южный международный",
    travel_time_minutes: 54,
    service_radius_km: 155,
    weather_temperature: 1,
    weather_precipitation: 15,
    climate_risk: 0.31
  }
];

export const sampleTimeSeries = [
  // Москва
  {
    lat: 55.7558,
    lon: 37.6173,
    period: "2023-Q1",
    value: 790,
    name: "Москва",
    category: "Мегаполис"
  },
  {
    lat: 55.7558,
    lon: 37.6173,
    period: "2023-Q2",
    value: 820,
    name: "Москва",
    category: "Мегаполис"
  },
  {
    lat: 55.7558,
    lon: 37.6173,
    period: "2023-Q3",
    value: 850,
    name: "Москва",
    category: "Мегаполис"
  },
  // Санкт-Петербург
  {
    lat: 59.9311,
    lon: 30.3609,
    period: "2023-Q1",
    value: 700,
    name: "Санкт-Петербург",
    category: "Культурный центр"
  },
  {
    lat: 59.9311,
    lon: 30.3609,
    period: "2023-Q2",
    value: 715,
    name: "Санкт-Петербург",
    category: "Культурный центр"
  },
  {
    lat: 59.9311,
    lon: 30.3609,
    period: "2023-Q3",
    value: 720,
    name: "Санкт-Петербург",
    category: "Культурный центр"
  },
  // Екатеринбург
  {
    lat: 56.8431,
    lon: 60.6454,
    period: "2023-Q1",
    value: 470,
    name: "Екатеринбург",
    category: "Промышленный"
  },
  {
    lat: 56.8431,
    lon: 60.6454,
    period: "2023-Q2",
    value: 465,
    name: "Екатеринбург",
    category: "Промышленный"
  },
  {
    lat: 56.8431,
    lon: 60.6454,
    period: "2023-Q3",
    value: 480,
    name: "Екатеринбург",
    category: "Промышленный"
  },
  // Новосибирск
  {
    lat: 55.0415,
    lon: 82.9346,
    period: "2023-Q1",
    value: 500,
    name: "Новосибирск",
    category: "Научный"
  },
  {
    lat: 55.0415,
    lon: 82.9346,
    period: "2023-Q2",
    value: 515,
    name: "Новосибирск",
    category: "Научный"
  },
  {
    lat: 55.0415,
    lon: 82.9346,
    period: "2023-Q3",
    value: 520,
    name: "Новосибирск",
    category: "Научный"
  },
  // Красноярск
  {
    lat: 56.0184,
    lon: 92.8672,
    period: "2023-Q1",
    value: 395,
    name: "Красноярск",
    category: "Региональный"
  },
  {
    lat: 56.0184,
    lon: 92.8672,
    period: "2023-Q2",
    value: 388,
    name: "Красноярск",
    category: "Региональный"
  },
  {
    lat: 56.0184,
    lon: 92.8672,
    period: "2023-Q3",
    value: 380,
    name: "Красноярск",
    category: "Региональный"
  },
  // Самара
  {
    lat: 53.2001,
    lon: 50.15,
    period: "2023-Q1",
    value: 420,
    name: "Самара",
    category: "Промышленный"
  },
  {
    lat: 53.2001,
    lon: 50.15,
    period: "2023-Q2",
    value: 435,
    name: "Самара",
    category: "Промышленный"
  },
  {
    lat: 53.2001,
    lon: 50.15,
    period: "2023-Q3",
    value: 450,
    name: "Самара",
    category: "Промышленный"
  },
  // Саратов
  {
    lat: 51.5312,
    lon: 46.0073,
    period: "2023-Q1",
    value: 405,
    name: "Саратов",
    category: "Образовательный"
  },
  {
    lat: 51.5312,
    lon: 46.0073,
    period: "2023-Q2",
    value: 400,
    name: "Саратов",
    category: "Образовательный"
  },
  {
    lat: 51.5312,
    lon: 46.0073,
    period: "2023-Q3",
    value: 410,
    name: "Саратов",
    category: "Образовательный"
  },
  // Ростов-на-Дону
  {
    lat: 47.2357,
    lon: 39.7015,
    period: "2023-Q1",
    value: 370,
    name: "Ростов-на-Дону",
    category: "Торговый"
  },
  {
    lat: 47.2357,
    lon: 39.7015,
    period: "2023-Q2",
    value: 380,
    name: "Ростов-на-Дону",
    category: "Торговый"
  },
  {
    lat: 47.2357,
    lon: 39.7015,
    period: "2023-Q3",
    value: 390,
    name: "Ростов-на-Дону",
    category: "Торговый"
  }
];

export default samplePoints;
