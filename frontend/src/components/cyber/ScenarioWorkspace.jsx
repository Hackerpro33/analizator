import React, { useEffect, useMemo, useState } from "react";
import { Play, Plus, Save } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { fetchSimulationRuns, runScenario, saveScenario } from "@/api/cybersecurity";
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";

const PHASES = [
  "recon",
  "initial_access",
  "execution",
  "persistence",
  "privilege_escalation",
  "lateral_movement",
  "exfiltration",
  "impact",
];

const TECHNIQUES = [
  "auth_abuse_label",
  "api_abuse_label",
  "scanner_label",
  "lateral_move_label",
  "anomalous_egress_label",
  "access_control_bypass_label",
  "waf_probe_label",
];

const BLANK_SCENARIO = {
  id: "",
  name: "New Scenario",
  description: "",
  intensity: "medium",
  duration_seconds: 60,
  stages: [],
  tags: [],
};

const sanitizeScenario = (scenario = {}) => ({
  ...scenario,
  name: clampName(scenario.name || ""),
});

export default function ScenarioWorkspace({
  scenarios,
  refreshScenarios,
  architectureVersions,
  defaultArchitectureId,
  onRunComplete,
}) {
  const { toast } = useToast();
  const [selectedScenarioId, setSelectedScenarioId] = useState(() => scenarios[0]?.id || "");
  const [draft, setDraft] = useState(() => sanitizeScenario(scenarios[0] || BLANK_SCENARIO));
  const [newStage, setNewStage] = useState({
    phase: "initial_access",
    technique_category: "auth_abuse_label",
    target_service_label: "",
  });
  const [runs, setRuns] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const selectedArchitecture = useMemo(() => {
    return architectureVersions.find((version) => version.id === defaultArchitectureId) || architectureVersions[0];
  }, [architectureVersions, defaultArchitectureId]);

  useEffect(() => {
    const scenario = scenarios.find((item) => item.id === selectedScenarioId);
    if (scenario) {
      setDraft(sanitizeScenario(scenario));
    } else if (scenarios.length) {
      setDraft(sanitizeScenario(scenarios[0]));
      setSelectedScenarioId(scenarios[0].id);
    } else {
      setDraft(sanitizeScenario(BLANK_SCENARIO));
    }
  }, [scenarios, selectedScenarioId]);

  useEffect(() => {
    refreshRuns();
  }, []);

  const refreshRuns = async () => {
    try {
      const response = await fetchSimulationRuns(20);
      setRuns(response.items || []);
    } catch (error) {
      console.error("Failed to fetch runs", error); // eslint-disable-line no-console
    }
  };

  const handleAddStage = () => {
    if (!newStage.target_service_label) {
      toast({ description: "Укажите целевой сервис", variant: "destructive" });
      return;
    }
    setDraft((prev) => ({
      ...prev,
      stages: [...(prev.stages || []), newStage],
    }));
    setNewStage({
      phase: "initial_access",
      technique_category: "auth_abuse_label",
      target_service_label: "",
    });
  };

  const handleSaveScenario = async () => {
    setIsSaving(true);
    try {
      const response = await saveScenario(draft);
      toast({ description: `Сценарий сохранён (${response.scenario.name})` });
      await refreshScenarios();
      setSelectedScenarioId(response.scenario.id);
    } catch (error) {
      toast({ description: error.message || "Ошибка сохранения сценария", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRunScenario = async () => {
    if (!draft.id) {
      toast({ description: "Сохраните сценарий перед запуском", variant: "destructive" });
      return;
    }
    if (!selectedArchitecture) {
      toast({ description: "Нет доступной архитектуры для запуска", variant: "destructive" });
      return;
    }
    try {
      await runScenario(draft.id, { architecture_version_id: selectedArchitecture.id });
      toast({ description: "Сценарий выполнен" });
      if (onRunComplete) {
        onRunComplete();
      }
      refreshRuns();
    } catch (error) {
      toast({ description: error.message || "Ошибка запуска сценария", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-700">Библиотека сценариев</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {scenarios.map((scenario) => (
            <button
              type="button"
              key={scenario.id}
              onClick={() => setSelectedScenarioId(scenario.id)}
              className={`rounded-xl border px-4 py-2 text-left ${
                scenario.id === selectedScenarioId ? "border-indigo-500 bg-indigo-50" : "border-slate-200"
              }`}
            >
              <p className="font-semibold text-slate-800">{scenario.name}</p>
              <p className="text-xs text-slate-500">{scenario.intensity} · {scenario.stages.length} стадий</p>
            </button>
          ))}
          {!scenarios.length && <p className="text-sm text-slate-500">Сценарии отсутствуют.</p>}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="text-slate-700">Конструктор сценариев</CardTitle>
          <Input
            value={draft.name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(event) => setDraft((prev) => ({ ...prev, name: clampName(event.target.value) }))}
            placeholder="Название"
          />
          <Textarea
            value={draft.description || ""}
            onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Описание и контекст"
          />
          <div className="flex flex-wrap gap-3">
            <Select
              value={draft.intensity}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, intensity: value }))}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Интенсивность" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Низкая</SelectItem>
                <SelectItem value="medium">Средняя</SelectItem>
                <SelectItem value="high">Высокая</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              className="w-32"
              value={draft.duration_seconds}
              onChange={(event) => setDraft((prev) => ({ ...prev, duration_seconds: Number(event.target.value) }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveScenario} disabled={isSaving} className="gap-2">
              <Save className="w-4 h-4" />
              Сохранить
            </Button>
            <Button onClick={handleRunScenario} className="gap-2" variant="outline">
              <Play className="w-4 h-4" />
              Запустить (архитектура {selectedArchitecture?.name || "—"})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Стадии</p>
            <div className="space-y-3">
              {(draft.stages || []).map((stage, index) => (
                <div key={`${stage.technique_category}-${index}`} className="border rounded-xl p-3 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between">
                    <span className="text-sm font-semibold text-slate-800">
                      {stage.phase} → {stage.target_service_label || "?"}
                    </span>
                    <Badge variant="outline">{stage.technique_category}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{JSON.stringify(stage.params || {})}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="self-end"
                    onClick={() =>
                      setDraft((prev) => ({
                        ...prev,
                        stages: prev.stages.filter((_, idx) => idx !== index),
                      }))
                    }
                  >
                    Удалить
                  </Button>
                </div>
              ))}
              {!draft.stages?.length && <p className="text-xs text-slate-500">Добавьте хотя бы одну стадию.</p>}
            </div>
          </div>
          <div className="border rounded-xl p-4 space-y-3 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">Добавить стадию</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Select value={newStage.phase} onValueChange={(value) => setNewStage((prev) => ({ ...prev, phase: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Стадия" />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((phase) => (
                    <SelectItem key={phase} value={phase}>
                      {phase}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={newStage.technique_category}
                onValueChange={(value) => setNewStage((prev) => ({ ...prev, technique_category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Техника" />
                </SelectTrigger>
                <SelectContent>
                  {TECHNIQUES.map((technique) => (
                    <SelectItem key={technique} value={technique}>
                      {technique}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Целевой сервис"
                value={newStage.target_service_label}
                onChange={(event) => setNewStage((prev) => ({ ...prev, target_service_label: event.target.value }))}
              />
            </div>
            <Button onClick={handleAddStage} variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить стадию
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-700">История прогонов</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {runs.map((run) => (
            <div key={run.id} className="border rounded-lg p-3 flex flex-col gap-1">
              <div className="flex justify-between text-sm text-slate-700">
                <span>{run.summary?.scenario?.name || run.scenario_id}</span>
                <Badge variant={run.status === "completed" ? "default" : "secondary"}>{run.status}</Badge>
              </div>
              <p className="text-xs text-slate-500">
                {new Date(run.started_at).toLocaleString()} · блокировано {run.summary?.blocked ?? 0} · допущено{" "}
                {run.summary?.allowed ?? 0}
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(run.outcomes || []).map((outcome, idx) => (
                  <Badge key={`${run.id}-${idx}`} variant="outline">
                    {outcome.phase}:{outcome.outcome}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          {!runs.length && <p className="text-sm text-slate-500">Запуски ещё не выполнялись.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
