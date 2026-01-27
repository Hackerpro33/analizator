import React, { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCcw, Save, Layers } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import SecurityGraph from "./SecurityGraph";
import { cloneArchitectureVersion, diffArchitectureVersions, saveArchitectureVersion } from "@/api/cybersecurity";

const TOPOLOGY_OPTIONS = [
  { value: "monolith", label: "Монолит" },
  { value: "microservices", label: "Микросервисы" },
  { value: "mesh", label: "Mesh" },
  { value: "segmented", label: "Segmented" },
];

const BLANK_ARCHITECTURE = {
  id: "",
  name: "New Architecture",
  description: "",
  topology_preset: "microservices",
  nodes: [],
  edges: [],
  segments: [
    { id: "dmz", label: "DMZ" },
    { id: "internal", label: "Internal" },
  ],
  placement: {},
  enabled_flags: {},
  policies: [],
};

function mapToGraphData(draft) {
  return {
    nodes: (draft.nodes || []).map((node, index) => ({
      id: node.id,
      label: node.label || node.id,
      type: draft.placement?.[node.id] || "service",
      degree: 1,
      radius: 14 + (index % 4),
    })),
    edges: (draft.edges || []).map((edge) => ({
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: edge.protocol || "https",
      count: 1,
    })),
  };
}

