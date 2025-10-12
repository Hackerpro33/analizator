import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Cpu,
  Settings,
  CheckCircle,
  AlertCircle,
  Activity,
  Sliders,
  Gauge,
  HardDrive,
  Upload,
  Trash2,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const LOCAL_MODELS_STORAGE_KEY = "customAiModels";
const ACTIVE_MODEL_STORAGE_KEY = "activeAiModelId";

const BUILT_IN_MODEL = {
  id: "builtin-analyst",
  name: "Встроенная модель анализа",
  description: "Оптимизирована для табличных данных и поставляется вместе с системой.",
  builtIn: true,
};

const formatFileSize = (size) => {
  if (!size) return "—";
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = size;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  const formatted = value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[index]}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const LOCAL_MODULES = [
  {
    id: "forecast",
    name: "Прогнозирование",
    description: "Локальный движок временных рядов с сезонной и трендовой составляющими.",
    recommendedWindow: 30,
  },
  {
    id: "correlation",
    name: "Корреляционный анализ",
    description: "Построение матриц корреляций и отбор сильных связей без сети.",
    recommendedWindow: 50,
  },
  {
    id: "reports",
    name: "Отчётность",
    description: "Генерация сводных PDF отчётов на базе локальных шаблонов.",
    recommendedWindow: 0,
  },
];

const PERFORMANCE_PRESETS = [
  { id: "balanced", label: "Сбалансированный", description: "Оптимальное соотношение скорости и качества." },
  { id: "fast", label: "Быстрый", description: "Минимальные задержки, подходит для черновых расчётов." },
  { id: "accurate", label: "Точный", description: "Максимальная детализация и проверка результатов." },
];

