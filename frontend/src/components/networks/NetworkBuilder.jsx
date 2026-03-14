
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Network, Save, ArrowLeft, Sparkles } from "lucide-react";
import NetworkVisualization from "./NetworkVisualization";
import { buildNetworkGraph } from "@/utils/localAnalysis";
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";

export default function NetworkBuilder({ datasets, onSave, onCancel }) {
  const [config, setConfig] = useState({
    title: '',
    dataset_id: '',
    selectedColumns: [],
    nodeSize: 'medium',
    layout: 'force',
    showLabels: true,
    graphType: 'general' // New: general, social, geo
  });
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [generatedGraph, setGeneratedGraph] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const nodeMetricRows = useMemo(() => {
    if (!generatedGraph?.node_metrics?.length) {
      return [];
    }

    return [...generatedGraph.node_metrics]
      .sort((a, b) => b.degree - a.degree || b.strength - a.strength)
      .slice(0, 6);
  }, [generatedGraph]);

  const adjacencyPreview = useMemo(() => {
    if (!generatedGraph?.adjacency_matrix?.length) {
      return [];
    }

    return generatedGraph.adjacency_matrix.slice(0, 5).map((row) => ({
      ...row,
      connections: row.connections.slice(0, 5),
    }));
  }, [generatedGraph]);

  const adjacencyHeaders = useMemo(() => {
    return adjacencyPreview[0]?.connections?.map((conn) => conn.node) ?? [];
  }, [adjacencyPreview]);

  const handleDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({ 
      ...prev, 
      dataset_id: datasetId, 
      selectedColumns: [] 
    }));
  };

  const handleColumnToggle = (columnName) => {
    setConfig(prev => ({
      ...prev,
      selectedColumns: prev.selectedColumns.includes(columnName)
        ? prev.selectedColumns.filter(c => c !== columnName)
        : [...prev.selectedColumns, columnName]
    }));
  };

  const handleGenerateGraph = async () => {
    if (!config.dataset_id || config.selectedColumns.length < 2) {
      alert("Выберите набор данных и минимум 2 столбца.");
      return;
    }
    setIsGenerating(true);
    setGeneratedGraph(null);

    const columnMetadata = selectedDataset?.columns || [];
    const previewRows = selectedDataset?.sample_data?.slice(0, 50) || [];

    try {
        const result = buildNetworkGraph({
            datasetName: selectedDataset?.name || "",
            columns: columnMetadata,
            rows: previewRows,
            graphType: config.graphType,
        });
        setGeneratedGraph(result);
    } catch(e) {
        console.error("Ошибка генерации графа", e);
        alert("Ошибка при генерации графа локальными методами. Пожалуйста, проверьте данные.");
    }
    setIsGenerating(false);
  };

  const handleSave = () => {
    if (!config.title || !config.dataset_id) {
      alert("Пожалуйста, заполните название и выберите набор данных");
      return;
    }
    // Передаем и сгенерированные данные для сохранения
    onSave({ ...config, graphData: generatedGraph });
  };

  const numericColumns = selectedDataset?.columns?.filter(c => c.type === 'number') || [];

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Configuration Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
              <Network className="w-5 h-5 text-cyan-500" />
              Настройка графа связей
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="title" className="elegant-text">Название графа</Label>
            <Input
              id="title"
              placeholder="Например: Корреляции продаж"
              value={config.title}
              maxLength={MAX_NAME_LENGTH}
              onChange={(e) => setConfig(prev => ({ ...prev, title: clampName(e.target.value) }))}
              className="elegant-text"
            />
          </div>

          <div className="space-y-2">
            <Label className="elegant-text">Набор данных</Label>
            <Select onValueChange={handleDatasetChange}>
              <SelectTrigger className="elegant-text">
                <SelectValue placeholder="Выберите набор данных" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map(dataset => (
                  <SelectItem key={dataset.id} value={dataset.id} className="elegant-text">
                    {dataset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedDataset && (
            <>
              <div className="space-y-2">
                <Label className="elegant-text">Тип графа</Label>
                <Select
                  value={config.graphType}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, graphType: value }))}
                >
                  <SelectTrigger className="elegant-text">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general" className="elegant-text">Общий анализ связей</SelectItem>
                    <SelectItem value="social" className="elegant-text">Социальный граф</SelectItem>
                    <SelectItem value="geo" className="elegant-text">Географические корреляции</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="elegant-text">Числовые столбцы для анализа связей</Label>
                <div className="space-y-2 p-3 border rounded-lg max-h-48 overflow-y-auto bg-slate-50/50">
                  {numericColumns.map(column => (
                    <div key={column.name} className="flex items-center gap-2">
                      <Checkbox
                        id={column.name}
                        checked={config.selectedColumns.includes(column.name)}
                        onCheckedChange={() => handleColumnToggle(column.name)}
                      />
                      <Label htmlFor={column.name} className="elegant-text">{column.name}</Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 elegant-text">
                  Выберите минимум 2 числовых столбца для анализа взаимосвязей
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="elegant-text">Размер узлов</Label>
                  <Select 
                    value={config.nodeSize} 
                    onValueChange={(value) => setConfig(prev => ({ ...prev, nodeSize: value }))}
                  >
                    <SelectTrigger className="elegant-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small" className="elegant-text">Маленький</SelectItem>
                      <SelectItem value="medium" className="elegant-text">Средний</SelectItem>
                      <SelectItem value="large" className="elegant-text">Большой</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="elegant-text">Тип расположения</Label>
                  <Select 
                    value={config.layout} 
                    onValueChange={(value) => setConfig(prev => ({ ...prev, layout: value }))}
                  >
                    <SelectTrigger className="elegant-text">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="force" className="elegant-text">Силовой</SelectItem>
                      <SelectItem value="circle" className="elegant-text">Круговой</SelectItem>
                      <SelectItem value="grid" className="elegant-text">Сеточный</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="showLabels"
                  checked={config.showLabels}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, showLabels: checked }))}
                />
                <Label htmlFor="showLabels" className="elegant-text">Показать подписи узлов</Label>
              </div>
            </>
          )}
          
          <Button 
            onClick={handleGenerateGraph} 
            disabled={isGenerating || !selectedDataset || config.selectedColumns.length < 2} 
            className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 gap-2 elegant-text"
          >
            {isGenerating ? (
                <>
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    Генерация...
                </>
            ) : (
                <>
                    <Sparkles className="w-4 h-4" />
                    Сгенерировать граф
                </>
            )}
          </Button>

          <div className="flex gap-3 pt-6">
            <Button variant="outline" onClick={onCancel} className="flex-1 elegant-text">
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={!generatedGraph || !config.title} className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 gap-2 elegant-text">
              <Save className="w-4 h-4" />
              Сохранить граф
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Предварительный просмотр
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          {generatedGraph ? (
            <NetworkVisualization
              config={config}
              graphData={generatedGraph}
              dataset={selectedDataset}
            />
          ) : isGenerating ? (
            <div className="h-96 flex items-center justify-center text-slate-500 elegant-text">
                <div className="text-center">
                    <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-50 animate-bounce" />
                    <p>Генерация графа, пожалуйста подождите...</p>
                </div>
            </div>
          ) : (
            <div className="h-96 flex items-center justify-center text-slate-500 elegant-text">
              <div className="text-center">
                <Network className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Выберите данные и сгенерируйте граф</p>
              </div>
            </div>
          )}

          {generatedGraph && (
            <div className="mt-8 space-y-8">
              {generatedGraph.metrics && (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 heading-text">Глобальные показатели графа</h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Плотность</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {(generatedGraph.metrics.density ?? 0).toFixed(2)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Отражает насыщенность связями. Значение ближе к 1 — плотная сеть.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Средняя степень</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {(generatedGraph.metrics.average_degree ?? 0).toFixed(1)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Среднее количество связей на узел.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Компоненты</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {generatedGraph.metrics.community_count ?? 0}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Количество компонент связности в сети.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Ключевые узлы</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(generatedGraph.metrics.hubs ?? []).length ? (
                          generatedGraph.metrics.hubs.map((hub) => (
                            <Badge key={hub} variant="secondary" className="bg-slate-100 text-slate-700">
                              {hub}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-slate-500">Не выявлены</span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        Узлы с наибольшей степенью связей.
                      </p>
                    </div>
                  </div>
                </section>
              )}

              {generatedGraph.insights?.length ? (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 heading-text">Инсайты анализа</h3>
                  <ul className="space-y-2 text-sm text-slate-600 list-disc list-inside">
                    {generatedGraph.insights.map((insight, index) => (
                      <li key={index}>{insight}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {nodeMetricRows.length ? (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 heading-text">Метрики узлов</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Узел</TableHead>
                        <TableHead>Степень</TableHead>
                        <TableHead>Центральность</TableHead>
                        <TableHead>Сумма весов</TableHead>
                        <TableHead>Кластеризация</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {nodeMetricRows.map((metric) => (
                        <TableRow key={metric.node}>
                          <TableCell className="font-medium text-slate-900">{metric.node}</TableCell>
                          <TableCell>{metric.degree}</TableCell>
                          <TableCell>{metric.degree_centrality.toFixed(2)}</TableCell>
                          <TableCell>{metric.strength.toFixed(2)}</TableCell>
                          <TableCell>{metric.clustering.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              ) : null}

              {generatedGraph.communities?.length ? (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 heading-text">Компоненты связности</h3>
                  <div className="flex flex-wrap gap-3">
                    {generatedGraph.communities.map((community, index) => (
                      <div
                        key={`${community.nodes.join('-')}-${index}`}
                        className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm"
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">Компонента {index + 1}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          Узлов: {community.size}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-600">
                          {community.nodes.map((node) => (
                            <span
                              key={node}
                              className="rounded-full border border-slate-200 bg-white px-2 py-1"
                            >
                              {node}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {adjacencyPreview.length ? (
                <section className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-900 heading-text">Матрица смежности (фрагмент)</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Узел</TableHead>
                        {adjacencyHeaders.map((header) => (
                          <TableHead key={header}>{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {adjacencyPreview.map((row) => (
                        <TableRow key={row.node}>
                          <TableCell className="font-medium text-slate-900">{row.node}</TableCell>
                          {row.connections.map((connection) => (
                            <TableCell
                              key={`${row.node}-${connection.node}`}
                              className={
                                connection.weight > 0
                                  ? "text-emerald-600 font-medium"
                                  : "text-slate-400"
                              }
                            >
                              {connection.weight.toFixed(2)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-slate-500">
                    Показаны первые узлы и их связи по абсолютным значениям корреляций.
                  </p>
                </section>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