export default function ArchitectureWorkspace({ versions, refreshVersions }) {
  const { toast } = useToast();
  const [selectedVersionId, setSelectedVersionId] = useState(() => versions[0]?.id || "");
  const [draft, setDraft] = useState(() => ({ ...(versions[0] || BLANK_ARCHITECTURE) }));
  const [diffTarget, setDiffTarget] = useState("");
  const [diff, setDiff] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!versions.length) {
      setDraft(BLANK_ARCHITECTURE);
      setSelectedVersionId("");
      return;
    }
    if (!selectedVersionId) {
      setSelectedVersionId(versions[0].id);
      setDraft(versions[0]);
    } else {
      const next = versions.find((item) => item.id === selectedVersionId);
      if (next) {
        setDraft(next);
      }
    }
  }, [versions, selectedVersionId]);

  const graphData = useMemo(() => mapToGraphData(draft), [draft]);

  const handleServiceSegment = (serviceId, segmentId) => {
    setDraft((prev) => ({
      ...prev,
      placement: {
        ...(prev.placement || {}),
        [serviceId]: segmentId,
      },
    }));
  };

  const handleAddService = () => {
    const id = `svc-${(draft.nodes?.length || 0) + 1}`;
    setDraft((prev) => ({
      ...prev,
      nodes: [...(prev.nodes || []), { id, label: `Service ${prev.nodes.length + 1}` }],
    }));
  };

  const handleAddPolicy = () => {
    setDraft((prev) => ({
      ...prev,
      policies: [
        ...(prev.policies || []),
        {
          id: `policy-${prev.policies.length + 1}`,
          from_segment: "dmz",
          to_segment: "prod",
          allow: false,
          controls: { mtls: true, ids_level: "high" },
          rationale: "Example deny",
        },
      ],
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = { ...draft };
      const response = await saveArchitectureVersion(payload);
      toast({ description: `Архитектура сохранена (${response.version.name})` });
      await refreshVersions();
      setSelectedVersionId(response.version.id);
    } catch (error) {
      toast({ description: error.message || "Не удалось сохранить архитектуру", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClone = async () => {
    if (!selectedVersionId) return;
    setIsSaving(true);
    try {
      await cloneArchitectureVersion(selectedVersionId);
      await refreshVersions();
      toast({ description: "Версия склонирована" });
    } catch (error) {
      toast({ description: error.message || "Ошибка при клонировании", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiff = async () => {
    if (!selectedVersionId || !diffTarget) return;
    try {
      const response = await diffArchitectureVersions(selectedVersionId, diffTarget);
      setDiff(response.diff);
    } catch (error) {
      toast({ description: error.message || "Ошибка сравнения версий", variant: "destructive" });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-700 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Версии
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2 max-h-72 overflow-auto">
            {versions.map((version) => (
              <button
                type="button"
                key={version.id}
                onClick={() => setSelectedVersionId(version.id)}
                className={`w-full text-left text-sm rounded-lg border px-3 py-2 ${
                  version.id === selectedVersionId ? "border-indigo-500 bg-indigo-50" : "border-slate-200 bg-white"
                }`}
              >
                <p className="font-semibold text-slate-800">{version.name}</p>
                <p className="text-xs text-slate-500">
                  {version.topology_preset} · {new Date(version.updated_at).toLocaleString()}
                </p>
              </button>
            ))}
            {!versions.length && <p className="text-sm text-slate-500">Нет версий — создайте архитектуру.</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Button onClick={handleAddService} variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить сервис
            </Button>
            <Button onClick={handleAddPolicy} variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Добавить политику
            </Button>
            <Button onClick={handleClone} size="sm" className="gap-2" disabled={!selectedVersionId || isSaving}>
              <RefreshCcw className={`w-4 h-4 ${isSaving ? "animate-spin" : ""}`} />
              Клонировать
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-slate-700">Редактор архитектуры</CardTitle>
              <div className="flex flex-wrap gap-2">
                {TOPOLOGY_OPTIONS.map((option) => (
                  <Badge
                    key={option.value}
                    variant={draft.topology_preset === option.value ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setDraft((prev) => ({ ...prev, topology_preset: option.value }))}
                  >
                    {option.label}
                  </Badge>
                ))}
              </div>
            </div>
            <Input
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Textarea
              value={draft.description || ""}
              onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Описание архитектуры"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50">
              <SecurityGraph data={graphData} selection={null} onSelect={() => {}} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Сервисы и сегменты</p>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {(draft.nodes || []).map((node) => (
                    <div key={node.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                      <span className="text-sm font-medium flex-1">{node.label || node.id}</span>
                      <select
                        className="border rounded-md text-sm px-2 py-1"
                        value={draft.placement?.[node.id] || ""}
                        onChange={(event) => handleServiceSegment(node.id, event.target.value)}
                      >
                        <option value="">—</option>
                        {(draft.segments || []).map((segment) => (
                          <option key={segment.id} value={segment.id}>
                            {segment.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2">Политики Zero Trust</p>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {(draft.policies || []).map((policy) => (
                    <div key={policy.id} className="border rounded-xl p-3">
                      <p className="text-sm font-semibold">{policy.id}</p>
                      <p className="text-xs text-slate-500">
                        {policy.from_segment || "*"} → {policy.to_segment || "*"} ({policy.allow === false ? "deny" : "allow"})
                      </p>
                      <p className="text-xs text-slate-500 mt-1">{policy.rationale}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Object.entries(policy.controls || {}).map(([key, value]) => (
                          <Badge key={key} variant="outline" className="text-[10px]">
                            {key}:{String(value)}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <Button variant="outline" onClick={handleDiff} disabled={!diffTarget}>
                Показать diff
              </Button>
              <Button onClick={handleSave} className="gap-2" disabled={isSaving}>
                <Save className="w-4 h-4" />
                Сохранить
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-500">Сравнить с версией:</span>
              <select
                value={diffTarget}
                onChange={(event) => setDiffTarget(event.target.value)}
                className="border rounded-md px-2 py-1 text-sm"
              >
                <option value="">—</option>
                {versions
                  .filter((version) => version.id !== selectedVersionId)
                  .map((version) => (
                    <option key={version.id} value={version.id}>
                      {version.name}
                    </option>
                  ))}
              </select>
            </div>
            {diff && (
              <div className="border rounded-xl p-3 space-y-2 bg-slate-50">
                <p className="text-sm font-semibold">Diff:</p>
                <p className="text-xs text-slate-600">Узлы +{diff.nodes_added.length} / -{diff.nodes_removed.length}</p>
                <p className="text-xs text-slate-600">Политики +{diff.policies_added.length} / -{diff.policies_removed.length}</p>
                {diff.topology_change && <p className="text-xs text-amber-600">Изменена топология</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