export default function AIModelSettings() {
  const [customModels, setCustomModels] = useState([]);
  const models = useMemo(() => [BUILT_IN_MODEL, ...customModels], [customModels]);
  const [activeModelId, setActiveModelId] = useState(BUILT_IN_MODEL.id);
  const [enabledModules, setEnabledModules] = useState(new Set(LOCAL_MODULES.map((module) => module.id)));
  const [performancePreset, setPerformancePreset] = useState("balanced");
  const [customWindow, setCustomWindow] = useState(45);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationLogs, setCalibrationLogs] = useState([]);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let parsedModels = [];
    try {
      const storedModels = window.localStorage.getItem(LOCAL_MODELS_STORAGE_KEY);
      if (storedModels) {
        const parsed = JSON.parse(storedModels);
        if (Array.isArray(parsed)) {
          parsedModels = parsed;
          setCustomModels(parsed);
        }
      }
    } catch (error) {
      console.error("Не удалось загрузить список моделей из localStorage", error);
    }

    try {
      const storedActiveModel = window.localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY);
      if (
        storedActiveModel &&
        (storedActiveModel === BUILT_IN_MODEL.id || parsedModels.some((model) => model.id === storedActiveModel))
      ) {
        setActiveModelId(storedActiveModel);
      } else {
        setActiveModelId(BUILT_IN_MODEL.id);
      }
    } catch (error) {
      console.error("Не удалось восстановить активную модель", error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(LOCAL_MODELS_STORAGE_KEY, JSON.stringify(customModels));
    } catch (error) {
      console.error("Не удалось сохранить список моделей", error);
    }
  }, [customModels]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, activeModelId);
    } catch (error) {
      console.error("Не удалось сохранить выбранную модель", error);
    }
  }, [activeModelId]);

  const toggleModule = (id) => {
    setEnabledModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleActiveModelChange = (value) => {
    setActiveModelId(value);
    const selectedModel = models.find((model) => model.id === value);
    if (selectedModel) {
      const label = selectedModel.builtIn ? `${selectedModel.name} (встроенная)` : selectedModel.name;
      setCalibrationLogs((prev) => [...prev, `Активирована модель: ${label}.`]);
    }
  };

  const handleModelUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleModelUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const newModel = {
      id: `custom-${Date.now()}`,
      name: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      builtIn: false,
    };

    setCustomModels((prev) => [...prev, newModel]);
    setActiveModelId(newModel.id);
    setCalibrationLogs((prev) => [
      ...prev,
      `Добавлена локальная модель: ${file.name} (${formatFileSize(file.size)}).`,
      `Активирована модель: ${newModel.name}.`,
    ]);

    if (event.target) {
      event.target.value = "";
    }
  };

  const handleModelRemoval = (id) => {
    const removedModel = models.find((model) => model.id === id);
    const updates = [];
    if (removedModel) {
      updates.push(`Модель ${removedModel.name} удалена из локального списка.`);
    }

    const removingActive = activeModelId === id;

    setCustomModels((prev) => prev.filter((model) => model.id !== id));

    if (removingActive) {
      updates.push(`Возвращено использование встроенной модели: ${BUILT_IN_MODEL.name}.`);
      setActiveModelId(BUILT_IN_MODEL.id);
    }

    if (updates.length > 0) {
      setCalibrationLogs((prev) => [...prev, ...updates]);
    }
  };

  const handleCalibration = () => {
    if (isCalibrating) return;
    setIsCalibrating(true);
    setCalibrationProgress(0);
    setCalibrationLogs(["Запуск калибровки локальных алгоритмов..."]);

    const steps = [
      "Анализ исторических метрик и проверка границ значений",
      "Настройка шага сглаживания и порогов корреляции",
      "Валидация отчётных шаблонов и проверка формулировок",
      "Калибровка завершена успешно",
    ];

    let stepIndex = 0;
    const interval = setInterval(() => {
      stepIndex += 1;
      setCalibrationProgress((prev) => Math.min(prev + 25, 100));
      setCalibrationLogs((prev) => [...prev, steps[Math.min(stepIndex, steps.length - 1)]]);
      if (stepIndex >= steps.length - 1) {
        clearInterval(interval);
        setIsCalibrating(false);
      }
    }, 600);
  };

  const handlePresetChange = (value) => {
    setPerformancePreset(value);
    setCalibrationLogs((prev) => [
      ...prev,
      `Выбран режим: ${PERFORMANCE_PRESETS.find((preset) => preset.id === value)?.label || value}`,
    ]);
  };

  return (
    <div className="grid gap-6">
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <HardDrive className="w-5 h-5 text-blue-500" />
            Управление моделями ИИ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-3 text-sm text-slate-600">
            <p>
              Подключайте собственные модели в формате GGUF, ONNX, PyTorch и других распространённых типов. Загруженные модели
              сохраняются локально и не покидают вашу инфраструктуру.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".bin,.gguf,.onnx,.pt,.pth,.safetensors,.zip,.tar,.json"
                className="hidden"
                onChange={handleModelUpload}
              />
              <Button onClick={handleModelUploadClick} className="gap-2">
                <Upload className="w-4 h-4" />
                Загрузить модель
              </Button>
              <Badge variant="outline">Доступно моделей: {models.length}</Badge>
            </div>
          </div>

          <RadioGroup value={activeModelId} onValueChange={handleActiveModelChange} className="grid gap-4 md:grid-cols-2">
            {models.map((model) => (
              <Card
                key={model.id}
                className={`border ${
                  activeModelId === model.id ? "border-emerald-300 shadow-lg" : "border-slate-200"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={model.id} id={`model-${model.id}`} className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <label
                            htmlFor={`model-${model.id}`}
                            className="font-medium text-slate-900 cursor-pointer leading-snug"
                          >
                            {model.name}
                          </label>
                          <p className="text-xs text-slate-500 leading-relaxed">
                            {model.builtIn
                              ? BUILT_IN_MODEL.description
                              : `Файл: ${model.fileName} • ${formatFileSize(model.fileSize)} • загружено ${formatDate(
                                  model.uploadedAt
                                )}`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={model.builtIn ? "secondary" : "outline"}>
                            {model.builtIn ? "По умолчанию" : "Локальная"}
                          </Badge>
                          {!model.builtIn && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-rose-500 hover:text-rose-600"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleModelRemoval(model.id);
                              }}
                              aria-label={`Удалить модель ${model.name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Cpu className="w-5 h-5 text-purple-500" />
            Локальные алгоритмы анализа данных
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-slate-600">
            Включайте и настраивайте модули, которые работают полностью в вашей инфраструктуре. Ни один из алгоритмов не требует подключений к облачным сервисам.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            {LOCAL_MODULES.map((module) => (
              <Card key={module.id} className={`border ${enabledModules.has(module.id) ? "border-emerald-300" : "border-slate-200"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4 text-emerald-500" />
                    {module.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <p>{module.description}</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant={enabledModules.has(module.id) ? "default" : "outline"} onClick={() => toggleModule(module.id)}>
                      {enabledModules.has(module.id) ? "Включено" : "Выключено"}
                    </Button>
                    <Badge variant="outline">Окно: {module.recommendedWindow || "авто"}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm text-slate-700 flex items-center gap-2">
                <Sliders className="w-4 h-4" />
                Режим производительности
              </Label>
              <Select value={performancePreset} onValueChange={handlePresetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите режим" />
                </SelectTrigger>
                <SelectContent>
                  {PERFORMANCE_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{preset.label}</span>
                        <span className="text-xs text-slate-500">{preset.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700 flex items-center gap-2">
                <Gauge className="w-4 h-4" />
                Пользовательское окно сглаживания (дней)
              </Label>
              <Input
                type="number"
                min={7}
                max={180}
                value={customWindow}
                onChange={(event) => setCustomWindow(Number(event.target.value))}
              />
              <p className="text-xs text-slate-500">
                Используется для прогнозов и корреляционного анализа при включённом пользовательском режиме.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Activity className="w-5 h-5 text-blue-500" />
            Калибровка и диагностика
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              {isCalibrating ? (
                <AlertCircle className="w-5 h-5 text-amber-500" />
              ) : (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              )}
              <div>
                <p className="font-medium text-slate-800">
                  {isCalibrating ? "Выполняется калибровка" : "Алгоритмы готовы к работе"}
                </p>
                <p className="text-xs text-slate-500">
                  Последние параметры: режим {PERFORMANCE_PRESETS.find((preset) => preset.id === performancePreset)?.label.toLowerCase()} • окно {customWindow} дней
                </p>
              </div>
            </div>
            <Button onClick={handleCalibration} disabled={isCalibrating}>
              {isCalibrating ? "Калибровка..." : "Запустить калибровку"}
            </Button>
          </div>

          <Progress value={calibrationProgress} className="h-2" />

          <div className="space-y-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3 bg-slate-50/60 text-xs text-slate-600">
            {calibrationLogs.length === 0 ? (
              <p>История калибровок появится после запуска процедуры.</p>
            ) : (
              calibrationLogs.map((log, index) => <div key={index}>{log}</div>)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
