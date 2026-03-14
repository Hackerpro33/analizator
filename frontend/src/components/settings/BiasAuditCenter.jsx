import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import {
  runBiasAudit,
  fetchBiasAuditHistory,
  fetchBiasAuditSchedules,
  createBiasAuditSchedule,
  deleteBiasAuditRecord,
  deleteBiasAuditSchedule
} from "@/api/biasAudit";
import { Dataset } from "@/api/entities";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle,
  ClipboardList,
  Clock4,
  RefreshCw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Еженедельно", description: "Регулярная проверка каждую неделю." },
  { value: "monthly", label: "Ежемесячно", description: "Оптимально для большинства моделей." },
  { value: "quarterly", label: "Ежеквартально", description: "Периодический обзор без сильной динамики." },
  { value: "yearly", label: "Ежегодно", description: "Редкие проверки для стабильных решений." },
];

const STATUS_BADGE_CLASSES = {
  ok: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  danger: "bg-red-100 text-red-700 border-red-200",
};

const metricValueToString = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return String(value);
  }
  return Math.abs(numeric) >= 0.001 ? numeric.toFixed(3) : numeric.toExponential(2);
};

const formatDateTime = (value) => {
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

const parsePositiveLabel = (value) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === "") return undefined;
  const normalized = trimmed.toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  const numeric = Number(trimmed);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  return trimmed;
};

const parsePrivilegedValues = (value) => {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const cleaned = raw
    .map((item) => {
      const trimmed = String(item).trim();
      if (trimmed === "") return undefined;
      const numeric = Number(trimmed);
      if (!Number.isNaN(numeric)) return numeric;
      const normalized = trimmed.toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      return trimmed;
    })
    .filter((item) => item !== undefined);
  return cleaned.length ? cleaned : undefined;
};

const parseThreshold = (value) => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === "") return undefined;
  const numeric = Number(trimmed);
  return Number.isNaN(numeric) ? undefined : numeric;
};

