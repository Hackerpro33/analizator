import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, Download } from "lucide-react";
import { getDatasets } from "@/api/entities";
import { fetchDataAuditReport, runDataAudit } from "@/api/aiLab";

export default function DataAuditPanel() {
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [dateColumn, setDateColumn] = useState("");
  const [targetColumn, setTargetColumn] = useState("");
  const [report, setReport] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await getDatasets();
        setDatasets(Array.isArray(response) ? response : []);
        if (response?.length) {
          setSelectedDataset(response[0].id);
          autoFillColumns(response[0]);
        }
      } catch (err) {
        console.error("Не удалось загрузить наборы данных", err);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const dataset = datasets.find((item) => item.id === selectedDataset);
    if (dataset) {
      autoFillColumns(dataset);
      loadReport(dataset.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset]);

  const autoFillColumns = (dataset) => {
    if (!dataset) return;
    const firstDate = dataset.columns?.find(
      (column) => column.type === "date" || /date|month|period/i.test(column.name || ""),
    );
    const numericColumns = (dataset.columns || []).filter((column) => column.type === "number");
    setDateColumn(firstDate?.name || "");
    setTargetColumn(numericColumns[0]?.name || "");
  };

  const loadReport = async (datasetId) => {
    try {
      const existing = await fetchDataAuditReport(datasetId);
      setReport(existing);
    } catch (err) {
      setReport(null);
    }
  };

  const handleRun = async () => {
    if (!selectedDataset) return;
    setIsRunning(true);
    setError(null);
    try {
      const response = await runDataAudit({
        dataset_id: selectedDataset,
        date_column: dateColumn || undefined,
        target_column: targetColumn || undefined,
      });
      setReport(response.report);
    } catch (err) {
      console.error("Ошибка запуска аудита данных", err);
      setError(err?.message || "Не удалось выполнить аудит.");
    } finally {
      setIsRunning(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `data-audit-${report.dataset_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const completenessRows = useMemo(() => report?.completeness || [], [report]);

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <CardTitle>Аудит данных</CardTitle>
        </div>
        <p className="text-sm text-muted-foreground">
          Набор автоматически анализируется на пропуски, дубликаты, непрерывность дат и выбросы. Полученные подсказки используются
          в ИИ-лаборатории.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Набор данных</p>
            <Select value={selectedDataset} onValueChange={setSelectedDataset}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите набор" />
              </SelectTrigger>
              <SelectContent>
                {datasets.map((dataset) => (
                  <SelectItem key={dataset.id} value={dataset.id}>
                    {dataset.name || dataset.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Колонка дат</p>
            <Select value={dateColumn} onValueChange={setDateColumn}>
              <SelectTrigger>
                <SelectValue placeholder="Колонка дата/месяц" />
              </SelectTrigger>
              <SelectContent>
                {(datasets.find((item) => item.id === selectedDataset)?.columns || []).map((column) => (
                  <SelectItem key={`date-${column.name}`} value={column.name}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Целевая колонка</p>
            <Select value={targetColumn} onValueChange={setTargetColumn}>
              <SelectTrigger>
                <SelectValue placeholder="Колонка значения" />
              </SelectTrigger>
              <SelectContent>
                {(datasets.find((item) => item.id === selectedDataset)?.columns || []).map((column) => (
                  <SelectItem key={`target-${column.name}`} value={column.name}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleRun} disabled={isRunning || !selectedDataset}>
            {isRunning && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Запустить аудит данных
          </Button>
          <Button variant="outline" onClick={downloadReport} disabled={!report}>
            <Download className="w-4 h-4 mr-2" />
            Скачать отчёт (JSON)
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {report && (
          <div className="space-y-4">
            <Alert className="border-amber-200 bg-amber-50 text-amber-900">
              <AlertDescription>
                Итог: {report.status?.toUpperCase() || "—"} — {report.reasons?.join(" ") || "без критичных проблем"}
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Дубликаты</p>
                <p className="text-lg font-semibold">{report.duplicates?.count || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Пропуски (макс. по колонкам)</p>
                <p className="text-lg font-semibold">
                  {Math.max(...completenessRows.map((row) => row.missing_ratio), 0).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Непрерывность дат</p>
                <p className="text-lg font-semibold">{report.continuity?.status || "—"}</p>
              </div>
            </div>

            <div>
              <p className="text-xs uppercase text-muted-foreground">Пропуски по колонкам</p>
              <div className="overflow-auto rounded-xl border bg-white mt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Колонка</TableHead>
                      <TableHead className="text-right">Доля пропусков</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completenessRows.map((row) => (
                      <TableRow key={row.column}>
                        <TableCell>{row.column}</TableCell>
                        <TableCell className="text-right">{(row.missing_ratio * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
