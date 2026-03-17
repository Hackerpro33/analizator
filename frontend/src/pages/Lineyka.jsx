import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageContainer from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import MethodPicker from "@/components/ai-lab/MethodPicker";
import { Dataset } from "@/api/entities";
import TimeWindowSelector from "@/components/common/TimeWindowSelector";
import { clampName, MAX_NAME_LENGTH } from "@/lib/validation";
import {
  listLineykaVersions,
  queryLineykaData,
  applyLineykaOperations,
  fetchLineykaColumnValues,
  revertLineykaVersion,
  exportLineykaVersion,
  exportLineykaHistory,
  startLineykaForecastJob,
  fetchLineykaJob,
  runLineykaAudit,
  fetchLineykaAudit,
  publishLineykaVersion,
} from "@/api/lineyka";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CheckCircle2,
  Columns,
  Database,
  Download,
  Edit3,
  Filter,
  GitBranch,
  History,
  Layers,
  ListPlus,
  Loader2,
  MoreVertical,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

const DEFAULT_PAGE_SIZE = 500;
const ROW_HEIGHT = 38;

const FILTER_OPERATORS = {
  text: [
    { value: "contains", label: "Содержит" },
    { value: "equals", label: "Равно" },
    { value: "starts_with", label: "Начинается с" },
    { value: "ends_with", label: "Заканчивается на" },
    { value: "not_contains", label: "Не содержит" },
    { value: "not_equals", label: "Не равно" },
  ],
  number: [
    { value: "equals", label: "=" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
    { value: "between", label: "Диапазон" },
  ],
  date: [
    { value: "equals", label: "Равно" },
    { value: "after", label: "После" },
    { value: "before", label: "До" },
    { value: "between", label: "Диапазон" },
  ],
};

const STRATEGIES = [
  { value: "constant", label: "Константа" },
  { value: "copy", label: "Копия столбца" },
  { value: "arithmetic", label: "Арифметика" },
];

export default function Lineyka() {
  const { toast } = useToast();
  const scrollContainerRef = useRef(null);
  const [datasets, setDatasets] = useState([]);
  const [versions, setVersions] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [versionMeta, setVersionMeta] = useState(null);
  const [tableRows, setTableRows] = useState([]);
  const [tableColumns, setTableColumns] = useState([]);
  const [tableSummary, setTableSummary] = useState(null);
  const [totalRows, setTotalRows] = useState(0);
  const [filteredRows, setFilteredRows] = useState(0);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  const [filters, setFilters] = useState([]);
  const [timeWindow, setTimeWindow] = useState({ column: "", start: "", end: "" });
  const [searchValue, setSearchValue] = useState("");
  const [sorting, setSorting] = useState([]);
  const [columnOrder, setColumnOrder] = useState([]);
  const [hiddenColumns, setHiddenColumns] = useState(new Set());
  const [columnWidths, setColumnWidths] = useState({});
  const [rowSelection, setRowSelection] = useState(new Set());
  const [selectedColumns, setSelectedColumns] = useState(new Set());
  const [nextOffset, setNextOffset] = useState(0);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [pendingColumnDelete, setPendingColumnDelete] = useState(null);
  const [appendForm, setAppendForm] = useState({ datasetId: "", versionId: "", align: true, mapping: "" });
  const [joinForm, setJoinForm] = useState({
    datasetId: "",
    versionId: "",
    leftKey: "",
    rightKey: "",
    columns: "",
    suffix: "_src",
  });
  const [addRowsDialog, setAddRowsDialog] = useState(false);
  const [addRowsPayload, setAddRowsPayload] = useState("[\n  { }\n]");
  const [addColumnForm, setAddColumnForm] = useState({
    name: "",
    strategy: "constant",
    constant: "",
    source: "",
    arithmetic: { left: "", operator: "+", right: "" },
  });
  const [forecastForm, setForecastForm] = useState({
    dateColumn: "",
    valueColumn: "",
    sefColumns: [],
    horizon: 12,
    methods: [],
    ensembleMode: "weighted",
    mode: "append",
  });
  const [jobState, setJobState] = useState({ jobId: null, status: null, logs: [], result: null });
  const [auditReport, setAuditReport] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);
  const [editingCell, setEditingCell] = useState(null);
  const [isCellSaving, setIsCellSaving] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishForm, setPublishForm] = useState({ mode: "new", name: "", description: "", targetDatasetId: "" });
  const [isPublishing, setIsPublishing] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const jobPollRef = useRef(null);

  const schemaMap = useMemo(() => {
    const mapping = {};
    (tableColumns || []).forEach((column) => {
      mapping[column.name] = column;
    });
    return mapping;
  }, [tableColumns]);

  const visibleColumns = useMemo(() => {
    return columnOrder.filter((column) => !hiddenColumns.has(column));
  }, [columnOrder, hiddenColumns]);

  const displayedRows = tableRows;
  const visibleRowCount = displayedRows.length;
  const viewportHeight = 520;
  const totalHeight = visibleRowCount * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(tableScrollTop / ROW_HEIGHT) - 5);
  const endIndex = Math.min(visibleRowCount, Math.ceil((tableScrollTop + viewportHeight) / ROW_HEIGHT) + 5);
  const visibleSlice = displayedRows.slice(startIndex, endIndex);
  const paddingTop = startIndex * ROW_HEIGHT;
  const paddingBottom = totalHeight - paddingTop - visibleSlice.length * ROW_HEIGHT;

  const baseFilters = useMemo(() => filters.filter((filter) => filter && filter.column), [filters]);
  const timeWindowFilter = useMemo(() => {
    if (!timeWindow.column || (!timeWindow.start && !timeWindow.end)) {
      return null;
    }
    const filter = {
      column: timeWindow.column,
      kind: "date",
    };
    if (timeWindow.start && timeWindow.end) {
      filter.operator = "between";
      filter.value = timeWindow.start;
      filter.value_to = timeWindow.end;
    } else if (timeWindow.start) {
      filter.operator = "after";
      filter.value = timeWindow.start;
    } else if (timeWindow.end) {
      filter.operator = "before";
      filter.value = timeWindow.end;
    }
    return { ...filter, _isTimeWindow: true };
  }, [timeWindow]);
  const activeFilters = useMemo(() => {
    if (!timeWindowFilter) {
      return baseFilters;
    }
    return [...baseFilters, timeWindowFilter];
  }, [baseFilters, timeWindowFilter]);

  const numericColumns = useMemo(
    () =>
      (tableColumns || [])
        .filter((column) => column.type === "number" && !column.internal)
        .map((column) => column.name),
    [tableColumns]
  );
  const dateColumns = useMemo(
    () =>
      (tableColumns || [])
        .filter((column) => column.type === "date" && !column.internal)
        .map((column) => column.name),
    [tableColumns]
  );

  useEffect(() => {
    loadDatasets();
    return () => {
      if (jobPollRef.current) {
        clearInterval(jobPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedDataset) {
      setVersions([]);
      setSelectedVersion("");
      return;
    }
    loadVersions(selectedDataset);
  }, [selectedDataset]);

  useEffect(() => {
    setTimeWindow({ column: "", start: "", end: "" });
  }, [selectedDataset]);

  useEffect(() => {
    if (!selectedVersion || !selectedDataset) {
      setVersionMeta(null);
      setTableRows([]);
      return;
    }
    setRowSelection(new Set());
    setTableRows([]);
    setNextOffset(0);
    setCanLoadMore(false);
    setTableScrollTop(0);
    loadAudit(selectedDataset, selectedVersion);
    loadTableData({ reset: true });
  }, [selectedVersion]);

  useEffect(() => {
    if (!selectedVersion) return;
    setTableRows([]);
    setNextOffset(0);
    setCanLoadMore(false);
    setTableScrollTop(0);
    loadTableData({ reset: true });
  }, [JSON.stringify(activeFilters), JSON.stringify(sorting), searchValue]);

  useEffect(() => {
    if (!tableColumns.length || !selectedVersion) return;
    const nextOrder = tableColumns.filter((column) => !column.internal).map((column) => column.name);
    setColumnOrder(nextOrder);
    const nextHidden = new Set(tableColumns.filter((column) => column.internal).map((column) => column.name));
    setHiddenColumns(nextHidden);
    setColumnWidths({});
  }, [tableColumns, selectedVersion]);

  useEffect(() => {
    setSelectedColumns(new Set());
    setEditingCell(null);
  }, [selectedVersion]);

  useEffect(() => {
    if (!jobState.jobId) return;
    jobPollRef.current = setInterval(async () => {
      try {
        const status = await fetchLineykaJob(jobState.jobId);
        setJobState((prev) => ({ ...prev, status: status.status, logs: status.logs || [], result: status.result || null }));
        if (status.status === "completed") {
          clearInterval(jobPollRef.current);
          toast({ description: "Прогнозирование завершено" });
          if (status.result?.version_id) {
            await loadVersions(selectedDataset, status.result.version_id);
            setSelectedVersion(status.result.version_id);
          }
        } else if (status.status === "failed") {
          clearInterval(jobPollRef.current);
          toast({ variant: "destructive", description: status.error || "Задача завершилась ошибкой" });
        }
      } catch (error) {
        clearInterval(jobPollRef.current);
        toast({ variant: "destructive", description: error?.message || "Не удалось получить статус задачи" });
      }
    }, 2500);
    return () => {
      if (jobPollRef.current) {
        clearInterval(jobPollRef.current);
      }
    };
  }, [jobState.jobId, selectedDataset, toast]);

  const loadDatasets = async () => {
    try {
      const payload = await Dataset.list('-created_at');
      const items = Array.isArray(payload) ? payload : [];
      setDatasets(items);
      if (!selectedDataset && items.length) {
        setSelectedDataset(String(items[0].id));
        return;
      }
      if (
        selectedDataset &&
        !items.find((item) => String(item.id) === String(selectedDataset)) &&
        items.length
      ) {
        setSelectedDataset(String(items[0].id));
      }
    } catch (_error) {
      toast({ variant: 'destructive', description: 'Не удалось загрузить список наборов' });
    }
  };

  const loadVersions = async (datasetId, preferredVersionId) => {
    try {
      const payload = await listLineykaVersions(datasetId);
      const list = Array.isArray(payload?.items) ? payload.items : [];
      setVersions(list);
      const latest = preferredVersionId || list[list.length - 1]?.version_id;
      if (latest) {
        setSelectedVersion(latest);
      } else {
        setSelectedVersion("");
      }
    } catch (_error) {
      toast({ variant: "destructive", description: "Не удалось загрузить версии набора" });
    }
  };

  const loadAudit = async (datasetId, versionId) => {
    if (!datasetId || !versionId) return;
    setAuditError(null);
    try {
      const payload = await fetchLineykaAudit(datasetId, versionId);
      setAuditReport(payload);
    } catch (_error) {
      setAuditReport(null);
    }
  };

  const loadTableData = useCallback(
    async ({ reset } = {}) => {
      if (!selectedDataset || !selectedVersion) return;
      const basePayload = {
        limit: DEFAULT_PAGE_SIZE,
        offset: reset ? 0 : nextOffset,
        filters: activeFilters,
        sort: sorting,
        search: searchValue || undefined,
      };
      if (reset) {
        setIsTableLoading(true);
      } else {
        setIsAppending(true);
      }
      try {
        const payload = await queryLineykaData(selectedDataset, selectedVersion, basePayload);
        setVersionMeta(payload.version);
        setTableColumns(payload.columns || []);
        setTableSummary(payload.summary);
        setTotalRows(payload.total_rows || 0);
        setFilteredRows(payload.filtered_rows || 0);
        setTableRows((prev) => (reset ? payload.rows || [] : [...prev, ...(payload.rows || [])]));
        const nextCount = (reset ? 0 : nextOffset) + (payload.rows?.length || 0);
        setNextOffset(nextCount);
        setCanLoadMore((payload.filtered_rows || 0) > nextCount);
      } catch (error) {
        toast({ variant: "destructive", description: error?.message || "Не удалось загрузить данные" });
      } finally {
        setIsTableLoading(false);
        setIsAppending(false);
      }
    },
    [selectedDataset, selectedVersion, nextOffset, activeFilters, sorting, searchValue, toast]
  );

  const handleLoadMore = () => {
    if (!canLoadMore || isAppending) return;
    loadTableData({ reset: false });
  };

  const handleToggleRow = (row) => {
    setRowSelection((prev) => {
      const next = new Set(prev);
      if (next.has(row.__lineyka_row_id)) {
        next.delete(row.__lineyka_row_id);
      } else {
        next.add(row.__lineyka_row_id);
      }
      return next;
    });
  };

  const handleToggleAllRows = () => {
    if (rowSelection.size === visibleSlice.length) {
      setRowSelection(new Set());
    } else {
      const next = new Set();
      visibleSlice.forEach((row) => {
        if (row.__lineyka_row_id !== undefined) {
          next.add(row.__lineyka_row_id);
        }
      });
      setRowSelection(next);
    }
  };

  const handleSortToggle = (column) => {
    setSorting((prev) => {
      const existing = prev.find((item) => item.column === column);
      if (!existing) {
        return [{ column, direction: "asc" }];
      }
      if (existing.direction === "asc") {
        return [{ column, direction: "desc" }];
      }
      return [];
    });
  };

  const handleMoveColumn = (column, direction) => {
    setColumnOrder((prev) => {
      const index = prev.indexOf(column);
      if (index === -1) return prev;
      const targetIndex = direction === "left" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      next.splice(targetIndex, 0, removed);
      return next;
    });
  };

  const handleHideColumn = (column) => {
    setHiddenColumns((prev) => new Set(prev).add(column));
  };

  const handleShowColumn = (column) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      next.delete(column);
      return next;
    });
  };

  const handleColumnResize = (column, width) => {
    setColumnWidths((prev) => ({ ...prev, [column]: Math.max(80, width) }));
  };

  const handleApplyFilter = (column, filter) => {
    setFilters((prev) => {
      const next = prev.filter((item) => item.column !== column);
      if (filter) {
        next.push(filter);
      }
      return next;
    });
  };

  const handleResetFilters = () => {
    setFilters([]);
    setSearchValue("");
    setTimeWindow({ column: "", start: "", end: "" });
  };

  const handleToggleColumnSelection = (column, checked) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(column);
      } else {
        next.delete(column);
      }
      return next;
    });
  };

  const handleDeleteSelectedColumns = () => {
    if (!selectedColumns.size) {
      toast({ variant: "destructive", description: "Не выбраны столбцы для удаления" });
      return;
    }
    handleApplyOperation(
      [{ type: "delete_columns", columns: Array.from(selectedColumns) }],
      "Выбранные столбцы удалены"
    );
    setSelectedColumns(new Set());
  };

  const handleStartCellEdit = (row, column) => {
    if (!isVersionSelected) return;
    setEditingCell({ rowId: row.__lineyka_row_id, column, value: row[column] ?? "" });
  };

  const handleCellValueChange = (value) => {
    setEditingCell((prev) => (prev ? { ...prev, value } : prev));
  };

  const handleCancelCellEdit = () => {
    setEditingCell(null);
  };

  const handleCellEditSubmit = async () => {
    if (!editingCell || !selectedDataset || !selectedVersion || isCellSaving) return;
    setIsCellSaving(true);
    try {
      await applyLineykaOperations(selectedDataset, selectedVersion, [
        {
          type: "update_cells",
          updates: [{ row_id: editingCell.rowId, column: editingCell.column, value: editingCell.value }],
        },
      ]);
      toast({ description: "Значение обновлено" });
      setEditingCell(null);
      await loadVersions(selectedDataset);
    } catch (error) {
      toast({ variant: "destructive", description: error?.message || "Не удалось изменить значение" });
    } finally {
      setIsCellSaving(false);
    }
  };

  const handleCellInputKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCellEditSubmit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handleCancelCellEdit();
    }
  };

  const openPublishDialog = () => {
    setPublishForm({
      mode: "new",
      name: currentDataset ? `${currentDataset.name || "Набор"} (копия)` : "",
      description: "",
      targetDatasetId: selectedDataset || "",
    });
    setPublishDialogOpen(true);
  };

  const handlePublishVersion = async () => {
    if (!selectedDataset || !selectedVersion) return;
    setIsPublishing(true);
    try {
      const payload = {
        mode: publishForm.mode,
        name: publishForm.name?.trim() || undefined,
        description: publishForm.description?.trim() || undefined,
      };
      if (publishForm.mode === "update") {
        payload.target_dataset_id = publishForm.targetDatasetId || selectedDataset;
      }
      await publishLineykaVersion(selectedDataset, selectedVersion, payload);
      toast({
        description: publishForm.mode === "new" ? "Создан новый набор данных" : "Набор данных обновлён",
      });
      setPublishDialogOpen(false);
      await loadDatasets();
      if (publishForm.mode === "update") {
        await loadVersions(selectedDataset);
      }
    } catch (error) {
      toast({ variant: "destructive", description: error?.message || "Не удалось сохранить версию" });
    } finally {
      setIsPublishing(false);
    }
  };

  const openRenameDialog = () => {
    if (!currentDataset) return;
    setRenameValue(clampName(currentDataset.name || ""));
    setRenameDialogOpen(true);
  };

  const handleRenameDataset = async () => {
    if (!selectedDataset) return;
    const nextName = renameValue.trim();
    if (!nextName) {
      toast({ variant: "destructive", description: "Название не может быть пустым" });
      return;
    }
    try {
      await Dataset.update(selectedDataset, { name: nextName });
      toast({ description: "Название набора обновлено" });
      setRenameDialogOpen(false);
      await loadDatasets();
    } catch (error) {
      toast({ variant: "destructive", description: error?.message || "Не удалось переименовать набор" });
    }
  };

  const handleApplyOperation = async (operations, message) => {
    if (!selectedDataset || !selectedVersion) return;
    try {
      await applyLineykaOperations(selectedDataset, selectedVersion, operations);
      toast({ description: message || "Версия обновлена" });
      await loadVersions(selectedDataset);
    } catch (error) {
      toast({ variant: "destructive", description: error?.message || "Не удалось применить операцию" });
    }
  };

  const handleKeepFiltered = () => {
    if (!activeFilters.length) {
      toast({ variant: "destructive", description: "Сначала задайте фильтр" });
      return;
    }
    handleApplyOperation([{ type: "keep_filtered", filters: activeFilters }], "Создана версия с сохранением фильтра");
  };

  const handleDeleteFiltered = () => {
    if (!activeFilters.length) {
      toast({ variant: "destructive", description: "Нет активных фильтров" });
      return;
    }
    handleApplyOperation(
      [{ type: "delete_rows", mode: "filtered", filters: activeFilters }],
      "Строки, подпавшие под фильтр, удалены в новой версии"
    );
  };

  const handleDeleteSelectedRows = () => {
    if (!rowSelection.size) {
      toast({ variant: "destructive", description: "Не выбрано ни одной строки" });
      return;
    }
    handleApplyOperation(
      [{ type: "delete_rows", mode: "selected", row_ids: Array.from(rowSelection) }],
      "Выбранные строки удалены в новой версии"
    );
    setRowSelection(new Set());
  };

  const handleAddRows = () => {
    try {
      const parsed = JSON.parse(addRowsPayload);
      if (!Array.isArray(parsed)) {
        toast({ variant: "destructive", description: "Ожидается массив объектов" });
        return;
      }
      handleApplyOperation([{ type: "add_rows", rows: parsed }], "Добавлены новые строки");
      setAddRowsDialog(false);
    } catch (_error) {
      toast({ variant: "destructive", description: "Неверный формат JSON" });
    }
  };

  const handleAddColumn = () => {
    if (!addColumnForm.name.trim()) {
      toast({ variant: "destructive", description: "Укажите имя столбца" });
      return;
    }
    handleApplyOperation(
      [
        {
          type: "add_column",
          name: addColumnForm.name.trim(),
          strategy: addColumnForm.strategy,
          constant_value: addColumnForm.strategy === "constant" ? addColumnForm.constant : undefined,
          source_column: addColumnForm.strategy === "copy" ? addColumnForm.source : undefined,
          arithmetic:
            addColumnForm.strategy === "arithmetic"
              ? {
                  left: addColumnForm.arithmetic.left,
                  operator: addColumnForm.arithmetic.operator || "+",
                  right: addColumnForm.arithmetic.right,
                }
              : undefined,
        },
      ],
      "Столбец добавлен"
    );
    setAddColumnForm({
      name: "",
      strategy: "constant",
      constant: "",
      source: "",
      arithmetic: { left: "", operator: "+", right: "" },
    });
  };

  const handleAppendRows = () => {
    if (!appendForm.datasetId) {
      toast({ variant: "destructive", description: "Выберите источник" });
      return;
    }
    let mapping = {};
    if (appendForm.mapping.trim()) {
      appendForm.mapping.split(",").forEach((pair) => {
        const [target, source] = pair.split(":").map((value) => value.trim());
        if (target && source) {
          mapping[target] = source;
        }
      });
    }
    handleApplyOperation(
      [
        {
          type: "append_rows",
          source_dataset_id: appendForm.datasetId,
          source_version_id: appendForm.versionId || undefined,
          align_by_names: appendForm.align,
          column_mapping: mapping,
        },
      ],
      "Добавлены строки из другого набора"
    );
  };

  const handleJoinColumns = () => {
    if (!joinForm.datasetId || !joinForm.leftKey || !joinForm.rightKey) {
      toast({ variant: "destructive", description: "Укажите источник и ключи" });
      return;
    }
    const columns = joinForm.columns
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    handleApplyOperation(
      [
        {
          type: "join_columns",
          source_dataset_id: joinForm.datasetId,
          source_version_id: joinForm.versionId || undefined,
          left_on: joinForm.leftKey,
          right_on: joinForm.rightKey,
          columns,
          suffix: joinForm.suffix || "_src",
        },
      ],
      "Добавлены столбцы из другого набора"
    );
  };

  const handleDeleteColumn = (column) => {
    setPendingColumnDelete(column);
  };

  const confirmDeleteColumn = () => {
    if (!pendingColumnDelete) return;
    handleApplyOperation([{ type: "delete_columns", columns: [pendingColumnDelete] }], "Столбец удалён в новой версии");
    setPendingColumnDelete(null);
  };

  const handleForecast = async () => {
    if (!selectedDataset || !selectedVersion) {
      toast({ variant: "destructive", description: "Сначала выберите набор и версию" });
      return;
    }
    if (!forecastForm.dateColumn || !forecastForm.valueColumn) {
      toast({ variant: "destructive", description: "Выберите столбцы даты и значения" });
      return;
    }
    try {
      const response = await startLineykaForecastJob(selectedDataset, selectedVersion, {
        date_column: forecastForm.dateColumn,
        value_column: forecastForm.valueColumn,
        sef_columns: forecastForm.sefColumns,
        horizon: forecastForm.horizon,
        methods: forecastForm.methods,
        ensemble_mode: forecastForm.ensembleMode,
        mode: forecastForm.mode,
      });
      setJobState({ jobId: response.job_id, status: "queued", logs: [], result: null });
      toast({ description: "Задача прогнозирования поставлена в очередь" });
    } catch (error) {
      toast({ variant: "destructive", description: error?.message || "Не удалось запустить прогноз" });
    }
  };

  const handleAuditRun = async () => {
    if (!selectedDataset || !selectedVersion) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const report = await runLineykaAudit(selectedDataset, selectedVersion, {
        date_column: forecastForm.dateColumn || undefined,
        target_column: forecastForm.valueColumn || undefined,
      });
      setAuditReport(report.report);
      toast({ description: "Аудит данных завершён" });
    } catch (error) {
      setAuditError(error?.message || "Не удалось выполнить аудит");
      toast({ variant: "destructive", description: error?.message || "Ошибка при запуске аудита" });
    } finally {
      setAuditLoading(false);
    }
  };

  const handleRevert = async (targetVersionId) => {
    if (!targetVersionId) return;
    try {
      await revertLineykaVersion(selectedDataset, selectedVersion, targetVersionId, "revert-from-history");
      toast({ description: "Создана версия на основе истории" });
      await loadVersions(selectedDataset);
    } catch (error) {
      toast({ variant: "destructive", description: error?.message || "Не удалось откатиться" });
    }
  };

  const handleExport = async (format) => {
    if (!selectedDataset || !selectedVersion) {
      toast({ variant: "destructive", description: "Выберите набор и версию для экспорта" });
      return;
    }
    try {
      const payload = await exportLineykaVersion(selectedDataset, selectedVersion, format);
      triggerDownload(payload.blob, payload.filename);
    } catch (_error) {
      toast({ variant: "destructive", description: "Экспорт не удался" });
    }
  };

  const handleExportHistory = async () => {
    if (!selectedDataset) {
      toast({ variant: "destructive", description: "Сначала выберите набор" });
      return;
    }
    try {
      const payload = await exportLineykaHistory(selectedDataset);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      triggerDownload(blob, `lineyka-history-${selectedDataset}.json`);
    } catch (_error) {
      toast({ variant: "destructive", description: "Не удалось экспортировать историю" });
    }
  };

  const triggerDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const currentDataset = datasets.find((dataset) => String(dataset.id) === String(selectedDataset));
  const isDatasetSelected = Boolean(selectedDataset);
  const isVersionSelected = Boolean(selectedVersion);

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-3 text-center">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent">
          Линейка
        </h1>
        <p className="text-slate-600 max-w-3xl mx-auto">
          Управляйте версиями наборов данных, фильтрами и прогнозами в таблице с функциями, как в Excel. Все изменения
          фиксируются и доступны для отката.
        </p>
      </div>

      <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
        <CardContent className="p-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Набор данных</Label>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Select value={selectedDataset} onValueChange={setSelectedDataset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите набор" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={String(dataset.id)}>
                        {dataset.name || dataset.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={openRenameDialog} disabled={!isDatasetSelected}>
                  <Edit3 className="w-4 h-4 mr-2" />
                  Переименовать
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Версия</Label>
              <Select value={selectedVersion} onValueChange={setSelectedVersion}>
                <SelectTrigger>
                  <SelectValue placeholder="Текущая версия" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((version) => (
                    <SelectItem key={version.version_id} value={version.version_id}>
                      {version.version_id} · {new Date(version.created_at).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4 md:col-span-2">
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleExport("csv")}
                disabled={!isVersionSelected}
              >
                <Download className="w-4 h-4 mr-2" />
                Экспорт CSV
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => handleExport("xlsx")}
                disabled={!isVersionSelected}
              >
                <Upload className="w-4 h-4 mr-2" />
                Excel
              </Button>
              <Button className="w-full" variant="outline" onClick={handleExportHistory} disabled={!isDatasetSelected}>
                <History className="w-4 h-4 mr-2" />
                История
              </Button>
              <Button className="w-full" onClick={openPublishDialog} disabled={!isVersionSelected}>
                <Save className="w-4 h-4 mr-2" />
                Сохранить
              </Button>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4 text-sm">
            <StatCard label="Строк" value={filteredRows} description={`Всего: ${totalRows}`} icon={Database} />
            <StatCard
              label="Столбцов"
              value={tableColumns.filter((column) => !column.internal).length}
              description="Скрытые не учитываются"
              icon={Columns}
            />
            <StatCard
              label="Последняя операция"
              value={versionMeta?.operation?.type ? formatOperation(versionMeta.operation.type) : "—"}
              description={versionMeta?.operation?.summary ? summarizeOperation(versionMeta.operation.summary) : ""}
              icon={Activity}
            />
            <StatCard
              label="Аудит"
              value={auditReport ? auditReport.status?.toUpperCase() : "—"}
              description={auditReport?.reasons?.[0] || "Нет отчёта"}
              icon={Sparkles}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Filter className="w-5 h-5" /> Таблица и фильтры
            </CardTitle>
            <div className="flex flex-wrap gap-3">
              <Input
                placeholder="Быстрый поиск…"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                className="max-w-xs"
              />
              <div className="w-full max-w-xs">
                <TimeWindowSelector
                  columns={tableColumns}
                  value={timeWindow}
                  onChange={setTimeWindow}
                  label="Интервал по колонке"
                />
              </div>
              <Button variant="outline" onClick={handleResetFilters} disabled={!filters.length && !searchValue}>
                Сбросить фильтры
              </Button>
              <Button
                variant="outline"
                onClick={handleKeepFiltered}
                disabled={!activeFilters.length || !isVersionSelected}
                className="bg-emerald-50 text-emerald-700 border-emerald-200"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Оставить отфильтрованное
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={!activeFilters.length || !isVersionSelected}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить по фильтру
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить строки, подпавшие под фильтр?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Будет создана новая версия без отфильтрованных строк. История позволит откатиться.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteFiltered}>Удалить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={!rowSelection.size || !isVersionSelected}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Удалить выбранные ({rowSelection.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить выбранные строки?</AlertDialogTitle>
                    <AlertDialogDescription>
                      В новой версии таблицы {rowSelection.size} выбранных строк не будет. Действие фиксируется в истории.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelectedRows}>Удалить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={!selectedColumns.size || !isVersionSelected}>
                    <Columns className="w-4 h-4 mr-2" />
                    Удалить столбцы ({selectedColumns.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить выбранные столбцы?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Для {selectedColumns.size} столбцов будет создана новая версия без указанных полей. Действие
                      логируется и доступно для отката.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteSelectedColumns}>Удалить</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            {!!activeFilters.length && (
              <div className="flex flex-wrap gap-2">
                {activeFilters.map((filter) => (
                  <Badge
                    key={
                      filter._isTimeWindow
                        ? `time-window-${filter.column}`
                        : `${filter.column}-${filter.operator}-${filter.value}-${filter.value_to}`
                    }
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    <Filter className="w-3 h-3" />
                    <span>
                      {filter.column}: {formatFilterLabel(filter)}
                    </span>
                    <button
                      type="button"
                      className="text-slate-500 hover:text-slate-900"
                      onClick={() =>
                        filter._isTimeWindow
                          ? setTimeWindow({ column: "", start: "", end: "" })
                          : handleApplyFilter(filter.column, null)
                      }
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              ref={scrollContainerRef}
              className="border rounded-xl overflow-auto"
              style={{ maxHeight: viewportHeight }}
              onScroll={(event) => setTableScrollTop(event.currentTarget.scrollTop)}
            >
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white border-b z-10">
                  <tr>
                    <th className="px-3 py-2 w-12 text-left border-r">
                      <Checkbox
                        checked={rowSelection.size && rowSelection.size === visibleSlice.length}
                        onCheckedChange={handleToggleAllRows}
                      />
                    </th>
                    {visibleColumns.map((column) => {
                      const meta = schemaMap[column] || {};
                      const headerWidth = columnWidths[column] || 180;
                      const isSorted = sorting.find((item) => item.column === column);
                      return (
                        <th
                          key={column}
                          className="px-3 py-2 border-r border-slate-200"
                          style={{ width: headerWidth }}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedColumns.has(column)}
                              onCheckedChange={(checked) => handleToggleColumnSelection(column, Boolean(checked))}
                              className="h-4 w-4"
                            />
                            <button
                              type="button"
                              className="font-semibold text-slate-800 flex items-center gap-1"
                              onClick={() => handleSortToggle(column)}
                            >
                              {column}
                              {isSorted?.direction === "asc" && <ArrowUp className="w-3 h-3" />}
                              {isSorted?.direction === "desc" && <ArrowDown className="w-3 h-3" />}
                            </button>
                            <ColumnFilter
                              column={column}
                              type={meta.type}
                              filter={activeFilters.find((item) => item.column === column)}
                              onApply={handleApplyFilter}
                              datasetId={selectedDataset}
                              versionId={selectedVersion}
                            />
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start">
                                <DropdownMenuLabel>{column}</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleMoveColumn(column, "left")}>
                                  ⬅ Сместить влево
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleMoveColumn(column, "right")}>
                                  ➡ Сместить вправо
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleHideColumn(column)}>
                                  <Columns className="w-4 h-4 mr-2" />
                                  Скрыть столбец
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleDeleteColumn(column)} className="text-destructive">
                                  <Trash2 className="w-4 h-4 mr-2" />
                                  Удалить столбец
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                          <div
                            className="h-2 w-full cursor-col-resize border-r border-slate-300"
                            onMouseDown={(event) => startResize(event, column, handleColumnResize)}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paddingTop > 0 && (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} style={{ height: paddingTop }} />
                    </tr>
                  )}
                  {isTableLoading && (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="py-6 text-center text-slate-500">
                        <Loader2 className="w-5 h-5 mr-2 inline-block animate-spin" />
                        Загрузка данных…
                      </td>
                    </tr>
                  )}
                  {!isTableLoading && !visibleSlice.length && (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} className="py-8 text-center text-slate-500">
                        Нет строк для отображения. Попробуйте изменить фильтры.
                      </td>
                    </tr>
                  )}
                  {visibleSlice.map((row, index) => (
                    <tr key={`${row.__lineyka_row_id}-${index}`} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 border-r">
                        <Checkbox
                          checked={rowSelection.has(row.__lineyka_row_id)}
                          onCheckedChange={() => handleToggleRow(row)}
                        />
                      </td>
                      {visibleColumns.map((column) => {
                        const isEditing =
                          editingCell &&
                          editingCell.rowId === row.__lineyka_row_id &&
                          editingCell.column === column;
                        return (
                          <td
                            key={`${row.__lineyka_row_id}-${column}`}
                            className="px-3 py-2 border-r"
                            style={{ width: columnWidths[column] || 180 }}
                            onDoubleClick={
                              isEditing
                                ? undefined
                                : (event) => {
                                    event.stopPropagation();
                                    handleStartCellEdit(row, column);
                                  }
                            }
                          >
                            {isEditing ? (
                              <Input
                                value={editingCell.value ?? ""}
                                onChange={(event) => handleCellValueChange(event.target.value)}
                                onBlur={handleCellEditSubmit}
                                onKeyDown={handleCellInputKeyDown}
                                disabled={isCellSaving}
                                autoFocus
                                className="h-8 text-sm"
                              />
                            ) : (
                              <span className="block truncate">{formatCellValue(row[column])}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {paddingBottom > 0 && (
                    <tr>
                      <td colSpan={visibleColumns.length + 1} style={{ height: Math.max(0, paddingBottom) }} />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <div>
                Показано {tableRows.length} из {filteredRows} строк (всего {totalRows})
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleLoadMore} disabled={!canLoadMore || isAppending || !isVersionSelected}>
                  {isAppending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {canLoadMore ? "Загрузить ещё" : "Больше строк нет"}
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline">
                      <Columns className="w-4 h-4 mr-2" />
                      Колонки
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64">
                    <p className="text-sm font-semibold mb-2">Отображение столбцов</p>
                    <ScrollArea className="h-48 pr-2">
                      {(tableColumns || [])
                        .filter((column) => !column.internal)
                        .map((column) => (
                          <label key={column.name} className="flex items-center gap-2 py-1">
                            <Checkbox
                              checked={!hiddenColumns.has(column.name)}
                              onCheckedChange={(checked) =>
                                checked ? handleShowColumn(column.name) : handleHideColumn(column.name)
                              }
                            />
                            <span>{column.name}</span>
                          </label>
                        ))}
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <GitBranch className="w-5 h-5" />
                История версий
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[320px] overflow-auto">
              {versions
                .slice()
                .reverse()
                .map((version) => (
                  <div
                    key={version.version_id}
                    className="border rounded-lg p-3 flex items-center justify-between gap-3 bg-white/70"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{version.version_id}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(version.created_at).toLocaleString()} · {version.operation?.type || "—"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevert(version.version_id)}
                      disabled={version.version_id === selectedVersion}
                    >
                      <ArrowLeftRight className="w-4 h-4 mr-2" />
                      Откатиться
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Layers className="w-5 h-5" />
                Сводка набора
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div>
                <p className="font-semibold text-slate-900">Диапазон дат</p>
                <p>{tableSummary?.date_range ? `${tableSummary.date_range.start} — ${tableSummary.date_range.end}` : "—"}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Наибольшие пропуски</p>
                <ul className="space-y-1">
                  {(tableSummary?.missing || []).slice(0, 3).map((item) => (
                    <li key={item.column} className="flex justify-between">
                      <span>{item.column}</span>
                      <span>{Math.round(item.missing_ratio * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Sparkles className="w-5 h-5" />
                Аудит данных
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {auditError && (
                <Alert variant="destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <AlertDescription>{auditError}</AlertDescription>
                </Alert>
              )}
              {auditReport ? (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500">{new Date(auditReport.created_at).toLocaleString()}</p>
                  <div className="flex flex-wrap gap-2">
                    {(auditReport.reasons || []).map((reason, index) => (
                      <Badge key={`${reason}-${index}`} variant="outline">
                        {reason}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Для этой версии ещё нет отчёта аудита.</p>
              )}
              <Button onClick={handleAuditRun} disabled={auditLoading || !isVersionSelected}>
                {auditLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Запустить аудит
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <ListPlus className="w-5 h-5" />
              Операции со строками и столбцами
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs defaultValue="rows">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="rows">Строки</TabsTrigger>
                <TabsTrigger value="columns">Столбцы и объединения</TabsTrigger>
              </TabsList>
              <TabsContent value="rows" className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Dialog open={addRowsDialog} onOpenChange={setAddRowsDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" disabled={!isVersionSelected}>
                        <Plus className="w-4 h-4 mr-2" />
                        Добавить строки
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Добавление строк</DialogTitle>
                        <DialogDescription>Вставьте массив объектов, каждый объект соответствует строке.</DialogDescription>
                      </DialogHeader>
                      <Textarea
                        rows={6}
                        value={addRowsPayload}
                        onChange={(event) => setAddRowsPayload(event.target.value)}
                      />
                      <DialogFooter>
                        <Button onClick={handleAddRows} disabled={!isVersionSelected}>
                          Добавить
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" onClick={() => setRowSelection(new Set())} disabled={!rowSelection.size}>
                    Снять выделение ({rowSelection.size})
                  </Button>
                </div>
                {!rowSelection.size && (
                  <Alert>
                    <AlertDescription>Выделяйте строки чекбоксами в таблице, чтобы удалять точечно.</AlertDescription>
                  </Alert>
                )}
              </TabsContent>
              <TabsContent value="columns" className="space-y-5">
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Новый столбец</Label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        placeholder="Имя столбца"
                        value={addColumnForm.name}
                        onChange={(event) => setAddColumnForm((prev) => ({ ...prev, name: event.target.value }))}
                      />
                      <Select
                        value={addColumnForm.strategy}
                        onValueChange={(value) => setAddColumnForm((prev) => ({ ...prev, strategy: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Стратегия" />
                        </SelectTrigger>
                        <SelectContent>
                          {STRATEGIES.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {addColumnForm.strategy === "constant" && (
                      <Input
                        placeholder="Константное значение"
                        value={addColumnForm.constant}
                        onChange={(event) => setAddColumnForm((prev) => ({ ...prev, constant: event.target.value }))}
                      />
                    )}
                    {addColumnForm.strategy === "copy" && (
                      <Select
                        value={addColumnForm.source}
                        onValueChange={(value) => setAddColumnForm((prev) => ({ ...prev, source: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Столбец источник" />
                        </SelectTrigger>
                        <SelectContent>
                          {visibleColumns.map((column) => (
                            <SelectItem key={column} value={column}>
                              {column}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {addColumnForm.strategy === "arithmetic" && (
                      <div className="grid gap-2 md:grid-cols-3">
                        <Input
                          placeholder="Левый столбец"
                          value={addColumnForm.arithmetic.left}
                          onChange={(event) =>
                            setAddColumnForm((prev) => ({
                              ...prev,
                              arithmetic: { ...prev.arithmetic, left: event.target.value },
                            }))
                          }
                        />
                        <Select
                          value={addColumnForm.arithmetic.operator}
                          onValueChange={(value) =>
                            setAddColumnForm((prev) => ({
                              ...prev,
                              arithmetic: { ...prev.arithmetic, operator: value },
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="+">+</SelectItem>
                            <SelectItem value="-">-</SelectItem>
                            <SelectItem value="*">×</SelectItem>
                            <SelectItem value="/">÷</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Правый столбец"
                          value={addColumnForm.arithmetic.right}
                          onChange={(event) =>
                            setAddColumnForm((prev) => ({
                              ...prev,
                              arithmetic: { ...prev.arithmetic, right: event.target.value },
                            }))
                          }
                        />
                      </div>
                    )}
                    <Button onClick={handleAddColumn} disabled={!isVersionSelected}>
                      Создать столбец
                    </Button>
                  </div>
                  <div className="border-t pt-4 space-y-4">
                    <Label>Добавить строки из набора</Label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Select
                        value={appendForm.datasetId}
                        onValueChange={(value) => setAppendForm((prev) => ({ ...prev, datasetId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Набор" />
                        </SelectTrigger>
                        <SelectContent>
                          {datasets.map((dataset) => (
                            <SelectItem key={dataset.id} value={String(dataset.id)}>
                              {dataset.name || dataset.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Версия (опционально)"
                        value={appendForm.versionId}
                        onChange={(event) => setAppendForm((prev) => ({ ...prev, versionId: event.target.value }))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={appendForm.align}
                        onCheckedChange={(checked) => setAppendForm((prev) => ({ ...prev, align: Boolean(checked) }))}
                      />
                      <span>Сравнивать столбцы по именам</span>
                    </div>
                    <Input
                      placeholder="Маппинг колонок (target:source через запятую)"
                      value={appendForm.mapping}
                      onChange={(event) => setAppendForm((prev) => ({ ...prev, mapping: event.target.value }))}
                    />
                    <Button variant="outline" onClick={handleAppendRows} disabled={!isVersionSelected}>
                      <GitBranch className="w-4 h-4 mr-2" />
                      Добавить строки
                    </Button>
                  </div>

                  <div className="border-t pt-4 space-y-3">
                    <Label>Добавить столбцы через join</Label>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Select
                        value={joinForm.datasetId}
                        onValueChange={(value) => setJoinForm((prev) => ({ ...prev, datasetId: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Набор" />
                        </SelectTrigger>
                        <SelectContent>
                          {datasets.map((dataset) => (
                            <SelectItem key={dataset.id} value={String(dataset.id)}>
                              {dataset.name || dataset.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Версия"
                        value={joinForm.versionId}
                        onChange={(event) => setJoinForm((prev) => ({ ...prev, versionId: event.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      <Input
                        placeholder="Ключ текущего набора"
                        value={joinForm.leftKey}
                        onChange={(event) => setJoinForm((prev) => ({ ...prev, leftKey: event.target.value }))}
                      />
                      <Input
                        placeholder="Ключ источника"
                        value={joinForm.rightKey}
                        onChange={(event) => setJoinForm((prev) => ({ ...prev, rightKey: event.target.value }))}
                      />
                    </div>
                    <Input
                      placeholder="Столбцы через запятую"
                      value={joinForm.columns}
                      onChange={(event) => setJoinForm((prev) => ({ ...prev, columns: event.target.value }))}
                    />
                    <Input
                      placeholder="Суффикс при конфликтах"
                      value={joinForm.suffix}
                      onChange={(event) => setJoinForm((prev) => ({ ...prev, suffix: event.target.value }))}
                    />
                    <Button onClick={handleJoinColumns} disabled={!isVersionSelected}>
                      <ArrowLeftRight className="w-4 h-4 mr-2" />
                      Добавить столбцы
                    </Button>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="w-5 h-5" />
              Прогнозирование
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Столбец даты</Label>
                <Select
                  value={forecastForm.dateColumn}
                  onValueChange={(value) => setForecastForm((prev) => ({ ...prev, dateColumn: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    {dateColumns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Целевая колонка</Label>
                <Select
                  value={forecastForm.valueColumn}
                  onValueChange={(value) => setForecastForm((prev) => ({ ...prev, valueColumn: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите колонку" />
                  </SelectTrigger>
                  <SelectContent>
                    {numericColumns.map((column) => (
                      <SelectItem key={column} value={column}>
                        {column}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Колонки факторов</Label>
              <ScrollArea className="border rounded-lg p-2 h-28">
                <div className="space-y-1">
                  {numericColumns.map((column) => (
                    <label key={column} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={forecastForm.sefColumns.includes(column)}
                        onCheckedChange={(checked) => {
                          setForecastForm((prev) => ({
                            ...prev,
                            sefColumns: checked
                              ? [...prev.sefColumns, column]
                              : prev.sefColumns.filter((item) => item !== column),
                          }));
                        }}
                      />
                      {column}
                    </label>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <div className="space-y-2">
              <Label>Горизонт (месяцы): {forecastForm.horizon}</Label>
              <input
                type="range"
                min="1"
                max="36"
                value={forecastForm.horizon}
                onChange={(event) => setForecastForm((prev) => ({ ...prev, horizon: Number(event.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Режим</Label>
              <Tabs value={forecastForm.mode} onValueChange={(value) => setForecastForm((prev) => ({ ...prev, mode: value }))}>
                <TabsList className="grid grid-cols-2">
                  <TabsTrigger value="append">Добавить новые строки</TabsTrigger>
                  <TabsTrigger value="replace">Пересчитать прогноз</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <MethodPicker
              value={forecastForm.methods}
              onChange={(methods) => setForecastForm((prev) => ({ ...prev, methods }))}
              ensembleMode={forecastForm.ensembleMode}
              onEnsembleChange={(ensembleMode) => setForecastForm((prev) => ({ ...prev, ensembleMode }))}
            />
            <Button onClick={handleForecast} disabled={Boolean(jobState.jobId) || !isVersionSelected}>
              {jobState.jobId ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Прогноз в работе
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Рассчитать прогноз
                </>
              )}
            </Button>
            {jobState.jobId && (
              <div className="space-y-2 border rounded-lg p-3">
                <p className="text-sm font-semibold">Задача #{jobState.jobId}</p>
                <p className="text-xs text-slate-500">Статус: {jobState.status}</p>
                <div className="max-h-32 overflow-auto text-xs bg-slate-50 rounded p-2">
                  {(jobState.logs || []).map((log, index) => (
                    <div key={`${log.timestamp}-${index}`}>{log.message}</div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(pendingColumnDelete)} onOpenChange={(open) => !open && setPendingColumnDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить столбец {pendingColumnDelete}?</AlertDialogTitle>
            <AlertDialogDescription>
              Будет создана новая версия набора. Действие можно отменить через историю версий.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteColumn}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сохранить версию</DialogTitle>
            <DialogDescription>Создайте новый набор данных или обновите существующий</DialogDescription>
          </DialogHeader>
          <Tabs value={publishForm.mode} onValueChange={(value) => setPublishForm((prev) => ({ ...prev, mode: value }))}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="new">Новый набор</TabsTrigger>
              <TabsTrigger value="update">Обновить набор</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label>Название</Label>
                <Input
                  value={publishForm.name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) =>
                    setPublishForm((prev) => ({ ...prev, name: clampName(event.target.value) }))
                  }
                  placeholder={'Например, "Версия для прогноза"'}
                />
              </div>
              <div className="space-y-1">
                <Label>Описание</Label>
                <Textarea
                  value={publishForm.description}
                  onChange={(event) => setPublishForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Краткое примечание"
                />
              </div>
            </TabsContent>
            <TabsContent value="update" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label>Набор для обновления</Label>
                <Select
                  value={publishForm.targetDatasetId || selectedDataset || ""}
                  onValueChange={(value) => setPublishForm((prev) => ({ ...prev, targetDatasetId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите набор" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={String(dataset.id)}>
                        {dataset.name || dataset.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Новое название (опционально)</Label>
                <Input
                  value={publishForm.name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) =>
                    setPublishForm((prev) => ({ ...prev, name: clampName(event.target.value) }))
                  }
                  placeholder="Оставьте пустым, чтобы сохранить текущее"
                />
              </div>
              <div className="space-y-1">
                <Label>Описание</Label>
                <Textarea
                  value={publishForm.description}
                  onChange={(event) => setPublishForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Комментарий к изменению"
                />
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={handlePublishVersion}
              disabled={
                isPublishing ||
                !isVersionSelected ||
                (publishForm.mode === "update" && !(publishForm.targetDatasetId || selectedDataset))
              }
            >
              {isPublishing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать набор данных</DialogTitle>
            <DialogDescription>Новое название будет отображаться во всех вкладках</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Название</Label>
            <Input
              value={renameValue}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setRenameValue(clampName(event.target.value))}
              placeholder="Новое имя"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleRenameDataset} disabled={!renameValue.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

function StatCard({ label, value, description, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/70 p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 text-white flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs uppercase text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{value ?? "—"}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
    </div>
  );
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  if (typeof value === "number") {
    return new Intl.NumberFormat("ru-RU").format(value);
  }
  return String(value);
}

function formatFilterLabel(filter) {
  if (filter.kind === "categorical" && filter.values?.length) {
    return filter.values.join(", ");
  }
  if (filter.operator === "between") {
    return `${filter.value} — ${filter.value_to}`;
  }
  return filter.value ?? "—";
}

function formatOperation(type) {
  switch (type) {
    case "keep_filtered":
      return "Сохранён фильтр";
    case "delete_rows":
      return "Удалены строки";
    case "delete_columns":
      return "Удалены столбцы";
    case "add_rows":
      return "Добавлены строки";
    case "add_column":
      return "Добавлен столбец";
    case "append_rows":
      return "Объединение строк";
    case "join_columns":
      return "Объединение столбцов";
    case "forecast":
      return "Прогноз";
    default:
      return type || "—";
  }
}

function summarizeOperation(summary) {
  if (!summary) return "";
  if (summary.rows) {
    return `Строк: ${summary.rows}`;
  }
  if (summary.removed) {
    return `Удалено строк: ${summary.removed}`;
  }
  if (summary.rows_matched !== undefined) {
    return `Совпадений: ${summary.rows_matched}`;
  }
  return "";
}

function ColumnFilter({ column, type, filter, onApply, datasetId, versionId }) {
  const [open, setOpen] = useState(false);
  const [localFilter, setLocalFilter] = useState(filter);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLocalFilter(filter);
  }, [filter]);

  useEffect(() => {
    if (!open || type !== "categorical") return;
    let active = true;
    setLoading(true);
    fetchLineykaColumnValues(datasetId, versionId, column, { limit: 50 })
      .then((payload) => {
        if (!active) return;
        setOptions(Array.isArray(payload.items) ? payload.items : []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, type, datasetId, versionId, column]);

  const handleSubmit = () => {
    const hasValue =
      localFilter &&
      ((localFilter.kind === "categorical" && localFilter.values?.length) ||
        (localFilter.operator === "between"
          ? localFilter.value && localFilter.value_to
          : localFilter.value !== undefined && localFilter.value !== ""));
    onApply(column, hasValue ? { ...localFilter, column } : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7">
          <Filter className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-sm">{column}</p>
          {filter && (
            <Button variant="ghost" size="sm" onClick={() => setLocalFilter(null)}>
              Сбросить
            </Button>
          )}
        </div>
        {type === "text" && (
          <div className="space-y-2">
            <Select
              value={localFilter?.operator || "contains"}
              onValueChange={(value) => setLocalFilter((prev) => ({ ...(prev || {}), kind: "text", operator: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPERATORS.text.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Значение"
              value={localFilter?.value || ""}
              onChange={(event) =>
                setLocalFilter((prev) => ({ ...(prev || {}), kind: "text", value: event.target.value }))
              }
            />
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={Boolean(localFilter?.case_sensitive)}
                onCheckedChange={(checked) =>
                  setLocalFilter((prev) => ({ ...(prev || {}), case_sensitive: Boolean(checked) }))
                }
              />
              Чувствительно к регистру
            </div>
          </div>
        )}
        {type === "number" && (
          <div className="space-y-2">
            <Select
              value={localFilter?.operator || "equals"}
              onValueChange={(value) => setLocalFilter((prev) => ({ ...(prev || {}), kind: "number", operator: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPERATORS.number.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Значение"
              value={localFilter?.value || ""}
              onChange={(event) =>
                setLocalFilter((prev) => ({ ...(prev || {}), kind: "number", value: event.target.value }))
              }
            />
            {localFilter?.operator === "between" && (
              <Input
                type="number"
                placeholder="Второе значение"
                value={localFilter?.value_to || ""}
                onChange={(event) =>
                  setLocalFilter((prev) => ({ ...(prev || {}), value_to: event.target.value }))
                }
              />
            )}
          </div>
        )}
        {type === "date" && (
          <div className="space-y-2">
            <Select
              value={localFilter?.operator || "equals"}
              onValueChange={(value) => setLocalFilter((prev) => ({ ...(prev || {}), kind: "date", operator: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPERATORS.date.map((operator) => (
                  <SelectItem key={operator.value} value={operator.value}>
                    {operator.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={localFilter?.value || ""}
              onChange={(event) =>
                setLocalFilter((prev) => ({ ...(prev || {}), kind: "date", value: event.target.value }))
              }
            />
            {localFilter?.operator === "between" && (
              <Input
                type="date"
                value={localFilter?.value_to || ""}
                onChange={(event) =>
                  setLocalFilter((prev) => ({ ...(prev || {}), value_to: event.target.value }))
                }
              />
            )}
          </div>
        )}
        {type === "categorical" && (
          <div className="space-y-2">
            {loading ? (
              <p className="text-xs text-slate-500">Загрузка значений…</p>
            ) : (
              <ScrollArea className="h-40 border rounded-md p-2">
                <div className="space-y-1">
                  {options.map((option) => (
                    <label key={option.label} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={localFilter?.values?.includes(option.label)}
                        onCheckedChange={(checked) => {
                          const current = localFilter?.values || [];
                          setLocalFilter({
                            kind: "categorical",
                            column,
                            operator: "in",
                            values: checked
                              ? [...current, option.label]
                              : current.filter((value) => value !== option.label),
                          });
                        }}
                      />
                      {option.label} ({option.count})
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit}>Сохранить</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function startResize(event, column, onResize) {
  event.preventDefault();
  event.stopPropagation();
  const startX = event.clientX;
  const startWidth = event.currentTarget.parentElement?.offsetWidth || 180;
  const handleMove = (moveEvent) => {
    const delta = moveEvent.clientX - startX;
    onResize(column, startWidth + delta);
  };
  const handleUp = () => {
    document.removeEventListener("mousemove", handleMove);
    document.removeEventListener("mouseup", handleUp);
  };
  document.addEventListener("mousemove", handleMove);
  document.addEventListener("mouseup", handleUp);
}