export default function BiasAuditCenter() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState([]);
  const [history, setHistory] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [activeAudit, setActiveAudit] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  const [form, setForm] = useState({
    datasetId: "",
    fileUrl: "",
    sensitiveAttribute: "",
    predictionColumn: "",
    actualColumn: "",
    positiveLabel: "1",
    privilegedValues: "",
    predictionThreshold: "",
    saveResult: true,
    runNotes: "",
    scheduleFrequency: "monthly",
    scheduleName: "Регулярный аудит",
    scheduleNotes: "",
  });

  const selectedDataset = useMemo(
    () => datasets.find((item) => item.id === form.datasetId),
    [datasets, form.datasetId]
  );
  const datasetColumns = useMemo(() => {
    if (!selectedDataset || !Array.isArray(selectedDataset.columns)) return [];
    return selectedDataset.columns.map((column) => column.name || column.id || "").filter(Boolean);
  }, [selectedDataset]);

  const loadDatasets = useCallback(async () => {
    try {
      const data = await Dataset.list("-created_at");
      setDatasets(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Не удалось загрузить наборы данных", error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось получить список наборов данных.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchBiasAuditHistory();
      setHistory(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error("Не удалось загрузить историю аудитов", error);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const data = await fetchBiasAuditSchedules();
      setSchedules(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      console.error("Не удалось загрузить расписания", error);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
    loadHistory();
    loadSchedules();
  }, [loadDatasets, loadHistory, loadSchedules]);

  const handleDatasetChange = (value) => {
    const datasetId = value === "__none__" ? "" : value;
    const dataset = datasets.find((item) => item.id === datasetId);
    setForm((prev) => ({
      ...prev,
      datasetId,
      fileUrl: dataset?.file_url ?? prev.fileUrl,
    }));
  };

  const buildAuditPayload = () => {
    const sensitiveAttribute = form.sensitiveAttribute.trim();
    const predictionColumn = form.predictionColumn.trim();
    if (!sensitiveAttribute || !predictionColumn) {
      throw new Error("Укажите названия столбцов защищённого признака и предсказаний.");
    }

    const datasetId = form.datasetId || undefined;
    const fileUrl = form.fileUrl.trim() || undefined;
    if (!datasetId && !fileUrl) {
      throw new Error("Выберите набор данных или укажите путь к файлу.");
    }

    const payload = {
      dataset_id: datasetId,
      file_url: fileUrl,
      sensitive_attribute: sensitiveAttribute,
      prediction_column: predictionColumn,
      actual_column: form.actualColumn.trim() || undefined,
      positive_label: parsePositiveLabel(form.positiveLabel),
      privileged_values: parsePrivilegedValues(form.privilegedValues),
      prediction_threshold: parseThreshold(form.predictionThreshold),
      save_result: form.saveResult,
      schedule_frequency: form.scheduleFrequency || undefined,
      notes: form.runNotes.trim() || undefined,
    };

    return payload;
  };

  const handleRunAudit = async () => {
    try {
      const payload = buildAuditPayload();
      setIsRunning(true);
      const response = await runBiasAudit(payload);
      setActiveAudit(response?.audit ?? null);
      toast({
        title: "Аудит завершён",
        description: response?.audit?.summary || "Получены обновлённые метрики смещения.",
      });
      await Promise.all([loadHistory(), loadSchedules()]);
    } catch (error) {
      console.error("Ошибка запуска аудита", error);
      toast({
        title: "Не удалось выполнить аудит",
        description: error?.message || "Попробуйте скорректировать параметры и повторить попытку.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleSaveSchedule = async () => {
    try {
      const payload = buildAuditPayload();
      if (!form.scheduleFrequency) {
        throw new Error("Выберите периодичность аудита.");
      }
      const schedulePayload = {
        name: form.scheduleName?.trim() || "Регулярный аудит",
        frequency: form.scheduleFrequency,
        notes: form.scheduleNotes.trim() || undefined,
        ...payload,
      };
      setIsSavingSchedule(true);
      await createBiasAuditSchedule(schedulePayload);
      toast({
        title: "Расписание сохранено",
        description: "Аудит будет запускаться автоматически по заданному графику.",
      });
      await loadSchedules();
    } catch (error) {
      console.error("Ошибка сохранения расписания", error);
      toast({
        title: "Не удалось сохранить расписание",
        description: error?.message || "Проверьте параметры и попробуйте снова.",
        variant: "destructive",
      });
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteHistory = async (id) => {
    try {
      await deleteBiasAuditRecord(id);
      await loadHistory();
      toast({ title: "Запись удалена" });
    } catch (error) {
      console.error("Не удалось удалить запись аудита", error);
      toast({
        title: "Ошибка удаления",
        description: "Удаление записи не удалось.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteSchedule = async (id) => {
    try {
      await deleteBiasAuditSchedule(id);
      await loadSchedules();
      toast({ title: "Расписание удалено" });
    } catch (error) {
      console.error("Не удалось удалить расписание", error);
      toast({
        title: "Ошибка удаления",
        description: "Удаление расписания не удалось.",
        variant: "destructive",
      });
    }
  };

  const fillFormFromSchedule = (schedule) => {
    const params = schedule.parameters || {};
    setForm((prev) => ({
      ...prev,
      datasetId: schedule.dataset_id || "",
      fileUrl: schedule.file_url || prev.fileUrl,
      sensitiveAttribute: params.sensitive_attribute || "",
      predictionColumn: params.prediction_column || "",
      actualColumn: params.actual_column || "",
      positiveLabel: params.positive_label !== undefined && params.positive_label !== null ? String(params.positive_label) : "",
      privilegedValues: Array.isArray(params.privileged_values)
        ? params.privileged_values.map((item) => String(item)).join(", ")
        : "",
      predictionThreshold: params.prediction_threshold !== undefined && params.prediction_threshold !== null
        ? String(params.prediction_threshold)
        : "",
      saveResult: true,
      scheduleFrequency: schedule.frequency || prev.scheduleFrequency,
      scheduleName: schedule.name || prev.scheduleName,
      scheduleNotes: schedule.notes || params.notes || "",
      runNotes: params.notes || prev.runNotes,
    }));
  };

  const handleRunScheduleNow = async (schedule) => {
    try {
      setIsRunning(true);
      const payload = {
        ...(schedule.parameters || {}),
        dataset_id: schedule.dataset_id,
        file_url: schedule.file_url,
        schedule_id: schedule.id,
        schedule_frequency: schedule.frequency,
        save_result: true,
      };
      const response = await runBiasAudit(payload);
      setActiveAudit(response?.audit ?? null);
      toast({
        title: "Аудит по расписанию выполнен",
        description: response?.audit?.summary || "Результаты добавлены в историю.",
      });
      await Promise.all([loadHistory(), loadSchedules()]);
    } catch (error) {
      console.error("Ошибка запуска расписания", error);
      toast({
        title: "Не удалось выполнить аудит",
        description: error?.message || "Попробуйте запустить аудит ещё раз.",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
    }
  };

  const renderMetricBadge = (metric) => {
    const className = metric.passed ? STATUS_BADGE_CLASSES.ok : STATUS_BADGE_CLASSES.danger;
    return (
      <div key={metric.name} className="p-3 border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{metric.name}</span>
          <Badge className={`${className} text-xs font-semibold`}>{metricValueToString(metric.value)}</Badge>
        </div>
        <p className="text-xs text-slate-500 leading-snug">{metric.interpretation}</p>
        {metric.threshold && (
          <p className="text-[11px] text-slate-400">Порог: {metric.threshold}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-lg bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            Центр аудита алгоритмов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Набор данных</Label>
              <Select value={form.datasetId || "__none__"} onValueChange={handleDatasetChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите набор данных" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Без привязки к набору</SelectItem>
                  {datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{dataset.name}</span>
                        <span className="text-xs text-slate-500">
                          {(dataset.row_count || 0).toLocaleString("ru-RU")} строк
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {datasetColumns.length > 0 && (
                <div className="flex flex-wrap gap-1 text-xs text-slate-500">
                  {datasetColumns.slice(0, 8).map((column) => (
                    <Badge key={column} variant="outline" className="text-[11px]">
                      {column}
                    </Badge>
                  ))}
                  {datasetColumns.length > 8 && (
                    <Badge variant="outline" className="text-[11px]">+{datasetColumns.length - 8}</Badge>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Путь к файлу (если требуется)</Label>
              <Input
                placeholder="/path/to/file.csv"
                value={form.fileUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, fileUrl: event.target.value }))}
              />
              <p className="text-xs text-slate-500">
                Используйте идентификатор загрузки или абсолютный путь при ручной проверке.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Столбец защищённого признака</Label>
              <Input
                placeholder="gender"
                value={form.sensitiveAttribute}
                onChange={(event) => setForm((prev) => ({ ...prev, sensitiveAttribute: event.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Столбец предсказаний</Label>
              <Input
                placeholder="prediction"
                value={form.predictionColumn}
                onChange={(event) => setForm((prev) => ({ ...prev, predictionColumn: event.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Столбец фактов (опционально)</Label>
              <Input
                placeholder="actual"
                value={form.actualColumn}
                onChange={(event) => setForm((prev) => ({ ...prev, actualColumn: event.target.value }))}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Положительный класс</Label>
              <Input
                placeholder="1"
                value={form.positiveLabel}
                onChange={(event) => setForm((prev) => ({ ...prev, positiveLabel: event.target.value }))}
              />
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Привилегированные значения</Label>
              <Input
                placeholder="A, B"
                value={form.privilegedValues}
                onChange={(event) => setForm((prev) => ({ ...prev, privilegedValues: event.target.value }))}
              />
              <p className="text-xs text-slate-500">Укажите значения через запятую. Остальные будут считаться непривилегированными.</p>
            </div>

            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Порог вероятности (для числовых предсказаний)</Label>
              <Input
                placeholder="0.5"
                value={form.predictionThreshold}
                onChange={(event) => setForm((prev) => ({ ...prev, predictionThreshold: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm text-slate-700">Комментарий к запуску</Label>
            <Textarea
              placeholder="Например, проверка после обновления модели"
              value={form.runNotes}
              onChange={(event) => setForm((prev) => ({ ...prev, runNotes: event.target.value }))}
              rows={3}
            />
          </div>

          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex items-start gap-3">
              <Switch
                checked={form.saveResult}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, saveResult: Boolean(checked) }))}
              />
              <div>
                <p className="text-sm font-medium text-slate-700">Сохранять результаты в журнал</p>
                <p className="text-xs text-slate-500">Запуски будут автоматически добавляться в историю аудитов.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleRunAudit} disabled={isRunning}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Запустить аудит
              </Button>
              <Button
                variant="outline"
                onClick={handleSaveSchedule}
                disabled={isSavingSchedule || isRunning}
              >
                <CalendarClock className="w-4 h-4 mr-2" />
                Сохранить расписание
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Название расписания</Label>
              <Input
                placeholder="Регулярный аудит"
                value={form.scheduleName}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, scheduleName: clampName(event.target.value) }))
                }
              />
            </div>
            <div className="space-y-3">
              <Label className="text-sm text-slate-700">Периодичность</Label>
              <Select
                value={form.scheduleFrequency}
                onValueChange={(value) => setForm((prev) => ({ ...prev, scheduleFrequency: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите частоту" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium">{option.label}</span>
                        <span className="text-xs text-slate-500">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm text-slate-700">Заметки к расписанию</Label>
            <Textarea
              placeholder="Контакт ответственного, SLA, дополнительные шаги"
              value={form.scheduleNotes}
              onChange={(event) => setForm((prev) => ({ ...prev, scheduleNotes: event.target.value }))}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="w-5 h-5 text-blue-600" />
            Последний аудит
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeAudit ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                {activeAudit.flagged ? (
                  <Badge className={`${STATUS_BADGE_CLASSES.danger} text-xs`}>Найдены риски</Badge>
                ) : (
                  <Badge className={`${STATUS_BADGE_CLASSES.ok} text-xs`}>Нарушений не обнаружено</Badge>
                )}
                <span className="text-sm text-slate-500">
                  Выполнен {formatDateTime(activeAudit.created_at)}
                </span>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">{activeAudit.summary}</p>
              <div className="grid md:grid-cols-2 gap-4">
                {activeAudit.metrics.map(renderMetricBadge)}
              </div>
              <div className="grid md:grid-cols-2 gap-6 text-sm text-slate-600">
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-700">Привилегированная группа</h4>
                  <p>Значения: {activeAudit.group_metrics?.privileged?.values?.join(", ") || "—"}</p>
                  <p>Наблюдений: {activeAudit.group_metrics?.privileged?.count ?? "—"}</p>
                  <p>Доля положительных исходов: {metricValueToString(activeAudit.group_metrics?.privileged?.positive_rate)}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-slate-700">Непривилегированная группа</h4>
                  <p>Значения: {activeAudit.group_metrics?.unprivileged?.values?.join(", ") || "—"}</p>
                  <p>Наблюдений: {activeAudit.group_metrics?.unprivileged?.count ?? "—"}</p>
                  <p>Доля положительных исходов: {metricValueToString(activeAudit.group_metrics?.unprivileged?.positive_rate)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold text-slate-700">Рекомендации</h4>
                <ul className="list-disc pl-5 text-sm text-slate-600 space-y-1">
                  {(activeAudit.recommendations || []).map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Запустите аудит, чтобы увидеть подробный отчёт.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock4 className="w-5 h-5 text-purple-600" />
            Расписания аудита
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {schedules.length === 0 ? (
            <p className="text-sm text-slate-500">Нет запланированных проверок. Сохраните расписание, чтобы настроить регулярный аудит.</p>
          ) : (
            schedules.map((schedule) => (
              <div key={schedule.id} className="p-4 border rounded-xl bg-white/60 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{schedule.name}</p>
                    <p className="text-xs text-slate-500">{schedule.parameters?.sensitive_attribute} → {schedule.parameters?.prediction_column}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleRunScheduleNow(schedule)} disabled={isRunning}>
                      <RefreshCw className="w-4 h-4 mr-1" /> Запустить сейчас
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => fillFormFromSchedule(schedule)}>
                      Загрузить в форму
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDeleteSchedule(schedule.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid md:grid-cols-3 gap-4 text-xs text-slate-500">
                  <div>
                    <span className="font-medium text-slate-700">Частота:</span> {schedule.frequency || "—"}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Следующий запуск:</span> {formatDateTime(schedule.next_run_due)}
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Последний запуск:</span> {formatDateTime(schedule.last_run_at)}
                  </div>
                </div>
                {schedule.notes && (
                  <p className="text-xs text-slate-500">{schedule.notes}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ClipboardList className="w-5 h-5 text-slate-600" />
            История аудитов
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">История пуста. После запусков аудита результаты появятся здесь.</p>
          ) : (
            history.map((entry) => (
              <div key={entry.id} className="p-4 border rounded-xl bg-white/60 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {entry.flagged ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                    )}
                    <p className="text-sm font-semibold text-slate-800">
                      {formatDateTime(entry.created_at)}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleDeleteHistory(entry.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-sm text-slate-600">{entry.summary}</p>
                <div className="grid md:grid-cols-2 gap-3">
                  {(entry.metrics || []).slice(0, 4).map(renderMetricBadge)}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
