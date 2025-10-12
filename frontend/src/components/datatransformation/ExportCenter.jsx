import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getExportContentType } from "@/utils/dataTransformation";
import { convertDataset } from "@/utils/localAnalysis";
import { 
  Download, 
  Database, 
  FileText, 
  Sparkles, 
  CheckCircle2,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

export default function ExportCenter({ datasets, supportedFormats, isLoading }) {
  const [selectedDataset, setSelectedDataset] = useState('');
  const [exportFormat, setExportFormat] = useState('');
  const [exportOptions, setExportOptions] = useState({
    includeHeaders: true,
    delimiter: ',',
    encoding: 'UTF-8'
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);

  const handleExport = async () => {
    if (!selectedDataset || !exportFormat) {
      alert('Пожалуйста, выберите набор данных и формат экспорта');
      return;
    }

    setIsExporting(true);
    setExportResult(null);

    try {
      const dataset = datasets.find(d => String(d.id) === selectedDataset);

      if (!dataset) {
        throw new Error('Выбранный набор данных не найден.');
      }
      
      const result = convertDataset({ dataset, format: exportFormat, options: exportOptions });

      // Создаем blob для скачивания
      const blob = new Blob([result.converted_data], {
        type: getExportContentType(exportFormat)
      });
      
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${dataset.name}.${exportFormat.toLowerCase()}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportResult({
        success: true,
        info: result.format_info,
        quality: result.export_quality,
        notes: result.compatibility_notes || [],
        size: result.file_size_estimate
      });

    } catch (error) {
      console.error('Ошибка экспорта:', error);
      setExportResult({
        success: false,
        error: error.message
      });
    }
    
    setIsExporting(false);
  };

  const exportFormats = [
    { value: 'csv', label: 'CSV (Comma-Separated Values)', icon: FileText },
    { value: 'xlsx', label: 'Excel (XLSX)', icon: FileText },
    { value: 'json', label: 'JSON', icon: FileText },
    { value: 'xml', label: 'XML', icon: FileText },
    { value: 'html', label: 'HTML таблица', icon: FileText },
    { value: 'txt', label: 'Текст (TXT)', icon: FileText },
    { value: 'sql', label: 'SQL (CREATE TABLE)', icon: Database },
    { value: 'parquet', label: 'Parquet', icon: Database }
  ];

  return (
    <div className="space-y-6">
      {/* Export Configuration */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Download className="w-5 h-5 text-emerald-500" />
            Экспорт данных
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Выберите набор данных</Label>
              <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Выберите набор данных" />
                </SelectTrigger>
                <SelectContent>
                  {datasets.map(dataset => (
                    <SelectItem key={dataset.id} value={String(dataset.id)}>
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        {dataset.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Формат экспорта</Label>
              <Select value={exportFormat} onValueChange={setExportFormat}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Выберите формат" />
                </SelectTrigger>
                <SelectContent>
                  {exportFormats.map(format => (
                    <SelectItem key={format.value} value={format.value}>
                      <div className="flex items-center gap-2">
                        <format.icon className="w-4 h-4" />
                        {format.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dataset Preview */}
          {selectedDataset && (
            <div className="p-4 bg-slate-50 rounded-lg">
              <h4 className="font-semibold text-slate-900 mb-2">Предпросмотр данных</h4>
              {(() => {
                const dataset = datasets.find(d => String(d.id) === selectedDataset);
                return dataset ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-sm text-slate-600">
                      <span>Строк: {dataset.row_count || 0}</span>
                      <span>Столбцов: {dataset.columns?.length || 0}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {dataset.columns?.slice(0, 5).map((col, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {col.name} ({col.type})
                        </Badge>
                      ))}
                      {dataset.columns?.length > 5 && (
                        <Badge variant="outline" className="text-xs">
                          +{dataset.columns.length - 5} еще
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          <div className="flex items-center gap-4 pt-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-700">Локальная оптимизация включена</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-700">Проверка целостности данных</span>
            </div>
          </div>

          <Button 
            onClick={handleExport}
            disabled={!selectedDataset || !exportFormat || isExporting}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white py-3 text-lg font-medium"
          >
            {isExporting ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Экспорт...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Экспортировать данные
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Export Result */}
      {exportResult && (
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              {exportResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600" />
              )}
              Результат экспорта
            </CardTitle>
          </CardHeader>
          <CardContent>
            {exportResult.success ? (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle2 className="w-4 h-4" />
                  <AlertDescription>
                    Данные успешно экспортированы и загружены на ваш компьютер!
                  </AlertDescription>
                </Alert>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="font-semibold text-green-900 mb-1">Качество экспорта</div>
                    <div className="text-sm text-green-800 capitalize">{exportResult.quality}</div>
                  </div>
                  
                  {exportResult.size && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <div className="font-semibold text-blue-900 mb-1">Размер файла</div>
                      <div className="text-sm text-blue-800">{exportResult.size}</div>
                    </div>
                  )}
                </div>
                
                {exportResult.info && (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-2">Информация о формате</h4>
                    <p className="text-sm text-slate-700">{exportResult.info}</p>
                  </div>
                )}
                
                {exportResult.notes && exportResult.notes.length > 0 && (
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h4 className="font-semibold text-yellow-900 mb-2">Примечания о совместимости</h4>
                    <ul className="text-sm text-yellow-800 space-y-1">
                      {exportResult.notes.map((note, index) => (
                        <li key={index}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  Ошибка экспорта: {exportResult.error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* No Datasets Message */}
      {datasets.length === 0 && !isLoading && (
        <Card className="border-0 bg-gradient-to-r from-slate-50 to-blue-50 shadow-lg">
          <CardContent className="text-center py-12">
            <Database className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Нет доступных наборов данных</h3>
            <p className="text-slate-500 mb-4">
              Загрузите данные во вкладке "Источники данных" для экспорта
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}