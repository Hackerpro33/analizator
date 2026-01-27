import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageContainer from "@/components/layout/PageContainer";
import FiltersBar from "@/components/cyber/FiltersBar.jsx";
import KpiOverview from "@/components/cyber/KpiOverview.jsx";
import AttackMapPanel from "@/components/cyber/AttackMapPanel.jsx";
import SecurityGraph from "@/components/cyber/SecurityGraph.jsx";
import TimelinePanel from "@/components/cyber/TimelinePanel.jsx";
import CyberDetailsDrawer from "@/components/cyber/CyberDetailsDrawer.jsx";
import ArchitectureWorkspace from "@/components/cyber/ArchitectureWorkspace.jsx";
import ScenarioWorkspace from "@/components/cyber/ScenarioWorkspace.jsx";
import HostProtectionPanel from "@/components/cyber/HostProtectionPanel.jsx";
import { CyberProvider, useCyberContext } from "@/contexts/CyberContext.jsx";
import { useCyberData } from "@/hooks/useCyberData.js";
import {
  fetchArchitectureVersions,
  fetchScenarios,
  runScenario,
} from "@/api/cybersecurity";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

function ObserveTab({
  summary,
  mapData,
  graphData,
  heatmapData,
  events,
  selection,
  setSelection,
  loading,
  onRefresh,
  onDrilldown,
}) {
  return (
    <div className="space-y-4">
      <KpiOverview summary={summary} loading={loading} onRefresh={onRefresh} />
      <div className="grid lg:grid-cols-2 gap-6">
        <AttackMapPanel
          mapData={mapData}
          heatmapData={heatmapData}
          selection={selection}
          onSelect={setSelection}
          onDrilldown={onDrilldown}
        />
        <SecurityGraph data={graphData} selection={selection} onSelect={setSelection} />
      </div>
      <TimelinePanel
        summary={summary}
        events={events}
        selection={selection}
        onSelect={setSelection}
        onRangeSelect={(range) => {
          if (!range) return;
          onDrilldown("time", range);
        }}
      />
    </div>
  );
}

function CyberSecurityContent() {
  const { filters, updateFilters, selection, setSelection } = useCyberContext();
  const { summary, events, map, graph, heatmap, loading, error, refresh } = useCyberData(filters);
  const [scenarios, setScenarios] = useState([]);
  const [architectures, setArchitectures] = useState([]);
  const [defaultArchitectureId, setDefaultArchitectureId] = useState("");
  const { toast } = useToast();

  const refreshScenarios = useCallback(async () => {
    try {
      const response = await fetchScenarios();
      setScenarios(response.items || []);
    } catch (err) {
      console.error("Failed to fetch scenarios", err); // eslint-disable-line no-console
    }
  }, []);

  const refreshArchitectures = useCallback(async () => {
    try {
      const response = await fetchArchitectureVersions();
      const items = response.items || [];
      setArchitectures(items);
      if (!defaultArchitectureId && items.length) {
        setDefaultArchitectureId(items[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch architectures", err); // eslint-disable-line no-console
    }
  }, [defaultArchitectureId]);

  useEffect(() => {
    refreshScenarios();
    refreshArchitectures();
  }, [refreshScenarios, refreshArchitectures]);

  const handleDrilldown = useCallback(
    (dimension, value) => {
      if (!value) return;
      updateFilters((prev) => {
        if (dimension === "segment") {
          return { ...prev, segments: prev.segments.includes(value) ? prev.segments : [...prev.segments, value] };
        }
        if (dimension === "phase") {
          return { ...prev, phases: prev.phases.includes(value) ? prev.phases : [...prev.phases, value] };
        }
        if (dimension === "severity") {
          return { ...prev, severity: prev.severity.includes(value) ? prev.severity : [...prev.severity, value] };
        }
        if (dimension === "time") {
          return {
            ...prev,
            timeRange: "custom",
            customRange: { from: value.from, to: value.to },
          };
        }
        return prev;
      });
    },
    [updateFilters],
  );

  const handleQuickRun = useCallback(
    async (scenarioId) => {
      if (!scenarioId) return;
      const targetArchitecture = architectures.find((item) => item.id === defaultArchitectureId) || architectures[0];
      if (!targetArchitecture) {
        toast({ description: "Нет доступной архитектуры для запуска", variant: "destructive" });
        return;
      }
      try {
        await runScenario(scenarioId, { architecture_version_id: targetArchitecture.id });
        toast({ description: "Сценарий выполнен" });
        refresh();
      } catch (err) {
        toast({ description: err.message || "Ошибка запуска сценария", variant: "destructive" });
      }
    },
    [architectures, defaultArchitectureId, refresh, toast],
  );

  return (
    <div className="space-y-6">
      <FiltersBar scenarios={scenarios} onRunScenario={handleQuickRun} />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="observe" className="space-y-4">
        <TabsList className="grid grid-cols-4">
          <TabsTrigger value="observe">Observe</TabsTrigger>
          <TabsTrigger value="architecture">Architecture</TabsTrigger>
          <TabsTrigger value="scenarios">Scenarios</TabsTrigger>
          <TabsTrigger value="host">Host Protection</TabsTrigger>
        </TabsList>
        <TabsContent value="observe">
          <ObserveTab
            summary={summary}
            mapData={map}
            graphData={graph}
            heatmapData={heatmap}
            events={events}
            selection={selection}
            setSelection={setSelection}
            loading={loading}
            onRefresh={refresh}
            onDrilldown={handleDrilldown}
          />
        </TabsContent>
        <TabsContent value="architecture">
          <ArchitectureWorkspace versions={architectures} refreshVersions={refreshArchitectures} />
        </TabsContent>
        <TabsContent value="scenarios">
          <ScenarioWorkspace
            scenarios={scenarios}
            refreshScenarios={refreshScenarios}
            architectureVersions={architectures}
            defaultArchitectureId={defaultArchitectureId}
            onRunComplete={refresh}
          />
        </TabsContent>
        <TabsContent value="host">
          <HostProtectionPanel />
        </TabsContent>
      </Tabs>
      <CyberDetailsDrawer selection={selection} onClose={() => setSelection(null)} onDrilldown={handleDrilldown} />
    </div>
  );
}

export default function CyberSecurity() {
  return (
    <CyberProvider>
      <PageContainer className="space-y-8">
        <CyberSecurityContent />
      </PageContainer>
    </CyberProvider>
  );
}
