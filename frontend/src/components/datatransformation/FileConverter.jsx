import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { uploadFile, extractDataFromUploadedFile } from "@/api/integrations";
import { Dataset } from "@/api/entities";
import {
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Zap,
  Target,
  Download,
  Info
} from "lucide-react";
import { detectFileIcon, generateCSV } from "@/utils/dataTransformation";

export default function FileConverter({ supportedFormats, onConversionComplete, onDatasetCreated }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionResult, setConversionResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [outputFormat, setOutputFormat] = useState('csv');
  const [dragActive, setDragActive] = useState(false);
  const [downloadableContent, setDownloadableContent] = useState(null);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleConversion = async () => {
    if (!selectedFile) return;
    
    setIsConverting(true);
    setConversionProgress(0);
    setConversionResult(null);
    setValidationResult(null);
    setDownloadableContent(null);

    try {
      // Этап 1: Загрузка файла
      setConversionProgress(30);
      const { file_url } = await uploadFile({ file: selectedFile });
      
      // Этап 2: Попытка извлечения данных
      setConversionProgress(60);
      
      let extractionSuccess = false;
      let extractedData = null;
      
      try {
        const extractionResult = await extractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: "object",
            properties: {
              columns: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    type: { type: "string" }
                  }
                }
              },
              row_count: { type: "number" },
              sample_data: {
                type: "array",
                items: { type: "object", additionalProperties: true }
              }
            }
          }
        });

        if (extractionResult.status === "success" && 
            extractionResult.output && 
            extractionResult.output.sample_data && 
            extractionResult.output.sample_data.length > 0) {
          extractionSuccess = true;
          extractedData = extractionResult.output;
        }
      } catch (error) {
        console.log("Автоматическое извлечение не удалось:", error);
      }

      setConversionProgress(80);

      if (extractionSuccess) {
        // Успешное извлечение - создаем датасет с реальными данными
        const datasetData = {
          name: `${selectedFile.name.replace(/\.[^/.]+$/, "")} (извлечено)`,
          description: `Данные успешно извлечены из ${selectedFile.name}`,
          file_url,
          columns: extractedData.columns || [],
          row_count: extractedData.row_count || 0,
          sample_data: extractedData.sample_data || [],
          tags: ["извлечено", "успешно"]
        };

        await Dataset.create(datasetData);

        // Создаем файл для скачивания с реальными данными
        if (outputFormat === 'csv') {
          const csvContent = generateCSV(extractedData.columns, extractedData.sample_data);
          setDownloadableContent(csvContent);
        } else {
          setDownloadableContent(`Данные в формате ${outputFormat} (${extractedData.sample_data.length} строк)`);
        }

        setConversionProgress(100);
        setConversionResult({
          success: true,
          dataset: datasetData,
          extractionMode: 'automatic',
          message: 'Данные успешно извлечены из файла!'
        });

        onConversionComplete({
          originalName: selectedFile.name,
          fromFormat: selectedFile.name.split('.').pop().toUpperCase(),
          toFormat: outputFormat.toUpperCase(),
          timestamp: new Date().toISOString(),
          success: true,
          extractionMode: 'automatic'
        });
      } else {
        // Извлечение не удалось - создаем датасет только с метаданными
        const datasetData = {
          name: `${selectedFile.name.replace(/\.[^/.]+$/, "")} (требует настройки)`,
          description: `Файл загружен, но автоматическое извлечение данных не удалось. Требуется ручная настройка структуры данных.`,
          file_url,
          columns: [],
          row_count: 0,
          sample_data: [],
          tags: ["загружен", "требует-настройки"]
        };

        await Dataset.create(datasetData);

        setConversionProgress(100);
        setConversionResult({
          success: false,
          dataset: datasetData,
          extractionMode: 'failed',
          message: 'Автоматическое извлечение данных не удалось. Файл сохранен, но потребуется ручная настройка.'
        });

        onConversionComplete({
          originalName: selectedFile.name,
          fromFormat: selectedFile.name.split('.').pop().toUpperCase(),
          toFormat: outputFormat.toUpperCase(),
          timestamp: new Date().toISOString(),
          success: false,
          extractionMode: 'failed'
        });
      }

      onDatasetCreated();

    } catch (error) {
      console.error('Ошибка обработки файла:', error);
      setConversionResult({
        success: false,
        error: error.message,
        extractionMode: 'error'
      });
      
      onConversionComplete({
        originalName: selectedFile.name,
        fromFormat: selectedFile.name.split('.').pop().toUpperCase(),
        toFormat: outputFormat.toUpperCase(),
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });
    }
    
    setIsConverting(false);
  };

  const handleDownload = () => {
    if (!downloadableContent) return;

    const blob = new Blob([downloadableContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const originalNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
    link.download = `${originalNameWithoutExt}_extracted.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fileIcon = selectedFile ? detectFileIcon(selectedFile.name) : null;

  return (
    <div className="space-y-6">
      {/* Important Notice */}
      <Alert className="bg-blue-50 border-blue-200">
        <Info className="w-4 h-4" />
        <AlertDescription className="text-blue-800">
          <strong>Важно:</strong> Система пытается автоматически извлечь табличные данные из файла. 
          Если это не удается, файл все равно будет сохранен для дальнейшей работы, но потребуется ручная настройка структуры данных.
        </AlertDescription>
      </Alert>

      {/* File Upload */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-900">
            <Upload className="w-5 h-5 text-blue-500" />
            Загрузка файла для обработки
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
              dragActive 
                ? "border-blue-400 bg-blue-50/50" 
                : "border-slate-200 hover:border-slate-300"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              accept=".xls,.xlsx,.xlsm,.xlsb,.ods,.csv,.tsv,.txt,.dbf,.mdb,.accdb,.html,.xml,.json,.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.tiff,.bmp,.tex,.sav,.sas7bdat,.dta,.parquet,.avro"
            />
            
            {selectedFile ? (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-3">
                  {fileIcon && (
                    <div className={`w-12 h-12 bg-gradient-to-r ${fileIcon.color} rounded-xl flex items-center justify-center`}>
                      <fileIcon.icon className="w-6 h-6 text-white" />
                    </div>
                  )}
                  <div className="text-left">
                    <div className="font-medium text-slate-900">{selectedFile.name}</div>
                    <div className="text-sm text-slate-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} МБ
                    </div>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setSelectedFile(null)}>
                  Выбрать другой файл
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-gradient-to-r from-blue-500 to-cyan-600 rounded-2xl flex items-center justify-center">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">
                    Загрузите файл для обработки
                  </h3>
                  <p className="text-slate-600 mb-4">
                    Система попытается автоматически извлечь данные
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()}>
                    Выбрать файл
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Processing Settings */}
      {selectedFile && (
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Настройки обработки
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Label>Исходный формат</Label>
                <div className="mt-2 p-3 bg-slate-50 rounded-lg">
                  <Badge variant="outline" className="text-sm">
                    {selectedFile.name.split('.').pop().toUpperCase()}
                  </Badge>
                </div>
              </div>
              <div>
                <Label>Формат для скачивания (при успехе)</Label>
                <Select value={outputFormat} onValueChange={setOutputFormat}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Выберите формат" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="csv">CSV (рекомендуется)</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="txt">Текст (TXT)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button 
              onClick={handleConversion}
              disabled={isConverting}
              className="w-full bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white py-3 text-lg font-medium"
            >
              {isConverting ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Обработка файла...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Обработать файл
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Processing Progress */}
      {isConverting && (
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-700">Прогресс обработки</span>
                <span className="text-sm text-slate-500">{conversionProgress}%</span>
              </div>
              <Progress value={conversionProgress} className="w-full" />
              <div className="text-xs text-slate-500">
                {conversionProgress < 40 && "Загрузка и анализ файла..."}
                {conversionProgress >= 40 && conversionProgress < 70 && "Попытка автоматического извлечения данных..."}
                {conversionProgress >= 70 && conversionProgress < 90 && "Создание набора данных..."}
                {conversionProgress >= 90 && conversionProgress < 100 && "Завершение обработки..."}
                {conversionProgress === 100 && "Обработка завершена!"}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Processing Result */}
      {conversionResult && (
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              {conversionResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              )}
              Результат обработки
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversionResult.extractionMode === 'automatic' ? (
              <div className="space-y-4">
                <Alert className="bg-green-50 border-green-200">
                  <CheckCircle2 className="w-4 h-4" />
                  <AlertDescription className="text-green-800">
                    {conversionResult.message}
                  </AlertDescription>
                </Alert>

                {downloadableContent && (
                  <Button 
                    onClick={handleDownload} 
                    className="w-full gap-2"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Скачать извлеченные данные (CSV)
                  </Button>
                )}
              </div>
            ) : conversionResult.extractionMode === 'failed' ? (
              <div className="space-y-4">
                <Alert className="bg-orange-50 border-orange-200">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription className="text-orange-800">
                    {conversionResult.message}
                  </AlertDescription>
                </Alert>

                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Что делать дальше:</h4>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Файл сохранен в вашей библиотеке данных</li>
                    <li>• Вы можете настроить структуру данных вручную</li>
                    <li>• Попробуйте конвертировать файл в CSV перед загрузкой</li>
                    <li>• Убедитесь, что файл содержит чистые табличные данные</li>
                  </ul>
                </div>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertTriangle className="w-4 h-4" />
                <AlertDescription>
                  Ошибка обработки: {conversionResult.error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

