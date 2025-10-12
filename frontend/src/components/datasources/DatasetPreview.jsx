
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { suggestDataApplications } from "@/utils/localAnalysis";
import { 
  Database, 
  X, 
  Download, 
  BarChart3,
  Calendar,
  Hash,
  Type,
  CheckCircle,
  Sparkles
} from "lucide-react";
import { format } from "date-fns";
import { analyzeDataset } from "@/utils/localAnalysis";

export default function DatasetPreview({ dataset, onClose }) {
  const [sampleData, setSampleData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);

  useEffect(() => {
    // Используем реальные данные из датасета или оставляем пустым, если их нет
    if (dataset.sample_data && Array.isArray(dataset.sample_data) && dataset.sample_data.length > 0) {
      setSampleData(dataset.sample_data);
    } else {
      setSampleData([]); // Не генерируем ложные данные, просто показываем пустую таблицу
    }
    setIsLoading(false);

    try {
      const suggestion = suggestDataApplications({ dataset });
      setAiSuggestions(suggestion);
    } catch (error) {
      console.warn("Не удалось сформировать локальные рекомендации по использованию данных", error);
      setAiSuggestions(null);
    }
  }, [dataset]);

  useEffect(() => {
    setAiSummary(analyzeDataset(dataset));
  }, [dataset]);

  const createdDate = useMemo(() => {
    if (dataset.created_date) {
      const parsed = new Date(dataset.created_date);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (dataset.created_at) {
      const parsed = new Date(dataset.created_at * 1000);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }, [dataset]);

  const createdLabel = createdDate ? format(createdDate, "d MMM") : "—";

  const getColumnIcon = (type) => {
    const icons = {
      string: Type,
      number: Hash,
      date: Calendar,
      boolean: CheckCircle
    };
    return icons[type] || Type;
  };

  const getColumnColor = (type) => {
    const colors = {
      string: "text-blue-600 bg-blue-50",
      number: "text-emerald-600 bg-emerald-50",
      date: "text-purple-600 bg-purple-50",
      boolean: "text-orange-600 bg-orange-50"
    };
    return colors[type] || "text-gray-600 bg-gray-50";
  };

  const formatCellValue = (value, columnType) => {
    if (value === null || value === undefined) return '';
    
    if (columnType === 'date' && value) {
      try {
        return new Date(value).toLocaleDateString();
      } catch (e) {
        return String(value);
      }
    }
    
    if (columnType === 'number' && typeof value === 'number') {
      return value.toLocaleString();
    }
    
    if (columnType === 'boolean') {
      return value ? 'Да' : 'Нет';
    }
    
    return String(value);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[80vh] bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
        <DialogHeader className="border-b border-slate-200 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                <Database className="w-5 h-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold text-slate-900">
                  {dataset.name}
                </DialogTitle>
                <DialogDescription className="text-slate-600">
                  {dataset.description}
                </DialogDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-6">
          {/* Dataset Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-100">
              <div className="text-2xl font-bold text-blue-600">{dataset.row_count || 0}</div>
              <div className="text-sm text-blue-700">Всего строк</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100">
              <div className="text-2xl font-bold text-emerald-600">{dataset.columns?.length || 0}</div>
              <div className="text-sm text-emerald-700">Столбцов</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100">
              <div className="text-2xl font-bold text-purple-600">{createdLabel}</div>
              <div className="text-sm text-purple-700">Создан</div>
            </div>
            <div className="p-4 rounded-xl bg-gradient-to-r from-orange-50 to-red-50 border border-orange-100">
              <div className="text-2xl font-bold text-orange-600">
                {dataset.tags?.length || 0}
              </div>
              <div className="text-sm text-orange-700">Тегов</div>
            </div>
          </div>

          {aiSuggestions && (
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Рекомендации локального ИИ</h3>
                  <p className="text-sm text-slate-600 mt-2">{aiSuggestions.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(aiSuggestions.focus_areas ?? []).map((area) => (
                    <Badge key={area} variant="secondary" className="text-[11px] bg-white text-slate-700 border border-slate-200">
                      {area}
                    </Badge>
                  ))}
                </div>
              </div>
              <ul className="mt-4 space-y-2 list-disc list-inside text-sm text-slate-700">
                {(aiSuggestions.suggestions ?? []).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
              <div className="mt-4 text-xs text-slate-500">
                {aiSuggestions.context_note && <p>{aiSuggestions.context_note}</p>}
                {aiSuggestions.local_execution_note && (
                  <p className="mt-1">{aiSuggestions.local_execution_note}</p>
                )}
              </div>
            </div>
          )}
          {/* AI Insights */}
          {aiSummary && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Инсайты ИИ</h3>
                  <p className="text-sm text-slate-500">Локальный анализ качества и структуры выборки</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/60">
                  <div className="text-sm text-indigo-700">Строк в выборке</div>
                  <div className="text-2xl font-bold text-indigo-600">{aiSummary.sampleRows || 0}</div>
                </div>
                <div className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="text-sm text-slate-600">Полнота данных</div>
                  <div className="text-2xl font-bold text-slate-900">{aiSummary.completeness || 0}%</div>
                </div>
                <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/60">
                  <div className="text-sm text-amber-700">Повторяющиеся строки</div>
                  <div className="text-2xl font-bold text-amber-600">{aiSummary.duplicates || 0}</div>
                </div>
              </div>

              {aiSummary.insights?.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <div className="text-sm font-medium text-slate-700 mb-2">Ключевые наблюдения</div>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600">
                    {aiSummary.insights.slice(0, 4).map((insight, index) => (
                      <li key={index}>{insight}</li>
                    ))}
                  </ul>
                </div>
              )}

              {aiSummary.numericSummary?.some((column) => column.hasData) && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-sm font-medium text-slate-700 mb-3">Основные числовые показатели</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {aiSummary.numericSummary
                      .filter((column) => column.hasData)
                      .slice(0, 4)
                      .map((column) => (
                        <div key={column.name} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                          <div className="font-semibold text-slate-900 mb-1">{column.name}</div>
                          <div className="grid grid-cols-3 gap-2 text-xs text-slate-600">
                            <div>
                              <div className="font-semibold text-slate-800">Мин</div>
                              <div>{column.formattedMin ?? column.min}</div>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">Макс</div>
                              <div>{column.formattedMax ?? column.max}</div>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">Среднее</div>
                              <div>{column.formattedMean ?? column.mean}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Column Information */}
          {dataset.columns && dataset.columns.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-900">Схема столбцов</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {dataset.columns.map((column, index) => {
                  const Icon = getColumnIcon(column.type);
                  return (
                    <div key={index} className={`p-3 rounded-lg border ${getColumnColor(column.type)}`}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        <span className="font-medium">{column.name}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {column.type}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sample Data */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">
              Образец данных {sampleData.length > 0 && `(${sampleData.length} строк)`}
            </h3>
            {isLoading ? (
              <div className="flex items-center justify-center h-32 bg-slate-50 rounded-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              </div>
            ) : sampleData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50">
                    <tr>
                      {Object.keys(sampleData[0] || {}).map((key) => (
                        <th key={key} className="border border-slate-200 px-4 py-2 text-left font-medium text-slate-700">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleData.map((row, index) => (
                      <tr key={index} className="hover:bg-slate-50">
                        {Object.entries(row).map(([key, value], i) => {
                          const column = dataset.columns?.find(c => c.name === key);
                          const columnType = column?.type || 'string';
                          return (
                            <td key={i} className="border border-slate-200 px-4 py-2 text-slate-600">
                              {formatCellValue(value, columnType)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-lg">
                <Database className="w-12 h-12 mx-auto text-slate-400 mb-2" />
                <p className="text-slate-500">Нет данных для отображения</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-between items-center pt-4 border-t border-slate-200">
          <div className="flex gap-2">
            {dataset.tags?.map((tag, index) => (
              <Badge key={index} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Экспорт
            </Button>
            <Link to={createPageUrl("Charts")}>
              <Button className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
                <BarChart3 className="w-4 h-4" />
                Создать визуализацию
              </Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
