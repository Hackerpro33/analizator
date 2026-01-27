import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Layers, 
  Database,
  Link as LinkIcon
} from "lucide-react";

export default function MultiDatasetSelector({ datasets, selectedDatasets = [], onDatasetsChange, onColumnsChange }) {
  const [datasetColumns, setDatasetColumns] = useState({});

  const handleDatasetToggle = (datasetId, checked) => {
    let newSelectedDatasets;
    
    if (checked) {
      newSelectedDatasets = [...selectedDatasets, datasetId];
    } else {
      newSelectedDatasets = selectedDatasets.filter(id => id !== datasetId);
      // Удаляем выбранные столбцы для этого набора данных
      const newDatasetColumns = { ...datasetColumns };
      delete newDatasetColumns[datasetId];
      setDatasetColumns(newDatasetColumns);
      onColumnsChange(newDatasetColumns);
    }
    
    onDatasetsChange(newSelectedDatasets);
  };

  const handleColumnChange = (datasetId, axis, columnName) => {
    const newDatasetColumns = {
      ...datasetColumns,
      [datasetId]: {
        ...datasetColumns[datasetId],
        [axis]: columnName
      }
    };
    setDatasetColumns(newDatasetColumns);
    onColumnsChange(newDatasetColumns);
  };

  const getAvailableColumns = (dataset, axis) => {
    if (!dataset || !dataset.columns) return [];
    
    // For X axis, allow all types except for scatter charts which need numbers
    if (axis === 'x_axis') {
      return dataset.columns;
    }
    
    // For Y axis, typically we want numeric columns
    return dataset.columns.filter(col => col.type === 'number');
  };

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <Layers className="w-5 h-5 text-violet-500" />
          Объединение наборов данных
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-sm text-slate-600 elegant-text">
          Выберите несколько наборов данных для создания сравнительных графиков и анализа корреляций.
        </div>

        <div className="space-y-4">
          {datasets.map(dataset => {
            const isSelected = selectedDatasets.includes(dataset.id);
            const columns = datasetColumns[dataset.id] || {};
            
            return (
              <div key={dataset.id} className="border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => handleDatasetToggle(dataset.id, checked)}
                    />
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-blue-500" />
                      <span className="font-medium">{dataset.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {dataset.columns?.length || 0} столбцов
                      </Badge>
                    </div>
                  </div>
                  {isSelected && (
                    <Badge className="bg-violet-100 text-violet-700">
                      <LinkIcon className="w-3 h-3 mr-1" />
                      Выбран
                    </Badge>
                  )}
                </div>

                {isSelected && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-violet-200">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-600">Ось X</Label>
                      <Select 
                        value={columns.x_axis || ''} 
                        onValueChange={(value) => handleColumnChange(dataset.id, 'x_axis', value)}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Выберите столбец X" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableColumns(dataset, 'x_axis').map(column => (
                            <SelectItem key={column.name} value={column.name}>
                              {column.name} ({column.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-600">Ось Y</Label>
                      <Select 
                        value={columns.y_axis || ''} 
                        onValueChange={(value) => handleColumnChange(dataset.id, 'y_axis', value)}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Выберите столбец Y" />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableColumns(dataset, 'y_axis').map(column => (
                            <SelectItem key={column.name} value={column.name}>
                              {column.name} ({column.type})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedDatasets.length > 0 && (
          <div className="p-4 bg-violet-50 rounded-lg border border-violet-200">
            <div className="text-sm font-medium text-violet-800 mb-2">
              Выбрано наборов данных: {selectedDatasets.length}
            </div>
            <div className="text-xs text-violet-700">
              Графики будут отображать данные из всех выбранных источников с возможностью сравнения и анализа взаимосвязей.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
