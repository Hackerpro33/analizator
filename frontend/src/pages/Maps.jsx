import React, { useState, useEffect, useMemo } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Globe, Settings, Plus } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";

import MapConfigurator from "../components/maps/MapConfigurator";
import MapView from "../components/maps/MapView";
import MapGallery from "../components/maps/MapGallery";
import samplePoints from "../components/maps/sampleData";
import { computeMapAnalytics } from "@/utils/mapAnalytics";

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

const featureList = [
  "Интерактивное масштабирование",
  "Детальная информация о точках",
  "Цветовое кодирование значений",
  "Наложение прогнозных данных",
  "Корреляционный анализ",
  "GIS-системы (QGIS, ArcGIS, Kepler.gl)",
  "Интерактивные дашборды для аналитиков",
  "Heatmaps и риск-карты",
];

export default function Maps() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [mapData, setMapData] = useState([]);
  const [currentMapConfig, setCurrentMapConfig] = useState({
    title: 'Образец данных на карте',
    dataset_id: 'sample',
    lat_column: 'latitude',
    lon_column: 'longitude',
    value_column: 'value',
    overlay_type: 'none',
    time_column: 'period',
    base_period: '2023-Q1',
    comparison_period: '2023-Q3'
  });
  const [isDatasetLoading, setIsDatasetLoading] = useState(false);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === currentMapConfig?.dataset_id),
    [datasets, currentMapConfig?.dataset_id]
  );

  const datasetLabel = useMemo(
    () =>
      currentMapConfig.dataset_id === "sample"
        ? "Образец данных"
        : selectedDataset?.name || "Не выбран",
    [currentMapConfig.dataset_id, selectedDataset?.name]
  );

  const configHighlights = useMemo(() => {

    const overlayMap = {
      none: "Без наложений",
      heatmap: "Тепловая карта",
      clusters: "Кластеры",
      forecast: "Прогноз",
    };

    return [
      {
        label: "Источник данных",
        value: datasetLabel,
      },
      {
        label: "Количество точек",
        value: isDatasetLoading
          ? "Загрузка..."
          : mapData?.length
            ? mapData.length.toLocaleString("ru-RU")
            : "Нет данных",
      },
      {
        label: "Режим отображения",
        value: overlayMap[currentMapConfig.overlay_type] || "Стандартный",
      },
    ];
  }, [
    datasetLabel,
    currentMapConfig.overlay_type,
    isDatasetLoading,
    mapData?.length,
  ]);

  const fallbackSample = useMemo(
    () => (currentMapConfig?.dataset_id === "sample" ? samplePoints : undefined),
    [currentMapConfig?.dataset_id]
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.filter({ type: 'map' }, '-created_date')
      ]);
      setDatasets(datasetsData);
      setVisualizations(visualizationsData);
    } catch (error) {
      console.error('Ошибка загрузки данных карты:', error);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    const datasetId = currentMapConfig?.dataset_id;
    if (!datasetId || datasetId === 'sample') {
      setMapData([]);
      return;
    }

    const datasetFromState = datasets.find((dataset) => dataset.id === datasetId);
    if (datasetFromState && Array.isArray(datasetFromState.sample_data) && datasetFromState.sample_data.length > 0) {
      setMapData(datasetFromState.sample_data);
      return;
    }

    let isCancelled = false;

    const fetchDataset = async () => {
      setIsDatasetLoading(true);
      try {
        const dataset = await Dataset.get(datasetId);
        if (!isCancelled) {
          setMapData(dataset.sample_data || []);
          setDatasets((prev) => prev.map((item) => (item.id === datasetId ? { ...item, ...dataset } : item)));
        }
      } catch (error) {
        if (!isCancelled) {
          console.error('Не удалось загрузить данные набора для карты:', error);
          setMapData([]);
        }
      } finally {
        if (!isCancelled) {
          setIsDatasetLoading(false);
        }
      }
    };

    fetchDataset();

    return () => {
      isCancelled = true;
    };
  }, [currentMapConfig?.dataset_id, datasets]);

  const handleSaveMap = async (config) => {
    try {
      await Visualization.create({
        title: config.title,
        type: 'map',
        dataset_id: config.dataset_id,
        config: config
      });
      await loadData();
      setShowConfigurator(false);
      setCurrentMapConfig(config);
      if (config.dataset_id) {
        setMapData([]);
      }
    } catch (error) {
      console.error("Ошибка сохранения карты:", error);
    }
  };

  const handleEditMap = (viz) => {
    setCurrentMapConfig(viz.config);
    setMapData([]);
    setShowConfigurator(true);
  };

  const handleCreateNewMap = () => {
    setCurrentMapConfig({
      title: '',
      dataset_id: '',
      lat_column: '',
      lon_column: '',
      value_column: '',
      overlay_type: 'none',
      time_column: '',
      base_period: '',
      comparison_period: ''
    });
    setMapData([]);
    setShowConfigurator(true);
  };

  const handleConfigChange = (nextConfig) => {
    setCurrentMapConfig(nextConfig);
  };

  const mapOverlayInfo = useMemo(
    () => ({
      highlights: configHighlights,
      settings: [
        { label: "Широта", value: currentMapConfig.lat_column || "latitude" },
        { label: "Долгота", value: currentMapConfig.lon_column || "longitude" },
        { label: "Метрика", value: currentMapConfig.value_column || "value" },
        {
          label: "Слой",
          value: currentMapConfig.overlay_type === "none" ? "Стандарт" : configHighlights[2]?.value,
        },
      ],
      tip: {
        title: "Исследуйте данные",
        text: "Используйте масштабирование и фильтры, чтобы оперативно выявлять активные зоны.",
      },
    }),
    [
      configHighlights,
      currentMapConfig.lat_column,
      currentMapConfig.lon_column,
      currentMapConfig.value_column,
      currentMapConfig.overlay_type,
    ]
  );

  const analyticsData = useMemo(
    () =>
      computeMapAnalytics(mapData, currentMapConfig, {
        datasetSample: selectedDataset?.sample_data,
        datasetId: currentMapConfig?.dataset_id,
        datasetName: datasetLabel,
        fallbackSample,
      }),
    [mapData, currentMapConfig, selectedDataset?.sample_data, datasetLabel, fallbackSample]
  );

  const analyticsOverlay = useMemo(() => {
    if (!analyticsData?.hasData) {
      return null;
    }

    const riskDistribution = analyticsData.risk?.distribution?.find((item) => item.level === "Высокий");
    const topHotspot = analyticsData.risk?.hotspots?.[0];

    return {
      datasetLabel: analyticsData.datasetLabel || "—",
      stats: [
        {
          label: "Точек на карте",
          value: `${analyticsData.validPoints || 0} / ${analyticsData.totalPoints || 0}`,
        },
        {
          label: `Среднее ${analyticsData.valueLabel?.toLowerCase() || "значение"}`,
          value: formatNumber(analyticsData.averageValue),
        },
        {
          label: "Максимум",
          value: formatNumber(analyticsData.maxPoint?.value),
          subLabel: analyticsData.maxPoint?.name || "—",
        },
      ],
      risk: analyticsData.risk?.hasRisk
        ? {
            highRisk: riskDistribution ? `${riskDistribution.count} зон` : "Нет данных",
            pressure: analyticsData.risk.pressureIndex !== null ? formatPercent(analyticsData.risk.pressureIndex) : "—",
            hotspot: topHotspot
              ? {
                  name: topHotspot.name,
                  value: topHotspot.value,
                }
              : null,
          }
        : null,
      features: featureList,
    };
  }, [analyticsData]);

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Географические инсайты
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Визуализируйте географические данные на интерактивной карте. Откройте пространственные закономерности и тенденции.
          </p>
        </div>

        {/* Main Content */}
        {showConfigurator ? (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <MapConfigurator
                datasets={datasets}
                onSave={handleSaveMap}
                onCancel={() => setShowConfigurator(false)}
                initialConfig={currentMapConfig}
                onConfigChange={handleConfigChange}
              />
            </div>
            <div className="lg:col-span-2">
              <div className="relative">
                {isDatasetLoading && (
                  <div className="absolute top-4 left-4 z-[1000] rounded-lg bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                    Загрузка данных набора...
                  </div>
                )}
                <MapView config={currentMapConfig} data={mapData} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Action Buttons */}
            <div className="flex justify-center gap-4 flex-wrap">
              <Button 
                onClick={handleCreateNewMap}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white px-6 py-3 text-base font-medium shadow-xl hover:shadow-2xl transition-all duration-300 hover:scale-105 gap-2"
              >
                <Plus className="w-5 h-5" />
                Создать новую карту
              </Button>
              <Button 
                onClick={() => setShowConfigurator(true)}
                variant="outline"
                className="px-6 py-3 text-base font-medium border-2 hover:bg-slate-50 gap-2"
              >
                <Settings className="w-5 h-5" />
                Настроить карту
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900 heading-text">
                <Globe className="w-5 h-5 text-purple-500" />
                <h2 className="text-2xl font-semibold">Интерактивная карта</h2>
              </div>
              <div className="relative">
                {isDatasetLoading && (
                  <div className="absolute top-4 left-4 z-[1000] rounded-lg bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                    Загрузка данных набора...
                  </div>
                )}
                <MapView
                  config={currentMapConfig}
                  data={mapData}
                  height="clamp(820px, 85vh, 1100px)"
                  overlayInfo={mapOverlayInfo}
                  analyticsOverlay={analyticsOverlay || undefined}
                />
              </div>
            </div>
            {/* Saved Maps Gallery */}
            <MapGallery 
              visualizations={visualizations}
              isLoading={isLoading}
              onEdit={handleEditMap}
            />
          </>
        )}
    </PageContainer>
  );
}
