import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageContainer from "@/components/layout/PageContainer";
import {
  BrainCircuit,
  Database,
  FileText,
  Grid3x3,
  Info,
  LayoutDashboard,
  LineChart,
  Map,
  RefreshCcw,
  Sparkles
} from "lucide-react";
import { Dataset, Visualization } from "@/api/entities";
import GlobalForceGraph from "../components/constructor/GlobalForceGraph";
import DashboardBuilder from "../components/constructor/DashboardBuilder";
import AutomatedReportGenerator from "../components/constructor/AutomatedReportGenerator";

export default function Constructor() {
  const [activeMode, setActiveMode] = useState('dashboard');
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReportGenerator, setShowReportGenerator] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const widgetLibrary = useMemo(() => {
    const baseWidgets = [
      {
        id: 'stats',
        type: 'stats',
        title: 'Статистика',
        icon: Database,
        description: 'Быстрые показатели и ключевые цифры',
      },
      {
        id: 'chart',
        type: 'chart',
        title: 'График',
        icon: LineChart,
        description: 'Диаграмма с настраиваемыми параметрами и источниками данных',
      },
      {
        id: 'map',
        type: 'map',
        title: 'Геообласть',
        icon: Map,
        description: 'Визуализация данных на карте и выделение регионов',
      },
      {
        id: 'correlation',
        type: 'correlation',
        title: 'Матрица корреляции',
        icon: Grid3x3,
        description: 'Анализ взаимосвязей показателей внутри выбранного набора данных',
      },
      {
        id: 'forecast',
        type: 'forecast',
        title: 'Прогноз',
        icon: Sparkles,
        description: 'Постройте локальный прогноз по выбранным временным рядам',
      },
      {
        id: 'report-section',
        type: 'report',
        title: 'Раздел отчёта',
        icon: FileText,
        description: 'Создайте текстовый блок с выводами и ссылками на данные',
      },
    ];

    const datasetWidgets = datasets.map((dataset) => ({
      id: `dataset-${dataset.id}`,
      type: 'dataset',
      title: dataset.name,
      icon: Database,
      datasetId: dataset.id,
      description: dataset.description,
      rowCount: dataset.row_count,
      tags: dataset.tags,
    }));

    const visualizationWidgets = visualizations.map((viz) => ({
      id: `visualization-${viz.id}`,
      type: 'visualization',
      title: viz.title,
      icon: LineChart,
      datasetId: viz.dataset_id,
      visualizationId: viz.id,
      chartType: viz.type,
      summary: viz.summary,
      tags: viz.tags,
    }));

    return [...baseWidgets, ...datasetWidgets, ...visualizationWidgets];
  }, [datasets, visualizations]);

  const handleDashboardSave = useCallback(() => {
    // Заготовка для будущей интеграции с бэкендом сохранения дашбордов
  }, []);

  const loadData = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        Dataset.list('-created_date'),
        Visualization.list('-created_date')
      ]);
      setDatasets(datasetsData);
      setVisualizations(visualizationsData);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
      setError('Не удалось загрузить данные для конструктора. Попробуйте обновить страницу или повторить попытку позже.');
    }
    setIsLoading(false);
    setIsRefreshing(false);
  };

  const summaryStats = useMemo(() => [
    {
      label: 'Датасеты',
      value: datasets.length,
      description: 'Доступные источники данных для построения аналитики',
      icon: Database,
    },
    {
      label: 'Визуализации',
      value: visualizations.length,
      description: 'Готовые графики и диаграммы, которые можно переиспользовать',
      icon: LineChart,
    },
    {
      label: 'Режима конструктора',
      value: 3,
      description: 'Дашборды, локальный анализ связей и автоматический отчёт',
      icon: LayoutDashboard,
    },
  ], [datasets.length, visualizations.length]);

  const helperCards = useMemo(() => [
    {
      title: '1. Выберите основу',
      description: 'Начните с подбора датасетов и готовых визуализаций, которые лягут в основу дашборда.',
    },
    {
      title: '2. Настройте представление',
      description: 'Перетаскивайте виджеты, меняйте параметры графиков и собирайте нужную структуру отчёта.',
    },
    {
      title: '3. Проанализируйте связи',
      description: 'Переключитесь в режим анализа связей — локальный ИИ подсветит зависимости между объектами данных.',
    },
    {
      title: '4. Сформируйте отчёт',
      description: 'Автоматический генератор отчётов поможет подготовить локальную презентацию выводов.',
    },
  ], []);

  if (showReportGenerator) {
    return <AutomatedReportGenerator 
              datasets={datasets} 
              visualizations={visualizations}
              onClose={() => setShowReportGenerator(false)} 
            />;
  }

  return (
    <PageContainer className="space-y-8">
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent heading-text">
            Конструктор отчетов и связей
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto elegant-text">
            Создавайте интерактивные дашборды, анализируйте глобальные взаимосвязи локальным ИИ или сформируйте автоматический локальный отчёт.
          </p>
          <div className="flex justify-center">
            <Button
              onClick={() => loadData(true)}
              variant="outline"
              className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-100"
              disabled={isLoading || isRefreshing}
            >
              <RefreshCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Обновляем данные...' : 'Обновить данные'}
            </Button>
          </div>
        </div>

        <Card className="border-0 bg-white/60 backdrop-blur-xl shadow-lg">
          <CardContent className="p-6">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
              {summaryStats.map(({ label, value, description, icon: Icon }) => (
                <div
                  key={label}
                  className="flex flex-col gap-2 rounded-xl border border-slate-200/60 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm"
                >
                  <div className="flex items-center gap-2 text-slate-500 text-sm">
                    <Icon className="w-4 h-4 text-blue-600" />
                    {label}
                  </div>
                  <div className="text-3xl font-semibold text-slate-900">
                    {isLoading ? '—' : value}
                  </div>
                  <p className="text-sm text-slate-500 leading-snug">
                    {description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Alert variant="destructive" className="bg-red-50/80 border-red-200 text-red-800">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Mode Selector */}
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-center gap-2 flex-wrap">
              <Button 
                onClick={() => setActiveMode('dashboard')} 
                variant={activeMode === 'dashboard' ? 'default' : 'ghost'} 
                className="gap-2"
              >
                <LayoutDashboard className="w-4 h-4" />
                Дашборд-конструктор
              </Button>
              <Button
                onClick={() => setActiveMode('connections')}
                variant={activeMode === 'connections' ? 'default' : 'ghost'}
                className="gap-2"
              >
                <BrainCircuit className="w-4 h-4" />
                Анализ связей
              </Button>
              <Button
                onClick={() => setShowReportGenerator(true)}
                variant={'ghost'}
                className="gap-2 text-purple-600 hover:bg-purple-100 hover:text-purple-700"
              >
                <Sparkles className="w-4 h-4" />
                Сводный локальный отчёт
              </Button>
            </div>
          </CardContent>
        </Card>

        {activeMode === 'dashboard' && (
          <DashboardBuilder
            datasets={datasets}
            visualizations={visualizations}
            availableWidgets={widgetLibrary}
            onSave={handleDashboardSave}
            isLoading={isLoading}
          />
        )}

        {activeMode === 'connections' && (
          <GlobalForceGraph onClose={() => setActiveMode('dashboard')} />
        )}

        <Card className="border-0 bg-white/40 backdrop-blur-xl shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-2 text-slate-600">
              <Info className="w-4 h-4 text-blue-500" />
              <CardTitle className="text-lg text-slate-800">Как работает конструктор</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {helperCards.map((card) => (
              <div key={card.title} className="rounded-lg border border-slate-200/60 bg-white/80 p-4 shadow-sm">
                <h3 className="font-semibold text-slate-800 mb-2">{card.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{card.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
    </PageContainer>
  );
}