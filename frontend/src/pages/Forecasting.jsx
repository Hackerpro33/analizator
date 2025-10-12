
import React, { useState, useEffect } from "react";
import { Dataset, Visualization } from "@/api/entities";
import { SendEmail } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Sparkles, BrainCircuit, BarChart3, Mail, Map } from "lucide-react";
import ForecastSetup from "../components/forecasting/ForecastSetup";
import ForecastResult from "../components/forecasting/ForecastResult";
import CorrelationMatrix from "../components/forecasting/CorrelationMatrix";
import MapView from "../components/maps/MapView";
import MapConfigurator from "../components/maps/MapConfigurator";
import { generateForecastReport } from "@/utils/localAnalysis";
import PageContainer from "@/components/layout/PageContainer";

export default function Forecasting() {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isForecasting, setIsForecasting] = useState(false);
  const [forecastResult, setForecastResult] = useState(null);
  const [historicalData, setHistoricalData] = useState([]);
  const [correlationResult, setCorrelationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('forecast');
  const defaultMapConfig = {
    title: 'Анализ на карте',
    dataset_id: '',
    lat_column: '',
    lon_column: '',
    value_column: '',
    overlay_type: 'none',
    time_column: '',
    base_period: '',
    comparison_period: ''
  };
  const [mapConfig, setMapConfig] = useState(defaultMapConfig);
  const [mapData, setMapData] = useState([]);

  useEffect(() => {
    loadDatasets();
  }, []);

  useEffect(() => {
    if (!mapConfig?.dataset_id) {
      setMapData([]);
      return;
    }

    const selectedDs = datasets.find((d) => d.id === mapConfig.dataset_id);
    setMapData(selectedDs?.sample_data || []);
  }, [mapConfig?.dataset_id, datasets]);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      const data = await Dataset.list('-created_date');
      setDatasets(data);
    } catch (error) {
      console.error('Ошибка загрузки наборов данных:', error);
    }
    setIsLoading(false);
  };
  
  const handleSendSummary = async () => {
    if (!forecastResult) return;
    
    const subject = `Локальный прогноз: результаты анализа`;
    const body = `
      <h1>Отчет по прогнозу</h1>
      <h2>Ключевые выводы:</h2>
      <ul>
        ${forecastResult.summary.key_insights.map(item => `<li>${item}</li>`).join('')}
      </ul>
      <p><b>Прогнозируемый рост:</b> ${forecastResult.summary.predicted_growth_percentage.toFixed(1)}%</p>
      <p><b>Направление тренда:</b> ${forecastResult.summary.trend_direction}</p>
      <p><b>Уровень волатильности:</b> ${forecastResult.summary.volatility_level}</p>
      <p><b>Оценка достоверности:</b> ${(forecastResult.summary.confidence_score * 100).toFixed(1)}%</p>
      <h3>Рекомендации:</h3>
      <ul>
        ${forecastResult.summary.recommendations?.map(rec => `<li>${rec}</li>`).join('') || '<li>Рекомендации не сформированы</li>'}
      </ul>
      <p>Отчет сгенерирован автоматически платформой Анализатор.</p>
    `;
    
    const userEmail = "user@example.com"; 
    
    try {
      await SendEmail({
        to: userEmail,
        subject: subject,
        body: body,
        from_name: "Анализатор Аналитика"
      });
      alert(`Отчет отправлен на ${userEmail}`);
    } catch (error) {
      console.error("Ошибка отправки email:", error);
      alert("Не удалось отправить отчет.");
    }
  }

  const handleGenerateForecast = async (config) => {
    setIsForecasting(true);
    setForecastResult(null);

    const timeColumn = config.useSyntheticDates ? 'synthetic_time' : config.date_column;

    // Генерация более реалистичных исторических данных
    const generateHistoricalData = (days, baseValue, volatility = 0.1, trend = 0.02) => {
      const data = [];
      let currentValue = baseValue;
      
      for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000);
        
        // Добавляем сезонность (годовой цикл)
        const seasonality = Math.sin((i / 365) * 2 * Math.PI) * baseValue * 0.1;
        
        // Добавляем недельную сезонность
        const weeklySeasonality = Math.sin((i / 7) * 2 * Math.PI) * baseValue * 0.05;
        
        // Случайные флуктуации
        const randomNoise = (Math.random() - 0.5) * baseValue * volatility;
        
        // Тренд
        currentValue = baseValue + (i * trend * baseValue / days) + seasonality + weeklySeasonality + randomNoise;
        
        data.push({
          date: date.toISOString().split('T')[0],
          value: Math.max(0, currentValue)
        });
      }
      return data;
    };

    const mockHistorical = generateHistoricalData(365, 1000, 0.15, 0.05);
    setHistoricalData(mockHistorical);

    try {
      const externalFactorsDetails = (config.external_factors || []).map((factor) => {
        const dataset = datasets.find((d) => d.id === factor.dataset_id);
        const sampleValues = dataset?.sample_data
          ?.map((row) => row?.[factor.column])
          .filter((value) => value !== undefined && value !== null)
          .slice(0, 5) || [];

        return {
          ...factor,
          sampleValues,
        };
      });

      const externalFactorsPrompt = externalFactorsDetails.length > 0
        ? `Учтите следующие внешние факторы (экзогенные переменные) при построении прогноза: ${externalFactorsDetails.map((factor) => `"${factor.column}" из набора данных "${factor.dataset_name}" (ID: ${factor.dataset_id})${factor.sampleValues.length ? `, примеры значений: ${JSON.stringify(factor.sampleValues)}` : ''}`).join('; ')}. Данные из корреляционного и графового анализа можно использовать как основу для этих факторов.`
        : '';

      const externalFactorsSection = externalFactorsDetails.length > 0
        ? `
        ДОПОЛНИТЕЛЬНЫЕ ПЕРЕМЕННЫЕ:
        ${externalFactorsDetails.map((factor) => `- ${factor.dataset_name} (ID: ${factor.dataset_id}) → ${factor.column}${factor.sampleValues.length ? ` | Примеры: ${factor.sampleValues.join(', ')}` : ''}`).join('\n        ')}
      `
        : '';

      const prompt = `
        Вы — эксперт по анализу временных рядов и машинному обучению.

        Проанализируйте предоставленные исторические данные и создайте детальный прогноз на ${config.horizon} дней вперед.

        ДАННЫЕ ДЛЯ АНАЛИЗА:
        - Основной временной ряд: '${config.value_column}' из набора данных ID ${config.dataset_id}
        - Последние 30 точек данных: ${JSON.stringify(mockHistorical.slice(-30))}

        ${externalFactorsSection}

        ${externalFactorsPrompt}

        ТРЕБОВАНИЯ К ПРОГНОЗУ:
        1.  Постройте базовый прогноз ('predicted_value') с 95% доверительным интервалом ('confidence_lower', 'confidence_upper').
        2.  Сгенерируйте два дополнительных сценария: 'optimistic' и 'pessimistic'. Оптимистичный сценарий должен отражать наилучшее возможное развитие событий с учетом позитивных факторов, а пессимистичный — наихудшее.
        3.  Проведите глубокий анализ данных, включая тренды, сезонность, волатильность.
        4.  Сформируйте ключевые выводы, факторы риска и практические рекомендации.
        5.  Укажите уровень достоверности прогноза в поле summary.confidence_score (число от 0 до 1) с обоснованием в инсайтах.
        6.  Объясните влияние каждого выбранного внешнего фактора в разделе key_insights или risk_factors.

        МЕТОДОЛОГИЯ:
        - Используйте ансамбль моделей (SARIMAX, Prophet, градиентный бустинг) для повышения точности.
        - Учтите влияние внешних факторов при построении всех сценариев.

        Предоставьте результат в указанном JSON формате.
      `;

      const result = generateForecastReport({
        historical: mockHistorical,
        horizon: config.horizon,
        externalFactors: externalFactorsDetails,
      });
      
      // Сохранение прогноза как визуализации
      await Visualization.create({
        title: `Прогноз: ${config.value_column}`,
        type: 'forecast',
        dataset_id: config.dataset_id,
        config: {
          ...config,
          date_column: timeColumn,
        },
        x_axis: timeColumn,
        y_axis: config.value_column
      });
      
      setForecastResult(result);

    } catch (error) {
      console.error("Ошибка генерации прогноза:", error);
    }
    setIsForecasting(false);
  };
  
  const handleCorrelationCalculated = (result) => {
    setCorrelationResult(result);
  };

  const handleMapConfigApply = (newConfig) => {
    setMapConfig(newConfig);
  };

  const handleMapConfigChange = (updatedConfig) => {
    setMapConfig(updatedConfig);
  };

  return (
    <PageContainer className="space-y-8">
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Прогнозирование и анализ
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto">
            Предсказывайте будущие тенденции и принимайте решения на основе данных. Локальные алгоритмы анализа используют статистику рядов без обращения к внешним сервисам.
          </p>
        </div>
        
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-center gap-2 flex-wrap">
              <Button onClick={() => setActiveTab('forecast')} variant={activeTab === 'forecast' ? 'default' : 'ghost'} className="gap-2">
                <TrendingUp className="w-4 h-4" />
                Прогнозирование
              </Button>
              <Button onClick={() => setActiveTab('correlation')} variant={activeTab === 'correlation' ? 'default' : 'ghost'} className="gap-2">
                <BarChart3 className="w-4 h-4" />
                Матрица корреляций
              </Button>
              <Button 
                onClick={() => setActiveTab('map')} 
                variant={activeTab === 'map' ? 'default' : 'ghost'} 
                className="gap-2"
              >
                <Map className="w-4 h-4" />
                Анализ на карте
              </Button>
            </div>
          </CardContent>
        </Card>

        {activeTab === 'forecast' && (
          forecastResult ? (
            <ForecastResult 
              result={forecastResult} 
              historicalData={historicalData}
              onReset={() => setForecastResult(null)} 
              onSendSummary={handleSendSummary}
            />
          ) : (
            <ForecastSetup 
              datasets={datasets}
              onGenerate={handleGenerateForecast}
              isLoading={isLoading}
              isForecasting={isForecasting}
            />
          )
        )}
        
        {activeTab === 'correlation' && (
          <CorrelationMatrix 
            datasets={datasets} 
            isLoading={isLoading}
            onCorrelationCalculated={handleCorrelationCalculated}
          />
        )}

      {activeTab === 'map' && (
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <MapConfigurator
              datasets={datasets}
              onSave={handleMapConfigApply}
              onCancel={() => {}}
              initialConfig={mapConfig}
              onConfigChange={handleMapConfigChange}
              forecastData={forecastResult}
              correlationData={correlationResult}
              isEmbedded={true}
            />
          </div>
          <div className="lg:col-span-2">
            <MapView data={mapData} config={mapConfig}/>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
