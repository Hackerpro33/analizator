import React, { useState, useEffect, useMemo } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map as MapIcon, Globe, Compass, Settings, Plus } from "lucide-react";
import PageContainer from "@/components/layout/PageContainer";

import MapConfigurator from "../components/maps/MapConfigurator";
import MapView from "../components/maps/MapView";
import MapGallery from "../components/maps/MapGallery";
import MapAnalyticsPanel from "../components/maps/MapAnalyticsPanel";

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

  const configHighlights = useMemo(() => {
    const datasetLabel =
      currentMapConfig.dataset_id === "sample"
        ? "Образец данных"
        : selectedDataset?.name || "Не выбран";

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
    currentMapConfig.dataset_id,
    currentMapConfig.overlay_type,
    isDatasetLoading,
    mapData?.length,
    selectedDataset?.name,
  ]);

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

  return (
    <PageContainer className="space-y-8">
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

            {/* Interactive Map Display */}
            <div className="grid gap-8 xl:grid-cols-[1.75fr_1fr]">
              <section className="space-y-8">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {configHighlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 shadow-sm backdrop-blur"
                    >
                      <p className="text-xs uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
                  <CardHeader className="border-b border-slate-200">
                    <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                      <Globe className="w-5 h-5 text-purple-500" />
                      Интерактивная карта
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0 relative">
                    {isDatasetLoading && (
                      <div className="absolute top-4 left-4 z-[1000] rounded-lg bg-white/80 px-3 py-1 text-sm text-slate-600 shadow-sm">
                        Загрузка данных набора...
                      </div>
                    )}
                    <MapView config={currentMapConfig} data={mapData} />
                  </CardContent>
                </Card>
              </section>

              {/* Map Info Panel */}
              <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
                <Card className="border-0 bg-white/80 backdrop-blur-xl shadow-xl">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
                      <MapIcon className="w-5 h-5 text-blue-500" />
                      Информация о карте
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-center justify-between gap-4">
                        <span>Источник данных:</span>
                        <span className="font-medium text-right">
                          {currentMapConfig.dataset_id === 'sample' ? 'Образцы' : selectedDataset?.name || 'Не выбран'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Широта:</span>
                        <span className="font-medium text-right">{currentMapConfig.lat_column || 'latitude'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Долгота:</span>
                        <span className="font-medium text-right">{currentMapConfig.lon_column || 'longitude'}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span>Значения:</span>
                        <span className="font-medium text-right">{currentMapConfig.value_column || 'value'}</span>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 p-4 text-center shadow-inner">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600">
                        <Compass className="h-6 w-6 text-white" />
                      </div>
                      <h4 className="font-semibold text-purple-800">Исследуйте данные</h4>
                      <p className="mt-1 text-sm text-purple-700">
                        Кликайте по точкам, чтобы увидеть подробности и найти скрытые закономерности.
                      </p>
                    </div>

                    <div>
                      <h4 className="font-semibold text-slate-800 mb-2">Возможности карты:</h4>
                      <ul className="text-sm text-slate-600 space-y-1">
                        <li>• Интерактивное масштабирование</li>
                        <li>• Детальная информация о точках</li>
                        <li>• Цветовое кодирование значений</li>
                        <li>• Наложение прогнозных данных</li>
                        <li>• Корреляционный анализ</li>
                        <li>• GIS-системы (QGIS, ArcGIS, Kepler.gl) — пространственное моделирование преступности</li>
                        <li>• Интерактивные дашборды (Power BI, Tableau, Grafana) для аналитиков и управленцев</li>
                        <li>• Heatmaps и риск-карты — визуализация опасных зон по времени суток, дням недели, сезонам</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>

                <MapAnalyticsPanel
                  data={mapData}
                  config={currentMapConfig}
                  datasets={datasets}
                  isLoading={isDatasetLoading}
                />
              </aside>
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