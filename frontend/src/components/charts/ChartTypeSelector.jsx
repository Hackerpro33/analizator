import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart3,
  LineChart,
  ScatterChart,
  TrendingUp,
  Plus,
  Sparkles,
  Box,
  Sigma,
  FunctionSquare,
  BrainCircuit,
  Binary,
  Calculator,
  CheckCircle2,
  LayoutDashboard,
  Map,
  Atom,
  Infinity as InfinityIcon,
  PiSquare,
  Layers,
  Grid3X3,
  Braces
} from "lucide-react";

export default function ChartTypeSelector({ onSelectType, datasets }) {
  const navigate = useNavigate();

  const chartTypes = [
    {
      id: 'line',
      name: 'Линейный график',
      description: 'Идеально для отображения трендов во времени',
      icon: LineChart,
      gradient: 'from-blue-500 to-cyan-600',
      example: 'Тренды продаж, метрики производительности'
    },
    {
      id: 'bar',
      name: 'Столбчатая диаграмма',
      description: 'Сравнение различных категорий',
      icon: BarChart3,
      gradient: 'from-emerald-500 to-teal-600',
      example: 'Доходы по регионам, количество пользователей'
    },
    {
      id: 'scatter',
      name: 'Диаграмма рассеяния',
      description: 'Исследование взаимосвязей между переменными',
      icon: ScatterChart,
      gradient: 'from-purple-500 to-indigo-600',
      example: 'Цена vs качество, корреляционный анализ'
    },
    {
      id: 'area',
      name: 'Диаграмма с областями',
      description: 'Показать совокупные итоги во времени',
      icon: TrendingUp,
      gradient: 'from-orange-500 to-red-600',
      example: 'Многослойные данные, кумулятивный рост'
    },
    {
      id: '3d',
      name: '3D Визуализация',
      description: 'Трехмерное отображение данных',
      icon: Box,
      gradient: 'from-pink-500 to-rose-600',
      example: 'Объемные данные, пространственный анализ'
    }
  ];

  const econometricsTools = [
    {
      title: 'Регрессионные модели',
      description: 'Линейные и нелинейные модели, диагностика, регуляризация и работа с инструментальными переменными.',
      icon: TrendingUp,
      accent: 'from-blue-500 to-cyan-500',
      tools: ['Линейная/множественная OLS', 'Логит/Прбит модели', 'Ridge/Lasso', 'Инструментальные переменные', 'Диагностика остатков']
    },
    {
      title: 'Анализ временных рядов',
      description: 'Продвинутые сценарии прогноза: ARIMA, SARIMAX, Prophet, сезонность и обработка выбросов.',
      icon: LineChart,
      accent: 'from-indigo-500 to-purple-500',
      tools: ['ARIMA/SARIMA', 'SARIMAX', 'Prophet', 'Поиск сезонности', 'Декомпозиция трендов']
    },
    {
      title: 'Панельные данные и причинность',
      description: 'Fixed/Random effects модели, Difference-in-Differences, тесты на коинтеграцию и причинность.',
      icon: BrainCircuit,
      accent: 'from-emerald-500 to-teal-500',
      tools: ['Fixed / Random effects', 'Difference-in-Differences', 'GMM', 'Тест Грейнджера', 'Коинтеграция (ADF, KPSS)']
    },
    {
      title: 'Кластеризация и сегментация',
      description: 'Кластеризация K-Means, иерархические методы, анализ главных компонент и факторный анализ.',
      icon: ScatterChart,
      accent: 'from-amber-500 to-orange-500',
      tools: ['K-Means', 'DBSCAN', 'Иерархическая кластеризация', 'PCA', 'Факторный анализ']
    },
    {
      title: 'Оценка рисков и сценарный анализ',
      description: 'Монте-Карло, стресс-тестирование портфелей, Value at Risk и оптимизация активов.',
      icon: BarChart3,
      accent: 'from-rose-500 to-red-500',
      tools: ['Симуляции Монте-Карло', 'Value at Risk', 'CVaR', 'Stress-test', 'Оптимизация портфеля']
    },
    {
      title: 'Байесовские и вероятностные модели',
      description: 'Анализ неопределённости: байесовский вывод, MCMC и скрытые марковские модели.',
      icon: Sigma,
      accent: 'from-fuchsia-500 to-pink-500',
      tools: ['MCMC', 'Байесовские сети', 'HMM', 'Апостериорные распределения', 'Аппроксимация Лапласа']
    },
    {
      title: 'Эконометрия высокого измерения',
      description: 'Работа с большими признаковыми пространствами, отбор переменных и регуляризация панельных данных.',
      icon: Grid3X3,
      accent: 'from-slate-500 to-slate-700',
      tools: ['LASSO для панелей', 'SCAD/ElasticNet', 'Screening признаков', 'Стабильность моделей', 'Кросс-валидация']
    }
  ];

  const mathTools = [
    {
      title: 'Оптимизация и численные методы',
      description: 'Линейное/квадратичное программирование, градиентные методы, решение систем уравнений.',
      icon: FunctionSquare,
      accent: 'from-orange-500 to-yellow-500',
      tools: ['Simplex', 'QP оптимизация', 'Градиентный спуск', 'Нелинейные решатели', 'Системы уравнений']
    },
    {
      title: 'Статистика и проверки гипотез',
      description: 'T-тесты, ANOVA, непараметрические проверки, бутстрэп и байесовский анализ.',
      icon: Sigma,
      accent: 'from-sky-500 to-blue-500',
      tools: ['t/z тесты', 'ANOVA', 'Хи-квадрат', 'Манна-Уитни', 'Бутстрэп/пермутации']
    },
    {
      title: 'Математика данных',
      description: 'Матрицы, собственные значения, сингулярное разложение и операции с тензорами.',
      icon: Binary,
      accent: 'from-violet-500 to-fuchsia-500',
      tools: ['Линал операции', 'SVD', 'Eigenvalues', 'Тензорные вычисления', 'Нормализация признаков']
    },
    {
      title: 'Прикладные расчёты',
      description: 'Финансовая математика, анализ чувствительности, модели роста и дисконтирование.',
      icon: Calculator,
      accent: 'from-lime-500 to-emerald-500',
      tools: ['NPV/IRR', 'DCF', 'Цепочки Маркова', 'Эластичности', 'Сенситивити-анализ']
    },
    {
      title: 'Стохастика и симуляции',
      description: 'Моделирование неопределённости: случайные процессы, статистические эксперименты и оценки рисков.',
      icon: Atom,
      accent: 'from-cyan-500 to-teal-500',
      tools: ['Цепи Маркова', 'Стохастический градиент', 'Процесс Пуассона', 'Монте-Карло сценарии', 'Бутстрэп-симуляции']
    },
    {
      title: 'Дифференциальные уравнения и динамика',
      description: 'ODE/PDE решатели, численная интеграция, устойчивость систем и моделирование траекторий.',
      icon: InfinityIcon,
      accent: 'from-indigo-500 to-blue-700',
      tools: ['Runge-Kutta', 'Методы конечных разностей', 'PDE сетки', 'Стационарность', 'Ляпунов анализ']
    },
    {
      title: 'Символьные вычисления и аналитика',
      description: 'Автоматическое упрощение выражений, интегрирование, дифференцирование и генерация формул.',
      icon: PiSquare,
      accent: 'from-rose-500 to-purple-500',
      tools: ['SymPy сценарии', 'Символьные производные', 'Интегралы', 'Решение уравнений', 'LaTeX отчёты']
    },
    {
      title: 'Функциональный анализ и вариационные методы',
      description: 'Гильбертовы пространства, разложения по базисам и решения задач оптимального управления.',
      icon: Layers,
      accent: 'from-blue-600 to-indigo-700',
      tools: ['Разложения Фурье', 'Вариационные принципы', 'Ортогональные базисы', 'Функционалы энергии', 'Метод Галеркина']
    },
    {
      title: 'Комбинаторика и теория графов',
      description: 'Комбинаторные оценки, графовые алгоритмы и анализ сетевых структур.',
      icon: Braces,
      accent: 'from-amber-600 to-orange-600',
      tools: ['Генераторы перестановок', 'Поиск в ширину/глубину', 'Кратчайшие пути', 'Теория матчей', 'Комбинаторные суммы']
    },
    {
      title: 'Вычислительная геометрия и 3D-моделирование',
      description: 'Геометрические алгоритмы, сеточные аппроксимации и расчёт кривых поверхностей.',
      icon: Box,
      accent: 'from-cyan-600 to-sky-600',
      tools: ['Выпуклые оболочки', 'Триангуляция Делоне', 'Интерполяция сплайнами', 'Меш-анализ', 'Геометрические оптимизации']
    }
  ];

  const analysisSuites = [
    {
      id: 'forecasting',
      title: 'Лаборатория прогнозов',
      description: 'Сценарные прогнозы, ансамбль моделей и оценка чувствительности к внешним факторам.',
      icon: TrendingUp,
      accent: 'from-sky-500 to-blue-600',
      features: ['ARIMA/SARIMAX', 'Сценарии оптимист/база/пессимист', 'Анализ чувствительности'],
      actionLabel: 'Перейти к прогнозу',
      onClick: () => navigate('/Forecasting')
    },
    {
      id: 'causal',
      title: 'Причинно-следственная аналитика',
      description: 'Исследуйте связи между объектами, проверяйте гипотезы и тестируйте эффекты вмешательств.',
      icon: BrainCircuit,
      accent: 'from-violet-500 to-fuchsia-600',
      features: ['Граф зависимостей', 'Difference-in-Differences', 'GMM и тесты причинности'],
      actionLabel: 'Исследовать связи',
      onClick: () => navigate('/NetworkGraphs')
    },
    {
      id: 'data-lab',
      title: 'Мастерская данных',
      description: 'Готовьте данные к анализу: очистка, обогащение, конструктор признаков и автоматизация.',
      icon: Sigma,
      accent: 'from-emerald-500 to-lime-500',
      features: ['Очистка и нормализация', 'Автогенерация признаков', 'Валидация качеств'],
      actionLabel: 'Открыть трансформацию',
      onClick: () => navigate('/DataTransformation')
    },
    {
      id: 'reporting',
      title: 'Конструктор отчётов',
      description: 'Собирайте дашборды, комбинируйте виджеты и генерируйте автоматические отчёты.',
      icon: LayoutDashboard,
      accent: 'from-orange-500 to-amber-500',
      features: ['Дашборды и виджеты', 'Автогенерация отчётов', 'Кросс-датасет визуализации'],
      actionLabel: 'Перейти в конструктор',
      onClick: () => navigate('/Constructor')
    },
    {
      id: 'geo',
      title: 'Геоаналитика',
      description: 'Анализируйте пространственные данные, тепловые карты и маршруты.',
      icon: Map,
      accent: 'from-teal-500 to-cyan-500',
      features: ['Тепловые карты', 'Региональные сравнения', 'Анализ маршрутов'],
      actionLabel: 'Работать с картами',
      onClick: () => navigate('/Maps')
    }
  ];

  const renderToolkitSection = (section) => (
    <div
      key={section.title}
      className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-5 shadow-inner">
      <div className="flex items-start gap-4">
        <div className={`rounded-xl bg-gradient-to-r ${section.accent} p-3 shadow-lg`}>
          <section.icon className="h-5 w-5 text-white" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-white heading-text">{section.title}</h3>
          <p className="text-sm text-slate-300 elegant-text">{section.description}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {section.tools.map((tool) => (
          <Badge
            key={tool}
            variant="outline"
            className="border-slate-700 bg-slate-900/80 text-slate-100">
            {tool}
          </Badge>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Выберите тип графика
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {chartTypes.map((type) => (
              <Card 
                key={type.id}
                className="group border-0 bg-white/70 backdrop-blur-sm shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-105 cursor-pointer"
                onClick={() => onSelectType(type.id)}
              >
                <CardContent className="p-6 text-center space-y-4">
                  <div className={`w-16 h-16 mx-auto bg-gradient-to-r ${type.gradient} rounded-2xl flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}>
                    <type.icon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2 heading-text">{type.name}</h3>
                    <p className="text-sm text-slate-600 mb-3 elegant-text">{type.description}</p>
                    <Badge variant="secondary" className="text-xs elegant-text">
                      {type.example}
                    </Badge>
                  </div>
                  <Button 
                    className={`w-full bg-gradient-to-r ${type.gradient} hover:opacity-90 text-white border-0 gap-2 elegant-text`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectType(type.id);
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    Создать {type.name}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-gradient-to-r from-slate-900 via-indigo-900 to-purple-900 text-white shadow-2xl">
        <CardContent className="p-8 space-y-6">
          <div className="flex flex-col gap-3">
            <span className="inline-flex items-center gap-2 text-sm uppercase tracking-wide text-indigo-200">
              <Sparkles className="h-4 w-4" /> Интеллектуальные инструменты анализа
            </span>
            <h2 className="text-2xl font-semibold heading-text">Эконометрика и расширенные математические модули</h2>
            <p className="text-sm text-indigo-100/80 elegant-text">
              Откройте полноценный набор аналитических инструментов: прогнозируйте временные ряды, оценивайте причинно-следственные связи и применяйте численные методы без переключения контекста.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-3xl bg-white/10 p-5 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-500 p-3">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold heading-text">Эконометрический комбайн</h3>
                  <p className="text-sm text-indigo-100/80 elegant-text">Регрессии, панели, временные ряды и риск-анализ в едином интерфейсе.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Прогноз спроса', 'Коинтеграция', 'Диагностика моделей', 'Stress-test'].map((item) => (
                  <Badge key={item} className="bg-blue-500/20 text-blue-50 border-blue-400/40">
                    {item}
                  </Badge>
                ))}
              </div>
              <div className="space-y-3 pt-2">
                {econometricsTools.slice(0, 2).map((tool) => (
                  <div
                    key={tool.title}
                    className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-3 shadow-inner">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg bg-gradient-to-r ${tool.accent} p-2 shadow-md`}>
                        <tool.icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-indigo-50 heading-text">{tool.title}</p>
                        <p className="text-xs text-indigo-100/80 elegant-text">{tool.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white gap-2 elegant-text">
                    <Sigma className="h-4 w-4" /> Открыть эконометрику
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-2xl border-l border-slate-800 bg-slate-950 text-slate-100">
                  <SheetHeader>
                    <SheetTitle className="text-2xl font-semibold heading-text text-white">Эконометрический набор инструментов</SheetTitle>
                    <SheetDescription className="text-slate-300 elegant-text">
                      Готовые сценарии анализа данных: выберите методику и сразу переходите к построению графиков на основе результатов.
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="mt-6 h-[calc(100vh-220px)] pr-4">
                    <div className="space-y-5">
                      {econometricsTools.map(renderToolkitSection)}
                    </div>
                  </ScrollArea>
                  <div className="mt-6 space-y-3">
                    <SheetClose asChild>
                      <Button
                        onClick={() => onSelectType('line')}
                        className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white gap-2 heading-text">
                        <LineChart className="h-4 w-4" /> Построить временной ряд
                      </Button>
                    </SheetClose>
                    <p className="text-xs text-slate-400 elegant-text">
                      Совет: выберите набор данных с датой или категорией времени, чтобы протестировать прогностические модели сразу после анализа.
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            </div>

            <div className="space-y-4 rounded-3xl bg-white/10 p-5 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-500 p-3">
                  <FunctionSquare className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold heading-text">Математическая мастерская</h3>
                  <p className="text-sm text-indigo-100/80 elegant-text">Численные методы, статистика и моделирование для углублённой аналитики.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Оптимизация', 'Гипотезы', 'Матрицы', 'Финансовые формулы', 'Байесовский анализ', 'Комбинаторика'].map((item) => (
                  <Badge key={item} className="bg-emerald-500/20 text-emerald-50 border-emerald-400/40">
                    {item}
                  </Badge>
                ))}
              </div>
              <div className="space-y-3 pt-2">
                {mathTools.slice(0, 3).map((tool) => (
                  <div
                    key={tool.title}
                    className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 shadow-inner">
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg bg-gradient-to-r ${tool.accent} p-2 shadow-md`}>
                        <tool.icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-emerald-50 heading-text">{tool.title}</p>
                        <p className="text-xs text-emerald-100/80 elegant-text">{tool.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button className="w-full bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-600 hover:to-lime-600 text-white gap-2 elegant-text">
                    <FunctionSquare className="h-4 w-4" /> Математические инструменты
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-2xl border-l border-slate-800 bg-slate-950 text-slate-100">
                  <SheetHeader>
                    <SheetTitle className="text-2xl font-semibold heading-text text-white">Математическая лаборатория</SheetTitle>
                    <SheetDescription className="text-slate-300 elegant-text">
                      Собрали проверенные методики для численных расчётов, статистики и прикладных задач — выбирайте и применяйте в пару кликов.
                    </SheetDescription>
                  </SheetHeader>
                  <ScrollArea className="mt-6 h-[calc(100vh-220px)] pr-4">
                    <div className="space-y-5">
                      {mathTools.map(renderToolkitSection)}
                    </div>
                  </ScrollArea>
                  <div className="mt-6 space-y-3">
                    <SheetClose asChild>
                      <Button
                        onClick={() => onSelectType('scatter')}
                        className="w-full bg-gradient-to-r from-emerald-500 to-lime-500 hover:from-emerald-600 hover:to-lime-600 text-white gap-2 heading-text">
                        <ScatterChart className="h-4 w-4" /> Запустить аналитический конструктор
                      </Button>
                    </SheetClose>
                    <p className="text-xs text-slate-400 elegant-text">
                      Лайфхак: комбинируйте расчёты с визуализацией — после расчёта просто выберите тип графика и примените результаты.
                    </p>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              'Куратор сценариев подскажет оптимальную методологию под ваши данные.',
              'Пошаговые шпаргалки помогают не забыть проверки и диагностику моделей.',
              'Экспортируйте отчёт с описанием выбранных методов одним кликом.'
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 rounded-2xl bg-white/5 p-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                <p className="text-sm text-indigo-100/90 elegant-text">{item}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/70 backdrop-blur-md shadow-xl">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl font-semibold text-slate-900 heading-text flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" /> Витрина аналитических инструментов
          </CardTitle>
          <p className="text-sm text-slate-600 elegant-text max-w-3xl">
            Быстрые переходы к специализированным модулям платформы: от прогностических сценариев до геоаналитики и автоматического формирования отчётов.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {analysisSuites.map((suite) => (
              <div
                key={suite.id}
                className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/70 bg-white/80 p-5 shadow-inner">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-xl bg-gradient-to-r ${suite.accent} p-3 shadow-md`}>
                      <suite.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 heading-text">{suite.title}</h3>
                      <p className="text-sm text-slate-600 elegant-text">{suite.description}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suite.features.map((feature) => (
                      <Badge
                        key={feature}
                        variant="secondary"
                        className="border-slate-200 bg-slate-100 text-slate-700">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={suite.onClick}
                  className={`mt-6 w-full bg-gradient-to-r ${suite.accent} text-white hover:opacity-90 gap-2 heading-text`}>
                  <Sparkles className="h-4 w-4" /> {suite.actionLabel}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {datasets.length === 0 && (
        <Card className="border-0 bg-gradient-to-r from-yellow-50 to-orange-50 shadow-lg border border-yellow-200">
          <CardContent className="text-center py-8">
            <h3 className="text-lg font-semibold text-orange-700 mb-2 heading-text">Нет доступных наборов данных</h3>
            <p className="text-orange-600 mb-4 elegant-text">Вам необходимо сначала загрузить набор данных перед созданием графиков.</p>
            <Button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white elegant-text">
              Загрузить набор данных
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
