import React, { useState, useEffect } from "react";
import { Dataset } from "@/api/entities";
import { extractDataFromUploadedFile, uploadFile } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import PageContainer from "@/components/layout/PageContainer";
import { 
  RefreshCw, 
  Upload, 
  Download, 
  FileText, 
  Database, 
  CheckCircle2, 
  AlertTriangle,
  Sparkles,
  FileImage,
  FileSpreadsheet,
  Globe,
  Code,
  Zap
} from "lucide-react";

import FileConverter from "../components/datatransformation/FileConverter";
import ExportCenter from "../components/datatransformation/ExportCenter";

export default function DataTransformation() {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('convert');
  const [conversionHistory, setConversionHistory] = useState([]);

  useEffect(() => {
    loadDatasets();
    loadConversionHistory();
  }, []);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      const data = await Dataset.list('-created_date');
      setDatasets(data);
    } catch (error) {
      console.error('Ошибка загрузки наборов данных:', error);
    }
    setIsLoading(false);
  };

  const loadConversionHistory = () => {
    // Загрузка истории преобразований из localStorage
    const history = localStorage.getItem('conversionHistory');
    if (history) {
      setConversionHistory(JSON.parse(history));
    }
  };

  const addToHistory = (conversion) => {
    const newHistory = [conversion, ...conversionHistory.slice(0, 9)]; // Храним последние 10
    setConversionHistory(newHistory);
    localStorage.setItem('conversionHistory', JSON.stringify(newHistory));
  };

  const supportedFormats = {
    excel: {
      name: 'Excel и подобные',
      formats: ['XLS', 'XLSX', 'XLSM', 'XLSB', 'XLTX', 'XLTM'],
      icon: FileSpreadsheet,
      color: 'from-green-500 to-emerald-600'
    },
    office: {
      name: 'Открытые офисные',
      formats: ['ODS'],
      icon: FileText,
      color: 'from-blue-500 to-cyan-600'
    },
    text: {
      name: 'Текстовые форматы',
      formats: ['CSV', 'TSV', 'TXT'],
      icon: FileText,
      color: 'from-purple-500 to-indigo-600'
    },
    database: {
      name: 'Базы данных',
      formats: ['DBF', 'MDB', 'ACCDB', 'SQLite', 'SQL'],
      icon: Database,
      color: 'from-orange-500 to-red-600'
    },
    web: {
      name: 'Веб и разметка',
      formats: ['HTML', 'XML', 'JSON'],
      icon: Globe,
      color: 'from-cyan-500 to-blue-600'
    },
    documents: {
      name: 'Документы',
      formats: ['PDF', 'DOC', 'DOCX', 'PPT', 'PPTX'],
      icon: FileText,
      color: 'from-pink-500 to-rose-600'
    },
    images: {
      name: 'Изображения',
      formats: ['JPEG', 'PNG', 'TIFF', 'BMP'],
      icon: FileImage,
      color: 'from-indigo-500 to-purple-600'
    },
    scientific: {
      name: 'Научные форматы',
      formats: ['LaTeX', 'SPSS', 'SAS', 'Stata', 'Parquet', 'Avro'],
      icon: Code,
      color: 'from-slate-500 to-gray-600'
    }
  };

  const tabs = [
    { id: 'convert', label: 'Преобразование', icon: RefreshCw },
    { id: 'export', label: 'Экспорт', icon: Download },
    { id: 'history', label: 'История', icon: FileText }
  ];

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
            Преобразование данных
          </h1>
          <p className="text-slate-600 text-lg max-w-3xl mx-auto">
            Универсальный инструмент для преобразования любых табличных данных с ИИ-валидацией. 
            Поддержка 25+ форматов файлов с гарантией точности 99%.
          </p>
        </div>

        {/* Supported Formats Overview */}
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="w-5 h-5 text-purple-500" />
              Поддерживаемые форматы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(supportedFormats).map(([key, category]) => (
                <div key={key} className="p-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 bg-gradient-to-r ${category.color} rounded-lg flex items-center justify-center`}>
                      <category.icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{category.name}</div>
                      <div className="text-xs text-slate-500">{category.formats.length} форматов</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {category.formats.slice(0, 3).map(format => (
                      <Badge key={format} variant="secondary" className="text-xs">
                        {format}
                      </Badge>
                    ))}
                    {category.formats.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{category.formats.length - 3}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tab Navigation */}
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="p-4">
            <div className="flex justify-center gap-2 flex-wrap">
              {tabs.map(tab => (
                <Button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)} 
                  variant={activeTab === tab.id ? 'default' : 'ghost'} 
                  className="gap-2"
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Tab Content */}
        {activeTab === 'convert' && (
          <FileConverter 
            supportedFormats={supportedFormats}
            onConversionComplete={addToHistory}
            onDatasetCreated={loadDatasets}
          />
        )}

        {activeTab === 'export' && (
          <ExportCenter 
            datasets={datasets}
            supportedFormats={supportedFormats}
            isLoading={isLoading}
          />
        )}

      {activeTab === 'history' && (
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <FileText className="w-5 h-5 text-blue-500" />
              История преобразований
            </CardTitle>
          </CardHeader>
          <CardContent>
            {conversionHistory.length === 0 ? (
              <div className="text-center py-12">
                <RefreshCw className="w-16 h-16 mx-auto text-slate-400 mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-2">История пуста</h3>
                <p className="text-slate-500">Преобразования файлов будут отображаться здесь</p>
              </div>
            ) : (
              <div className="space-y-4">
                {conversionHistory.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                        <RefreshCw className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900">{item.originalName}</div>
                        <div className="text-sm text-slate-500">
                          {item.fromFormat} → {item.toFormat} • {new Date(item.timestamp).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={item.success ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {item.success ? "Успешно" : "Ошибка"}
                      </Badge>
                      {item.accuracy && (
                        <Badge variant="outline">
                          {item.accuracy}% точность
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

