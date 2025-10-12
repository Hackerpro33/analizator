import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileCheck2, X, AlertTriangle } from 'lucide-react';


function buildInitialTags(datasetInfo) {
  const baseTags = new Set(["загружено", "новое"]);
  (datasetInfo?.tags || []).forEach(tag => baseTags.add(tag));
  return Array.from(baseTags);
}


export default function DataImportPreview({ datasetInfo, onConfirmImport, onCancel }) {
  const safeInfo = datasetInfo || {};
  const [name, setName] = useState(safeInfo.name || 'Новый набор данных');
  const [description, setDescription] = useState(safeInfo.description || '');
  const [selectedColumns, setSelectedColumns] = useState(safeInfo.columns || []);
  const [tags, setTags] = useState(buildInitialTags(safeInfo));
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasRealData = useMemo(() => {
    const rows = safeInfo.sample_data;
    if (!Array.isArray(rows) || rows.length === 0) {
      return false;
    }
    return rows.some(row => Object.values(row || {}).some(value => {
      const str = String(value ?? '').toLowerCase();
      return str && !str.includes('пример') && !str.includes('example');
    }));
  }, [safeInfo.sample_data]);

  const toggleColumn = (column) => {
    setSelectedColumns(prev => {
      const exists = prev.some(c => c.name === column.name);
      if (exists) {
        return prev.filter(c => c.name !== column.name);
      }
      return [...prev, column];
    });
  };

  const handleAddTag = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const value = tagInput.trim();
      if (value && !tags.includes(value)) {
        setTags([...tags, value]);
      }
      setTagInput('');
    }
    setTagInput('');
  };

  const handleRemoveTag = (tag) => {
    setTags(tags.filter(t => t !== tag));
  };

  const handleConfirm = async () => {
    if (!onConfirmImport) {
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirmImport({
        name: name.trim() || 'Новый набор данных',
        description,
        columns: selectedColumns,
        tags,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const sampleRows = useMemo(() => {
    if (!Array.isArray(safeInfo.sample_data)) {
      return [];
    }
    return safeInfo.sample_data.slice(0, 10);
  }, [safeInfo.sample_data]);

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-6xl h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl heading-text">
            <FileCheck2 className="w-6 h-6 text-blue-500" />
            Предварительный просмотр и импорт данных
          </DialogTitle>
          <DialogDescription className="elegant-text">
            Проверьте структуру набора данных и при необходимости обновите метаданные перед импортом.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4 flex-1 overflow-hidden">
          <div className="space-y-4">
            <div>
              <Label htmlFor="dataset-name" className="elegant-text">Название набора данных</Label>
              <Input
                id="dataset-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например: Продажи 2024"
              />
            </div>

            <div>
              <Label htmlFor="dataset-description" className="elegant-text">Описание</Label>
              <Textarea
                id="dataset-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Кратко опишите содержимое набора данных"
              />
            </div>

            <div>
              <Label className="elegant-text">Столбцы для импорта</Label>
              <ScrollArea className="h-48 p-3 border rounded-md bg-slate-50/50">
                <div className="space-y-2">
                  {(safeInfo.columns || []).map((column) => (
                    <div key={column.name} className="flex items-center gap-2">
                      <Checkbox
                        id={`column-${column.name}`}
                        checked={selectedColumns.some(c => c.name === column.name)}
                        onCheckedChange={() => toggleColumn(column)}
                      />
                      <Label htmlFor={`column-${column.name}`} className="flex-1 elegant-text text-sm">
                        {column.name}
                        <span className="text-slate-500"> ({column.type})</span>
                      </Label>
                    </div>
                  ))}
                  {(safeInfo.columns || []).length === 0 && (
                    <p className="text-xs text-slate-500">Структура не определена. Добавьте столбцы вручную после импорта.</p>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div>
              <Label htmlFor="dataset-tags" className="elegant-text">Теги</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="elegant-text">
                    {tag}
                    <button type="button" onClick={() => handleRemoveTag(tag)} className="ml-1 rounded-full hover:bg-slate-300">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  id="dataset-tags"
                  value={tagInput}
                  onChange={(event) => setTagInput(event.target.value)}
                  onKeyDown={handleAddTag}
                  placeholder="Добавить тег..."
                  className="flex-1 border-none shadow-none focus-visible:ring-0 h-6 p-0"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 flex flex-col">
            <Label className="elegant-text">
              Образец данных
              {!hasRealData && (
                <Badge variant="destructive" className="ml-2">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Примерная структура
                </Badge>
              )}
            </Label>

            {!hasRealData && (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Внимание:</strong> Не удалось автоматически извлечь реальные строки данных. Проверьте и при необходимости
                  загрузите значения позднее.
                </p>
              </div>
            )}

            <div className="border rounded-md overflow-hidden flex-1">
              <ScrollArea className="h-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {selectedColumns.map(col => (
                        <TableHead key={col.name}>{col.name}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sampleRows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {selectedColumns.map(col => (
                          <TableCell key={col.name} className="text-xs">
                            {String(row?.[col.name] ?? '')}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {sampleRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={Math.max(selectedColumns.length, 1)} className="text-center text-slate-500 py-8">
                          Нет данных для предпросмотра
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            Импортировать {selectedColumns.length} {selectedColumns.length === 1 ? 'столбец' : 'столбцов'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
