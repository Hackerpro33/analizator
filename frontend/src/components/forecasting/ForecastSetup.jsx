
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, BrainCircuit, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox"; // Added Checkbox import

export default function ForecastSetup({ datasets, onGenerate, isLoading, isForecasting }) {
  const [config, setConfig] = useState({
    dataset_id: '',
    date_column: '',
    value_column: '',
    horizon: 30,
    external_factors: [],
    useSyntheticDates: false,
  });
  const [selectedDataset, setSelectedDataset] = useState(null);

  const handleDatasetChange = (datasetId) => {
    // Existing handleDatasetChange logic
    const dataset = datasets.find(d => d.id === datasetId);
    setSelectedDataset(dataset);
    setConfig(prev => ({
      ...prev,
      dataset_id: datasetId,
      date_column: '',
      value_column: '',
      useSyntheticDates: false,
    }));
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value,
      ...(field === 'date_column' ? { useSyntheticDates: false } : {}),
    }));
  };

  const handleSyntheticToggle = (checked) => {
    const isChecked = checked === true;
    setConfig(prev => ({
      ...prev,
      useSyntheticDates: isChecked,
    }));
  };

  const handleFactorToggle = (datasetId, columnName, datasetName) => {
    setConfig(prev => {
      const exists = prev.external_factors.some(
        (factor) => factor.dataset_id === datasetId && factor.column === columnName
      );

      return {
        ...prev,
        external_factors: exists
          ? prev.external_factors.filter(
              (factor) => !(factor.dataset_id === datasetId && factor.column === columnName)
            )
          : [
              ...prev.external_factors,
              {
                dataset_id: datasetId,
                dataset_name: datasetName,
                column: columnName
              }
            ]
      };
    });
  };

  return (
    <Card className="max-w-3xl mx-auto border-0 bg-white/70 backdrop-blur-xl shadow-2xl">
      <CardHeader className="border-b border-slate-200">
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <BrainCircuit className="w-5 h-5 text-orange-500" />
          Настройка прогнозирования
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-6">
        <div className="space-y-2">
          <Label htmlFor="fc-dataset" className="elegant-text">Основной набор данных</Label> {/* Changed label text */}
          <Select onValueChange={handleDatasetChange} value={config.dataset_id}>
            <SelectTrigger>
              <SelectValue placeholder="Выберите набор временных рядов" />
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
              <Label htmlFor="date-column" className="elegant-text">Столбец даты/времени</Label>
              <Select
                onValueChange={(value) => handleInputChange('date_column', value)}
                value={config.useSyntheticDates ? '' : config.date_column}
                disabled={config.useSyntheticDates}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец с датами" />
                </SelectTrigger>
                <SelectContent>
                  {selectedDataset.columns?.filter(c => c.type === 'date').map(col => (
                    <SelectItem key={col.name} value={col.name} className="elegant-text">
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(!selectedDataset.columns?.some(c => c.type === 'date')) && !config.useSyntheticDates && (
                <p className="text-sm text-slate-500">
                  В наборе данных не найдено столбцов с датой. Вы можете создать искусственный интервал времени ниже.
                </p>
              )}
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/70 p-3">
                <Checkbox
                  id="synthetic-dates"
                  checked={config.useSyntheticDates}
                  onCheckedChange={handleSyntheticToggle}
                />
                <div className="space-y-1">
                  <Label htmlFor="synthetic-dates" className="elegant-text text-sm">
                    Создать искусственный интервал времени
                  </Label>
                  <p className="text-xs text-slate-500">
                    Добавит последовательность дат по порядку, чтобы продолжить прогноз даже без реального столбца времени.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="value-column" className="elegant-text">Столбец значений для прогноза</Label>
              <Select onValueChange={(value) => handleInputChange('value_column', value)} value={config.value_column}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите столбец значений" />
                </SelectTrigger>
                <SelectContent>
                  {selectedDataset.columns?.filter(c => c.type === 'number').map(col => (
                    <SelectItem key={col.name} value={col.name} className="elegant-text">
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="space-y-2">
          <Label htmlFor="horizon" className="elegant-text">Горизонт прогнозирования (дни)</Label>
          <Input
            id="horizon"
            type="number"
            value={config.horizon}
            onChange={(e) => handleInputChange('horizon', parseInt(e.target.value))}
            className="elegant-text"
          />
        </div>

        {/* New External Factors section */}
        <div className="space-y-2">
            <Label className="elegant-text">Внешние факторы (из всех таблиц)</Label>
            <div className="space-y-3 p-3 border rounded-lg max-h-64 overflow-y-auto bg-slate-50/50">
              {datasets.map(dataset => {
                const numericColumns = dataset.columns?.filter(col => col.type === 'number') || [];

                if (numericColumns.length === 0) {
                  return null;
                }

                return (
                  <div key={dataset.id} className="space-y-2">
                    <div className="text-sm font-semibold text-slate-700">{dataset.name}</div>
                    <div className="space-y-1">
                      {numericColumns.map(col => {
                        const checkboxId = `${dataset.id}-${col.name}`;
                        const isChecked = config.external_factors.some(
                          factor => factor.dataset_id === dataset.id && factor.column === col.name
                        );

                        return (
                          <div key={checkboxId} className="flex items-center gap-2">
                            <Checkbox
                              id={checkboxId}
                              checked={isChecked}
                              onCheckedChange={() => handleFactorToggle(dataset.id, col.name, dataset.name)}
                            />
                            <Label htmlFor={checkboxId} className="elegant-text text-sm">
                              {col.name}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
        </div>

        <Button
          onClick={() => onGenerate(config)}
          disabled={
            isForecasting ||
            isLoading ||
            !config.dataset_id ||
            (!config.date_column && !config.useSyntheticDates) ||
            !config.value_column
          }
          className="w-full bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white gap-2 text-lg py-6 elegant-text"
        >
          {isForecasting ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" />
              Генерация прогноза...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" />
              Создать прогноз
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
