import { Dataset } from "@/api/entities";
import React, { useState, useEffect } from "react";
import { extractDataFromUploadedFile, uploadFile } from "@/api/integrations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  Database,
  Tag,
  Calendar,
  BarChart,
  Search,
  Filter,
  Plus
} from "lucide-react";
import { format } from "date-fns";

import FileUploadZone from "../components/datasources/FileUploadZone";
import DatasetCard from "../components/datasources/DatasetCard";
import DatasetPreview from "../components/datasources/DatasetPreview";
import DataImportPreview from "../components/datasources/DataImportPreview";
import PageContainer from "@/components/layout/PageContainer";

export default function DataSources() {
  const [datasets, setDatasets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [pendingDataset, setPendingDataset] = useState(null);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    setIsLoading(true);
    try {
      const data = await Dataset.list('-created_at');
      setDatasets(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load datasets:', err);
      setDatasets([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (file) => {
    setIsUploading(true);

    const MAX_FILE_SIZE_MB = 25;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(`Ошибка: Файл слишком большой. Максимальный размер файла — ${MAX_FILE_SIZE_MB} МБ.`);
        setIsUploading(false);
        return;
    }

    let uploadedFileUrl = null;

    try {
      const { file_url, quick_extraction } = await uploadFile({ file });
      uploadedFileUrl = file_url;

      if (quick_extraction?.columns?.length) {
        const normalizedColumns = quick_extraction.columns.map((column) => ({
          name: column.name,
          type: column.type || 'string',
        }));

        setPendingDataset({
          name: file.name.replace(/\.[^/.]+$/, ""),
          description: `Автоматически распознанный набор данных из ${file.name}`,
          file_url: uploadedFileUrl,
          columns: normalizedColumns,
          row_count: quick_extraction.row_count || 0,
          sample_data: quick_extraction.sample_data || [],
          insights: quick_extraction.insights || [],
        });
        setShowImportPreview(true);
        return;
      }

      // Проверяем тип файла
      const fileExtension = file.name.split('.').pop().toLowerCase();
      const supportedByExtraction = ['csv', 'png', 'jpg', 'jpeg', 'pdf'];

      if (supportedByExtraction.includes(fileExtension)) {
        // Попробуем извлечь данные с помощью интеграции для поддерживаемых типов
        try {
          const result = await extractDataFromUploadedFile({
            file_url: uploadedFileUrl,
            json_schema: {
              type: "object",
              properties: {
                columns: {
                  type: "array",
                  description: "Массив объектов столбцов, каждый с именем и определенным типом данных (например, string, number, date).",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      type: { type: "string" }
                    },
                    required: ["name", "type"]
                  }
                },
                row_count: {
                  type: "number",
                  description: "Общее количество строк в наборе данных."
                },
                sample_data: {
                  type: "array",
                  description: "Массив объектов, представляющих первые несколько строк данных. Каждый объект — это пара ключ-значение, где ключ — это имя столбца.",
                  items: {
                    type: "object",
                    additionalProperties: true
                  }
                }
              },
              required: ["columns", "row_count", "sample_data"]
            }
          });

          if (result.status === "success" && result.output && result.output.columns && result.output.columns.length > 0) {
            setPendingDataset({
              name: file.name.replace(/\.[^/.]+$/, ""),
              description: `Загруженный набор данных из ${file.name}`,
              file_url: uploadedFileUrl,
              columns: result.output.columns || [],
              row_count: result.output.row_count || 0,
              sample_data: result.output.sample_data || [],
            });
            setShowImportPreview(true);
          } else {
            console.log("Автоматическое извлечение данных не удалось, используем резервный режим");
            handleFallbackImport(file, uploadedFileUrl);
          }
        } catch (extractError) {
          console.log("Ошибка извлечения данных, используем резервный режим:", extractError);
          handleFallbackImport(file, uploadedFileUrl);
        }
      } else {
        // Для неподдерживаемых типов файлов (включая Excel) сразу используем резервный режим
        console.log(`Тип файла ${fileExtension} не поддерживается автоматическим извлечением, используем резервный режим`);
        handleFallbackImport(file, uploadedFileUrl);
      }
    } catch (error) {
      console.error('Ошибка обработки файла:', error);
      const errorMessage = String(error);

      if (errorMessage.includes("413") || errorMessage.includes("Payload too large")) {
        alert(`Ошибка: Файл слишком большой. Пожалуйста, загрузите файл размером до ${MAX_FILE_SIZE_MB} МБ.`);
      } else if (errorMessage.includes("Unsupported file type") && uploadedFileUrl) {
        console.log("Неподдерживаемый тип файла, используем резервный режим");
        handleFallbackImport(file, uploadedFileUrl);
      } else if (errorMessage.includes("500")) {
         alert("Произошла внутренняя ошибка сервера при обработке файла. Возможно, файл имеет неверный формат или слишком сложную структуру. Попробуйте упростить файл и загрузить снова.");
      } else {
        alert("Произошла непредвиденная ошибка при загрузке файла. Пожалуйста, проверьте подключение к локальной сети и попробуйте снова.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleFallbackImport = (file, file_url) => {
    // Создаем базовую структуру данных на основе имени файла и его типа
    const fileName = file.name.toLowerCase();
    const fileExtension = file.name.split('.').pop().toLowerCase();
    let estimatedColumns = [];
    let sampleData = []; // Данные в резервном режиме всегда пустые

    // Определяем структуру на основе имени файла
    if (fileName.includes('employ') || fileName.includes('сотрудник') || fileName.includes('staff')) {
      estimatedColumns = [
        { name: "Employee_ID", type: "string" },
        { name: "Full_Name", type: "string" },
        { name: "Department", type: "string" },
        { name: "Position", type: "string" },
        { name: "Hire_Date", type: "date" },
        { name: "Salary", type: "number" },
        { name: "Status", type: "string" }
      ];
    } else if (fileName.includes('crime') || fileName.includes('преступ') || fileName.includes('регион')) {
      estimatedColumns = [
        { name: "region", type: "string" },
        { name: "crime_type", type: "string" },
        { name: "cases_count", type: "number" },
        { name: "latitude", type: "number" },
        { name: "longitude", type: "number" }
      ];
    } else if (fileName.includes('safety') || fileName.includes('mta') || fileName.includes('безопасность')) {
      estimatedColumns = [
        { name: "Date", type: "date" },
        { name: "Agency", type: "string" },
        { name: "Location", type: "string" },
        { name: "Incident_Type", type: "string" },
        { name: "Severity", type: "string" },
        { name: "Count", type: "number" },
        { name: "Latitude", type: "number" },
        { name: "Longitude", type: "number" }
      ];
    } else if (fileName.includes('sales') || fileName.includes('продажи') || fileName.includes('revenue')) {
      estimatedColumns = [
        { name: "Date", type: "date" },
        { name: "Product_Name", type: "string" },
        { name: "Category", type: "string" },
        { name: "Quantity", type: "number" },
        { name: "Unit_Price", type: "number" },
        { name: "Total_Amount", type: "number" },
        { name: "Region", type: "string" },
        { name: "Customer_ID", type: "string" }
      ];
    } else {
      // Универсальная структура для неизвестных файлов
      estimatedColumns = [
        { name: "column1", type: "string" },
        { name: "column2", type: "number" },
        { name: "column3", type: "string" },
        { name: "column4", type: "number" },
        { name: "column5", type: "date" }
      ];
    }

    // Добавляем информацию о типе файла в описание
    const fileTypeDescription = fileExtension === 'xlsx' || fileExtension === 'xls' ? 'Excel файла' :
                               fileExtension === 'csv' ? 'CSV файла' :
                               `${fileExtension.toUpperCase()} файла`;

    setPendingDataset({
      name: file.name.replace(/\.[^/.]+$/, ""),
      description: `Загруженный набор данных из ${fileTypeDescription} (требуется ручная настройка столбцов)`,
      file_url,
      columns: estimatedColumns,
      row_count: 0, // Нет данных - нет строк
      sample_data: [], // Всегда пустые данные для резервного режима
    });
    setShowImportPreview(true);
  };

  const handleConfirmImport = async (importConfig) => {
    try {
      const datasetData = {
        name: importConfig.name,
        description: importConfig.description,
        file_url: pendingDataset.file_url,
        columns: importConfig.columns,
        row_count: pendingDataset.row_count,
        tags: importConfig.tags,
        sample_data: pendingDataset.sample_data,
      };
      await Dataset.create(datasetData);
    } catch (error) {
      console.error("Ошибка импорта набора данных:", error);
      alert("Не удалось импортировать набор данных.");
    } finally {
      setShowImportPreview(false);
      setPendingDataset(null);
      await loadDatasets();
    }
  };

  const filteredDatasets = datasets.filter(dataset =>
    dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    dataset.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePreview = (dataset) => {
    setSelectedDataset(dataset);
    setShowPreview(true);
  };

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
          Источники данных
        </h1>
        <p className="text-slate-600 text-lg max-w-2xl mx-auto">
          Загружайте и управляйте вашими наборами данных. Превращайте сырые данные в мощные инсайты.
        </p>
      </div>

      {/* Upload Section */}
      <FileUploadZone
        onFileUpload={handleFileUpload}
        isUploading={isUploading}
      />

      {/* Search and Filters */}
      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Искать наборы данных..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-slate-200 focus:border-blue-500 bg-white/50"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                Фильтр
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Tag className="w-4 h-4" />
                Теги
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Datasets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          Array(6).fill(0).map((_, i) => (
            <Card key={i} className="border-0 bg-white/50 backdrop-blur-xl shadow-lg animate-pulse">
              <CardContent className="p-6 space-y-4">
                <div className="h-6 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                <div className="h-16 bg-slate-200 rounded"></div>
              </CardContent>
            </Card>
          ))
        ) : (
          filteredDatasets.map(dataset => (
            <DatasetCard
              key={dataset.id}
              dataset={dataset}
              onPreview={handlePreview}
            />
          ))
        )}
      </div>

      {!isLoading && filteredDatasets.length === 0 && (
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="text-center py-12">
            <Database className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Наборы данных не найдены</h3>
            <p className="text-slate-500 mb-6">
              {searchTerm ? "Попробуйте изменить условия поиска" : "Загрузите свой первый набор данных, чтобы начать"}
            </p>
            <Button className="gap-2 bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700">
              <Plus className="w-4 h-4" />
              Загрузить данные
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dataset Preview Modal */}
      {showPreview && (
        <DatasetPreview
          dataset={selectedDataset}
          onClose={() => setShowPreview(false)}
        />
      )}

      {/* Data Import Preview Modal */}
      {showImportPreview && (
        <DataImportPreview
          datasetInfo={pendingDataset}
          onConfirmImport={handleConfirmImport}
          onCancel={() => {
            setShowImportPreview(false);
            setPendingDataset(null);
          }}
        />
      )}
    </PageContainer>
  );
}
