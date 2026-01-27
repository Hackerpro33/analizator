import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  Download,
  Search,
  Clock,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import { fetchSystemLogs, downloadSystemLogs } from "@/api/system";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext.jsx";
import AccessMessage from "@/components/auth/AccessMessage.jsx";

const LEVEL_META = {
  info: { icon: <Info className="w-4 h-4 text-blue-600" />, badge: "bg-blue-100 text-blue-700" },
  success: { icon: <CheckCircle className="w-4 h-4 text-green-600" />, badge: "bg-green-100 text-green-700" },
  warning: { icon: <AlertTriangle className="w-4 h-4 text-yellow-600" />, badge: "bg-yellow-100 text-yellow-700" },
  error: { icon: <AlertCircle className="w-4 h-4 text-red-600" />, badge: "bg-red-100 text-red-700" },
};

const CATEGORY_COLORS = {
  dataset: "bg-purple-100 text-purple-700",
  visualization: "bg-blue-100 text-blue-700",
  ai: "bg-orange-100 text-orange-700",
  system: "bg-gray-100 text-gray-700",
  forecast: "bg-green-100 text-green-700",
  user: "bg-indigo-100 text-indigo-700",
  map: "bg-teal-100 text-teal-700",
};

export default function SystemLogs() {
  const { hasRole } = useAuth();
  const allowed = hasRole(["admin", "security"]);
  const { toast } = useToast();

  const [rawLogs, setRawLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [logLevel, setLogLevel] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const canDownload = hasRole(["admin"]);

  const loadLogs = useCallback(async () => {
    if (!allowed) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetchSystemLogs({ limit: 500 });
      setRawLogs(response.items || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err?.message || "Не удалось загрузить логи");
      setRawLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filterLogs = useCallback(() => {
    let logs = rawLogs;
    if (logLevel !== "all") {
      logs = logs.filter((log) => (log.level || "").toLowerCase() === logLevel);
    }
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      logs = logs.filter(
        (log) =>
          (log.message || "").toLowerCase().includes(query) ||
          (log.logger || "").toLowerCase().includes(query) ||
          JSON.stringify(log.extra || {}).toLowerCase().includes(query)
      );
    }
    if (dateFilter !== "any") {
      const now = new Date();
      logs = logs.filter((log) => {
        const timestamp = log.timestamp ? new Date(log.timestamp) : null;
        if (!timestamp) return false;
        if (dateFilter === "today") {
          return timestamp.toDateString() === now.toDateString();
        }
        if (dateFilter === "week") {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return timestamp >= weekAgo;
        }
        if (dateFilter === "month") {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return timestamp >= monthAgo;
        }
        return true;
      });
    }
    setFilteredLogs(logs);
  }, [rawLogs, logLevel, searchTerm, dateFilter]);

  useEffect(() => {
    filterLogs();
  }, [filterLogs]);

  const exportLogs = async () => {
    try {
      await downloadSystemLogs({ level: logLevel, query: searchTerm });
      toast({ title: "Логи скачаны" });
    } catch (err) {
      toast({
        title: "Ошибка скачивания",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  const getLevelBadge = (level) => {
    const meta = LEVEL_META[level] || LEVEL_META.info;
    return <Badge className={`${meta.badge} text-xs font-medium`}>{level?.toUpperCase() || "INFO"}</Badge>;
  };

  const getCategoryColor = (category) => CATEGORY_COLORS[category] || "bg-gray-100 text-gray-700";

  const stats = useMemo(() => {
    const totals = { info: 0, success: 0, warning: 0, error: 0 };
    rawLogs.forEach((log) => {
      const level = (log.level || "info").toLowerCase();
      if (totals[level] !== undefined) {
        totals[level] += 1;
      }
    });
    return totals;
  }, [rawLogs]);

  if (!allowed) {
    return (
      <Card className="border border-slate-200">
        <CardContent className="py-10">
          <AccessMessage type="forbidden" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Логи системы</h2>
          <p className="text-sm text-slate-500">
            Просматривайте события, фильтруйте по уровню и экспортируйте полные журналы.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2" onClick={loadLogs} disabled={isLoading}>
            <RefreshCcw className="w-4 h-4" />
            Обновить
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportLogs} disabled={!canDownload || filteredLogs.length === 0}>
            <Download className="w-4 h-4" />
            Скачать логи
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {["info", "success", "warning", "error"].map((level) => (
          <Card key={level}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-slate-500 capitalize">
                  {LEVEL_META[level].icon}
                  {level}
                </div>
                <span className="text-2xl font-semibold">{stats[level]}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap gap-3 items-center justify-between">
            <span>Фильтры</span>
            {lastUpdated && <span className="text-sm text-slate-500">Обновлено: {lastUpdated.toLocaleTimeString("ru-RU")}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Поиск по сообщению, источнику или деталям"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="pl-10"
              />
            </div>
            <div>
              <Select value={logLevel} onValueChange={setLogLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="Уровень" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все уровни</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Сегодня</SelectItem>
                  <SelectItem value="week">Последние 7 дней</SelectItem>
                  <SelectItem value="month">Последние 30 дней</SelectItem>
                  <SelectItem value="any">За всё время</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="text-sm text-red-700 py-4 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-600" />
            Записи журнала
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-6">
              {[...Array(5)].map((_, idx) => (
                <Skeleton className="h-16 w-full" key={`log-skeleton-${idx}`} />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-500">Логи по выбранным критериям отсутствуют.</div>
          ) : (
            <ScrollArea className="max-h-[600px]">
              <div className="divide-y divide-slate-100">
                {filteredLogs.map((log, index) => {
                  const timestamp = log.timestamp ? new Date(log.timestamp) : null;
                  const level = (log.level || "info").toLowerCase();
                  return (
                    <div key={`${log.timestamp}-${index}`} className="p-4 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3 justify-between">
                        <div className="flex items-center gap-3">
                          {LEVEL_META[level]?.icon || LEVEL_META.info.icon}
                          {getLevelBadge(level)}
                          {timestamp && (
                            <div className="flex items-center gap-1 text-sm text-slate-500">
                              <Clock className="w-3 h-3" />
                              {timestamp.toLocaleString("ru-RU")}
                            </div>
                          )}
                        </div>
                        {log.logger && (
                          <Badge className={`text-xs ${getCategoryColor(log.logger)}`}>{log.logger}</Badge>
                        )}
                      </div>
                      <div className="text-base font-semibold text-slate-900">{log.message || "Без сообщения"}</div>
                      {log.extra && Object.keys(log.extra).length > 0 && (
                        <pre className="bg-slate-50 rounded-lg p-3 text-xs text-left whitespace-pre-wrap text-slate-600">
                          {JSON.stringify(log.extra, null, 2)}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
