import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Visualization } from "@/api/entities";
import {
  ArrowLeft, Save, Eye, BarChart3, LineChart as LineChartIcon,
  ScatterChart as ScatterChartIcon, TrendingUp, Play, Box
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, ScatterChart, Scatter, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Chart3D from './Chart3D';

export default function ChartBuilder({ chartType, datasets, onClose, onSave, existingViz }) {
  const [config, setConfig] = useState({
    title: '',
    dataset_id: '',
    x_axis: '',
    y_axis: '',
    z_axis: '',
    color: '#3B82F6',
    filterConfig: {},
    crossDataset: false,
    x_dataset_id: '',
    y_dataset_id: '',
    z_dataset_id: ''
  });

  const [selectedDataset, setSelectedDataset] = useState(null);
  const [selectedXDataset, setSelectedXDataset] = useState(null);
  const [selectedYDataset, setSelectedYDataset] = useState(null);
  const [selectedZDataset, setSelectedZDataset] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  useEffect(() => {
    if (existingViz) {
      const crossDataset = existingViz.config?.crossDataset || false;
      setConfig({
        title: existingViz.title || '',
        dataset_id: existingViz.dataset_id || '',
        x_axis: existingViz.x_axis || '',
        y_axis: existingViz.y_axis || '',
        z_axis: existingViz.config?.z_axis || '',
        color: existingViz.config?.color || '#3B82F6',
        filterConfig: existingViz.config?.filterConfig || {},
        crossDataset: crossDataset,
        x_dataset_id: existingViz.config?.x_dataset_id || '',
        y_dataset_id: existingViz.config?.y_dataset_id || '',
        z_dataset_id: existingViz.config?.z_dataset_id || ''
      });
      
      if (!crossDataset && existingViz.dataset_id) {
        const dataset = datasets.find(d => d.id === existingViz.dataset_id);
        setSelectedDataset(dataset);
      } else if (crossDataset) {
        if (existingViz.config?.x_dataset_id) {
          const xDataset = datasets.find(d => d.id === existingViz.config.x_dataset_id);
          setSelectedXDataset(xDataset);
        }
        if (existingViz.config?.y_dataset_id) {
          const yDataset = datasets.find(d => d.id === existingViz.config.y_dataset_id);
          setSelectedYDataset(yDataset);
        }
        if (existingViz.config?.z_dataset_id) {
          const zDataset = datasets.find(d => d.id === existingViz.config.z_dataset_id);
          setSelectedZDataset(zDataset);
        }
      }
    }
  }, [existingViz, datasets]);

  const handleDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({ ...prev, dataset_id: datasetId, x_axis: '', y_axis: '', z_axis: '', filterConfig: {} }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleXDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedXDataset(dataset);
    setConfig(prev => ({ ...prev, x_dataset_id: datasetId, x_axis: '' }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleYDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedYDataset(dataset);
    setConfig(prev => ({ ...prev, y_dataset_id: datasetId, y_axis: '' }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleZDatasetChange = (datasetId) => {
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedZDataset(dataset);
    setConfig(prev => ({ ...prev, z_dataset_id: datasetId, z_axis: '' }));
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleCrossDatasetToggle = (checked) => {
    setConfig(prev => ({ 
      ...prev, 
      crossDataset: checked,
      dataset_id: '',
      x_dataset_id: '',
      y_dataset_id: '',
      z_dataset_id: '',
      x_axis: '',
      y_axis: '',
      z_axis: ''
    }));
    setSelectedDataset(null);
    setSelectedXDataset(null);
    setSelectedYDataset(null);
    setSelectedZDataset(null);
    setShowPreview(false);
    setPreviewData(null);
  };

  const handleGeneratePreview = () => {
    if (config.crossDataset) {
      // Логика для кросс-датасет графика
      if (!config.x_dataset_id || !config.y_dataset_id || !config.x_axis || !config.y_axis) {
        alert('Пожалуйста, выберите наборы данных и столбцы для осей X и Y');
        return;
      }

      const xDataset = datasets.find(d => d.id === config.x_dataset_id);
      const yDataset = datasets.find(d => d.id === config.y_dataset_id);
      let zDataset = null;
      
      if (chartType === '3d' && config.z_dataset_id && config.z_axis) {
        zDataset = datasets.find(d => d.id === config.z_dataset_id);
      }

      // Создаем объединенные данные
      const combinedData = [];
      const maxLength = Math.min(
        xDataset?.sample_data?.length || 0,
        yDataset?.sample_data?.length || 0,
        zDataset?.sample_data?.length || 10
      );

      for (let i = 0; i < Math.max(5, maxLength); i++) {
        const dataPoint = {};
        
        // X данные
        if (xDataset?.sample_data?.[i]) {
          dataPoint[config.x_axis] = xDataset.sample_data[i][config.x_axis];
        } else {
          dataPoint[config.x_axis] = `Point ${i + 1}`;
        }
        
        // Y данные
        if (yDataset?.sample_data?.[i]) {
          dataPoint[config.y_axis] = yDataset.sample_data[i][config.y_axis];
        } else {
          dataPoint[config.y_axis] = Math.floor(Math.random() * 100) + 10;
        }
        
        // Z данные (если 3D)
        if (chartType === '3d' && zDataset && config.z_axis) {
          if (zDataset?.sample_data?.[i]) {
            dataPoint[config.z_axis] = zDataset.sample_data[i][config.z_axis];
          } else {
            dataPoint[config.z_axis] = Math.floor(Math.random() * 75) + 15;
          }
        }
        
        combinedData.push(dataPoint);
      }
      
      setPreviewData(combinedData);
    } else {
      // Логика для обычного графика (один датасет)
      if (!selectedDataset || !config.x_axis || !config.y_axis) {
        alert('Пожалуйста, выберите набор данных и столбцы для осей X и Y');
        return;
      }
      
      let sampleData = selectedDataset.sample_data || [];
      
      if (sampleData.length === 0) {
        const mockData = [];
        for (let i = 0; i < 10; i++) {
          const dataPoint = {};
          
          const xColumn = selectedDataset.columns?.find(c => c.name === config.x_axis);
          const yColumn = selectedDataset.columns?.find(c => c.name === config.y_axis);
          
          if (xColumn?.type === 'date') {
            const date = new Date(2024, 0, i + 1);
            dataPoint[config.x_axis] = date.toISOString().split('T')[0];
          } else if (xColumn?.type === 'number') {
            dataPoint[config.x_axis] = i + 1;
          } else {
            dataPoint[config.x_axis] = `Категория ${i + 1}`;
          }
          
          if (yColumn?.type === 'number') {
            dataPoint[config.y_axis] = Math.floor(Math.random() * 100) + 10;
          } else {
            dataPoint[config.y_axis] = Math.floor(Math.random() * 50) + 5;
          }
          
          if (chartType === '3d' && config.z_axis) {
            const zColumn = selectedDataset.columns?.find(c => c.name === config.z_axis);
            if (zColumn?.type === 'number') {
              dataPoint[config.z_axis] = Math.floor(Math.random() * 75) + 15;
            }
          }
          
          mockData.push(dataPoint);
        }
        sampleData = mockData;
      }
      
      setPreviewData(sampleData);
    }
    setShowPreview(true);
  };

  const handleSave = async () => {
    if (!config.title) {
      alert('Пожалуйста, введите название графика');
      return;
    }

    let datasetId, xAxis, yAxis;
    
    if (config.crossDataset) {
      if (!config.x_dataset_id || !config.y_dataset_id || !config.x_axis || !config.y_axis) {
        alert('Пожалуйста, заполните все обязательные поля для кросс-датасет графика');
        return;
      }
      datasetId = config.x_dataset_id; // Основной датасет для хранения
      xAxis = config.x_axis;
      yAxis = config.y_axis;
    } else {
      if (!config.dataset_id || !config.x_axis || !config.y_axis) {
        alert('Пожалуйста, заполните все обязательные поля');
        return;
      }
      datasetId = config.dataset_id;
      xAxis = config.x_axis;
      yAxis = config.y_axis;
    }

    const vizData = {
        title: config.title,
        type: chartType,
        dataset_id: datasetId,
        x_axis: xAxis,
        y_axis: yAxis,
        config: {
          color: config.color,
          filterConfig: config.filterConfig,
          z_axis: config.z_axis,
          crossDataset: config.crossDataset,
          x_dataset_id: config.x_dataset_id,
          y_dataset_id: config.y_dataset_id,
          z_dataset_id: config.z_dataset_id
        }
    };
    
    try {
        if (existingViz) {
            await Visualization.update(existingViz.id, vizData);
        } else {
            await Visualization.create(vizData);
        }
        onSave();
        onClose();
    } catch (error) {
        console.error('Error saving visualization:', error);
        alert('Ошибка при сохранении визуализации: ' + error.message);
    }
  };

  const getChartIcon = () => {
    const icons = {
      line: LineChartIcon, bar: BarChart3, scatter: ScatterChartIcon,
      area: TrendingUp, '3d': Box
    };
    return icons[chartType] || BarChart3;
  };

  const ChartIcon = getChartIcon();
  
  const renderChart = () => {
    if (!previewData || previewData.length === 0) return (
      <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
        <h4 className="font-bold text-slate-700 mb-2">Нет данных для предпросмотра</h4>
        <p className="text-sm">Пожалуйста, проверьте выбранные столбцы или фильтры.</p>
      </div>
    );
    
    if (chartType === '3d') {
        return <Chart3D data={previewData} config={config} />;
    }

    const chartProps = { data: previewData, margin: { top: 5, right: 30, left: 20, bottom: 5 } };
    const xAxisType = chartType === 'scatter' ? 'number' : 'category';
    const yAxisType = 'number';

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config.x_axis} tick={{ fontSize: 12 }} type={xAxisType} />
            <YAxis tick={{ fontSize: 12 }} type={yAxisType} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={config.y_axis} name={config.y_axis} stroke={config.color} strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config.x_axis} tick={{ fontSize: 12 }} type={xAxisType} />
            <YAxis tick={{ fontSize: 12 }} type={yAxisType} />
            <Tooltip />
            <Legend />
            <Bar dataKey={config.y_axis} name={config.y_axis} fill={config.color} />
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart {...chartProps}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={config.x_axis} tick={{ fontSize: 12 }} type={xAxisType} />
            <YAxis tick={{ fontSize: 12 }} type={yAxisType} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey={config.y_axis} name={config.y_axis} stroke={config.color} fill={config.color} fillOpacity={0.3} />
          </AreaChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...chartProps}>
            <CartesianGrid />
            <XAxis type="number" dataKey={config.x_axis} name={config.x_axis} tick={{ fontSize: 12 }} />
            <YAxis type="number" dataKey={config.y_axis} name={config.y_axis} tick={{ fontSize: 12 }} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Legend />
            <Scatter name="Данные" data={previewData} fill={config.color} />
          </ScatterChart>
        );
      default:
        return <div>Неподдерживаемый тип графика</div>;
    }
  };

  // Определение доступных столбцов в зависимости от режима
  const getXAxisColumns = () => {
    if (config.crossDataset) {
      return selectedXDataset?.columns || [];
    }
    return selectedDataset ? (chartType === 'scatter' ? selectedDataset.columns?.filter(col => col.type === 'number') || [] : selectedDataset.columns || []) : [];
  };

  const getYAxisColumns = () => {
    if (config.crossDataset) {
      return selectedYDataset?.columns?.filter(col => col.type === 'number') || [];
    }
    return selectedDataset ? selectedDataset.columns?.filter(col => col.type === 'number') || [] : [];
  };

  const getZAxisColumns = () => {
    if (config.crossDataset) {
      return selectedZDataset?.columns || [];
    }
    return selectedDataset ? selectedDataset.columns || [] : [];
  };

  const canBuildChart = config.crossDataset ? 
    (config.x_dataset_id && config.y_dataset_id && config.x_axis && config.y_axis) :
    (config.dataset_id && config.x_axis && config.y_axis);

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      {/* Configuration Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={onClose}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-2">
                <ChartIcon className="w-5 h-5 text-blue-500" />
                <CardTitle className="text-slate-900">
                  Конструктор: {chartType.charAt(0).toUpperCase() + chartType.slice(1)}
                </CardTitle>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="space-y-2">
            <Label htmlFor="title">Название графика</Label>
            <Input id="title" placeholder="Введите название графика" value={config.title} onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))} />
          </div>

          {/* Cross-dataset checkbox */}
          <div className="flex items-center space-x-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <Checkbox
              id="crossDataset"
              checked={config.crossDataset}
              onCheckedChange={handleCrossDatasetToggle}
            />
            <Label htmlFor="crossDataset" className="text-sm font-medium text-blue-900">
              Использовать данные из разных наборов данных
            </Label>
          </div>

          {config.crossDataset ? (
            // Cross-dataset mode
            <>
              <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
                <h4 className="font-medium text-slate-700">Настройка осей из разных наборов данных</h4>
                
                <div className="space-y-2">
                  <Label>Набор данных для оси X</Label>
                  <Select onValueChange={handleXDatasetChange} value={config.x_dataset_id}>
                    <SelectTrigger><SelectValue placeholder="Выберите набор данных для X" /></SelectTrigger>
                    <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>

                {selectedXDataset && (
                  <div className="space-y-2">
                    <Label>Столбец для оси X</Label>
                    <Select onValueChange={(value) => setConfig(prev => ({ ...prev, x_axis: value }))} value={config.x_axis}>
                      <SelectTrigger><SelectValue placeholder="Выберите столбец для оси X" /></SelectTrigger>
                      <SelectContent>{getXAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Набор данных для оси Y</Label>
                  <Select onValueChange={handleYDatasetChange} value={config.y_dataset_id}>
                    <SelectTrigger><SelectValue placeholder="Выберите набор данных для Y" /></SelectTrigger>
                    <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                  </Select>
                </div>

                {selectedYDataset && (
                  <div className="space-y-2">
                    <Label>Столбец для оси Y</Label>
                    <Select onValueChange={(value) => setConfig(prev => ({ ...prev, y_axis: value }))} value={config.y_axis}>
                      <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Y" /></SelectTrigger>
                      <SelectContent>{getYAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                )}

                {chartType === '3d' && (
                  <>
                    <div className="space-y-2">
                      <Label>Набор данных для оси Z</Label>
                      <Select onValueChange={handleZDatasetChange} value={config.z_dataset_id}>
                        <SelectTrigger><SelectValue placeholder="Выберите набор данных для Z" /></SelectTrigger>
                        <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>

                    {selectedZDataset && (
                      <div className="space-y-2">
                        <Label>Столбец для оси Z</Label>
                        <Select onValueChange={(value) => setConfig(prev => ({ ...prev, z_axis: value }))} value={config.z_axis}>
                          <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Z" /></SelectTrigger>
                          <SelectContent>{getZAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            // Single dataset mode
            <>
              <div className="space-y-2">
                <Label htmlFor="dataset">Набор данных</Label>
                <Select onValueChange={handleDatasetChange} value={config.dataset_id}>
                  <SelectTrigger><SelectValue placeholder="Выберите набор данных" /></SelectTrigger>
                  <SelectContent>{datasets.map(dataset => (<SelectItem key={dataset.id} value={dataset.id}>{dataset.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>

              {selectedDataset && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="x-axis">Ось X</Label>
                    <Select onValueChange={(value) => setConfig(prev => ({ ...prev, x_axis: value }))} value={config.x_axis}>
                      <SelectTrigger><SelectValue placeholder="Выберите столбец для оси X" /></SelectTrigger>
                      <SelectContent>{getXAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="y-axis">Ось Y</Label>
                    <Select onValueChange={(value) => setConfig(prev => ({ ...prev, y_axis: value }))} value={config.y_axis}>
                      <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Y" /></SelectTrigger>
                      <SelectContent>{getYAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                    </Select>
                  </div>
                  {chartType === '3d' && (
                    <div className="space-y-2">
                      <Label htmlFor="z-axis">Ось Z</Label>
                      <Select onValueChange={(value) => setConfig(prev => ({ ...prev, z_axis: value }))} value={config.z_axis}>
                        <SelectTrigger><SelectValue placeholder="Выберите столбец для оси Z" /></SelectTrigger>
                        <SelectContent>{getZAxisColumns().map(column => (<SelectItem key={column.name} value={column.name}>{column.name} ({column.type})</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="color">Цвет графика</Label>
            <div className="flex gap-2">
              <Input id="color" type="color" value={config.color} onChange={(e) => setConfig(prev => ({ ...prev, color: e.target.value }))} className="w-16 h-10 p-1" />
              <Input value={config.color} onChange={(e) => setConfig(prev => ({ ...prev, color: e.target.value }))} className="flex-1" />
            </div>
          </div>
          
          <div className="pt-4 border-t border-slate-200">
            <Button onClick={handleGeneratePreview} disabled={!canBuildChart} className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 gap-2 text-white">
              <Play className="w-4 h-4" />Построить график
            </Button>
          </div>
          
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Отмена</Button>
            <Button onClick={handleSave} disabled={!showPreview} className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 gap-2">
              <Save className="w-4 h-4" />{existingViz ? 'Обновить' : 'Сохранить'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader className="border-b border-slate-200">
          <CardTitle className="flex items-center gap-2 text-slate-900"><Eye className="w-5 h-5 text-purple-500" />Предпросмотр графика</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="text-center"><h3 className="text-xl font-bold text-slate-900 h-7">{config.title || "Название графика"}</h3></div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                {showPreview && previewData ? (
                  renderChart()
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-4">
                    <BarChart3 className="w-16 h-16 opacity-30 mb-4" />
                    <h4 className="font-bold text-slate-700 mb-2">Предпросмотр графика</h4>
                    <p className="text-sm mb-2">Заполните все поля и нажмите &quot;Построить график&quot;</p>
                    {canBuildChart && (<p className="text-xs text-emerald-600">✓ Все поля заполнены, можно построить график</p>)}
                  </div>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
