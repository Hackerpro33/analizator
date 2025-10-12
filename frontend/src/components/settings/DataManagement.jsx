import React, { useState, useEffect } from 'react';
import { Dataset, Visualization, getDatasets, getVisualizations } from "@/api/entities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, HardDrive, Database, BarChart3 } from "lucide-react";

export default function DataManagement() {
  const [datasets, setDatasets] = useState([]);
  const [visualizations, setVisualizations] = useState([]);
  const [selectedDatasets, setSelectedDatasets] = useState([]);
  const [selectedVisualizations, setSelectedVisualizations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [datasetsData, visualizationsData] = await Promise.all([
        getDatasets(),
        getVisualizations()
      ]);
      setDatasets(Array.isArray(datasetsData) ? datasetsData : []);
      setVisualizations(Array.isArray(visualizationsData) ? visualizationsData : []);
    } catch (error) {
      console.error('Ошибка загрузки данных:', error);
    }
    setIsLoading(false);
  };

  const handleDatasetSelection = (datasetId, checked) => {
    setSelectedDatasets(prev =>
      checked
        ? [...prev, datasetId]
        : prev.filter(id => id !== datasetId)
    );
  };

  const handleVisualizationSelection = (vizId, checked) => {
    setSelectedVisualizations(prev =>
      checked
        ? [...prev, vizId]
        : prev.filter(id => id !== vizId)
    );
  };

  const handleSelectAllDatasets = () => {
    if (selectedDatasets.length === datasets.length) {
      setSelectedDatasets([]);
    } else {
      setSelectedDatasets(datasets.map(d => d.id));
    }
  };

  const handleSelectAllVisualizations = () => {
    if (selectedVisualizations.length === visualizations.length) {
      setSelectedVisualizations([]);
    } else {
      setSelectedVisualizations(visualizations.map(v => v.id));
    }
  };

  const calculateStorageUsage = () => {
    const datasetStorage = datasets.length * 2.5; // ~2.5MB на набор данных
    const visualizationStorage = visualizations.length * 0.1; // ~100KB на визуализацию
    return (datasetStorage + visualizationStorage).toFixed(1);
  };

  const handleDeleteSelected = async () => {
    setIsDeleting(true);
    try {
      await Promise.all([
        ...selectedDatasets.map(id => Dataset.delete(id).catch(err => { throw new Error(`Не удалось удалить набор: ${err.message || err}`); })),
        ...selectedVisualizations.map(id => Visualization.delete(id).catch(err => { throw new Error(`Не удалось удалить визуализацию: ${err.message || err}`); })),
      ]);

      setDatasets(prev => prev.filter(d => !selectedDatasets.includes(d.id)));
      setVisualizations(prev => prev.filter(v => !selectedVisualizations.includes(v.id)));

      setSelectedDatasets([]);
      setSelectedVisualizations([]);
    } catch (error) {
      console.error('Ошибка при удалении:', error);
      alert('Произошла ошибка при удалении данных. Пожалуйста, попробуйте еще раз.');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Storage Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-blue-500" />
            Обзор хранилища
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-600">{datasets.length}</div>
              <div className="text-sm text-slate-600">Наборов данных</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{visualizations.length}</div>
              <div className="text-sm text-slate-600">Визуализаций</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">~{calculateStorageUsage()} MB</div>
              <div className="text-sm text-slate-600">Используется места</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Sets Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-500" />
              Управление наборами данных
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAllDatasets}>
                {selectedDatasets.length === datasets.length ? 'Снять выбор' : 'Выбрать все'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {datasets.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Нет доступных наборов данных.</p>
            ) : (
              datasets.map(dataset => (
                <div key={dataset.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedDatasets.includes(dataset.id)}
                      onCheckedChange={(checked) => handleDatasetSelection(dataset.id, checked)}
                    />
                    <div>
                      <div className="font-medium">{dataset.name}</div>
                      <div className="text-sm text-slate-500">
                        {dataset.row_count || 0} строк • {dataset.columns?.length || 0} столбцов
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {dataset.created_date ? new Date(dataset.created_date).toLocaleDateString() : "—"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Visualizations Management */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-500" />
              Управление визуализациями
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleSelectAllVisualizations}>
                {selectedVisualizations.length === visualizations.length ? 'Снять выбор' : 'Выбрать все'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {visualizations.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">Нет доступных визуализаций.</p>
            ) : (
              visualizations.map(viz => (
                <div key={viz.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedVisualizations.includes(viz.id)}
                      onCheckedChange={(checked) => handleVisualizationSelection(viz.id, checked)}
                    />
                    <div>
                      <div className="font-medium">{viz.title}</div>
                      <div className="text-sm text-slate-500">
                        Тип: {viz.type} • Оси: {viz.x_axis} × {viz.y_axis}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">
                      {viz.type}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {viz.created_date ? new Date(viz.created_date).toLocaleDateString() : "—"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Опасная зона */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Опасная зона
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-red-50 border border-red-200 rounded-lg">
            <div>
              <h4 className="font-semibold text-red-800">Удалить выбранные элементы</h4>
              <p className="text-sm text-red-700">Это действие необратимо. Будут удалены {selectedDatasets.length} наборов данных и {selectedVisualizations.length} визуализаций.</p>
            </div>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={selectedDatasets.length === 0 && selectedVisualizations.length === 0}
            >
              Удалить выбранные
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="max-w-md w-full mx-4">
            <CardHeader>
              <CardTitle>Подтвердите удаление</CardTitle>
            </CardHeader>
            <CardContent>
              <p>
                Вы уверены, что хотите удалить&nbsp;
                {selectedDatasets.length > 0 && `${selectedDatasets.length} наборов данных`}
                {selectedDatasets.length > 0 && selectedVisualizations.length > 0 && " и "}
                {selectedVisualizations.length > 0 && `${selectedVisualizations.length} визуализаций`}
                ? Это действие нельзя будет отменить.
              </p>
            </CardContent>
            <CardContent className="flex justify-end gap-4">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={isDeleting}>
                Отмена
              </Button>
              <Button variant="destructive" onClick={handleDeleteSelected} disabled={isDeleting}>
                {isDeleting ? 'Удаление...' : 'Подтвердить и удалить'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

