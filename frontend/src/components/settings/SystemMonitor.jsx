import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Server,
  Cpu,
  HardDrive,
  Network,
  Activity,
  Clock,
  Zap,
  Users,
  Database,
  Gauge,
  CheckCircle,
  Download,
  AlertTriangle,
} from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { fetchSystemMetrics } from "@/api/system";
import { useAuth } from "@/contexts/AuthContext.jsx";

const MAX_POINTS = 30;

const formatDuration = (seconds) => {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) {
    return `${days}д ${hours}ч ${minutes}м`;
  }
  if (hours) {
    return `${hours}ч ${minutes}м`;
  }
  return `${minutes} мин`;
};

const formatBytes = (bytes) => {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
};

export default function SystemMonitor() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(["admin"]);

  const [metrics, setMetrics] = useState(null);
  const [performanceData, setPerformanceData] = useState([]);
  const [networkData, setNetworkData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const payload = await fetchSystemMetrics();
      setMetrics(payload);

      const timeLabel = new Date(payload.timestamp * 1000).toLocaleTimeString("ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      setPerformanceData((prev) => {
        const next = [
          ...prev,
          {
            time: timeLabel,
            cpu: payload.cpu_percent,
            memory: payload.memory_percent,
          },
        ];
        return next.slice(-MAX_POINTS);
      });

      setNetworkData((prev) => {
        const next = [
          ...prev,
          {
            time: timeLabel,
            download: payload.network?.download_mbps ?? 0,
            upload: payload.network?.upload_mbps ?? 0,
          },
        ];
        return next.slice(-MAX_POINTS);
      });

      if (payload.psutil_available === false) {
        setError(
          "На сервере отсутствует модуль psutil, поэтому отображаются ограниченные данные. Установите psutil, чтобы видеть полные метрики."
        );
      } else {
        setError(null);
      }

      setIsLoading(false);
    } catch (err) {
      console.error("Failed to load system metrics", err);
      setError("Не удалось получить фактические метрики. Проверьте соединение или логи сервера.");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10000);
    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const psutilAvailable = metrics?.psutil_available !== false;

  const stats = useMemo(() => {
    const guard = (value) => (psutilAvailable && typeof value === "number" ? value : null);
    return {
      cpu: guard(metrics?.cpu_percent),
      memory: guard(metrics?.memory_percent),
      disk: guard(metrics?.disk_percent),
      networkDownload: metrics?.network?.download_mbps ?? 0,
      networkUpload: metrics?.network?.upload_mbps ?? 0,
      activeConnections: guard(metrics?.active_connections),
      uptime: psutilAvailable && metrics?.uptime_seconds != null ? formatDuration(metrics.uptime_seconds) : "—",
    };
  }, [metrics, psutilAvailable]);

  const databaseInfo = metrics?.database;
  const modelAlerts = metrics?.model_alerts || [];
  const networkLabel =
    metrics?.network && metrics.network.download_mbps !== undefined
      ? `${metrics.network.download_mbps.toFixed(1)} ↓ / ${metrics.network.upload_mbps.toFixed(1)} ↑ Mbps`
      : "—";

  const getStatusColor = (value) => {
    if (value == null) return "text-slate-500";
    if (value < 30) return "text-green-600";
    if (value < 70) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = (value) => {
    if (value == null) return "";
    if (value < 30) return "";
    if (value < 70) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-4 text-sm text-red-800">
            <AlertTriangle className="w-4 h-4" />
            {error}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-sm">CPU</span>
              </div>
              <span className={`text-sm font-bold ${getStatusColor(stats.cpu)}`}>
                {stats.cpu == null ? "—" : `${Math.round(stats.cpu)}%`}
              </span>
            </div>
            <Progress value={stats.cpu ?? 0} className={`h-2 ${getProgressColor(stats.cpu)}`} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-500" />
                <span className="font-medium text-sm">Память</span>
              </div>
              <span className={`text-sm font-bold ${getStatusColor(stats.memory)}`}>
                {stats.memory == null ? "—" : `${Math.round(stats.memory)}%`}
              </span>
            </div>
            <Progress value={stats.memory ?? 0} className={`h-2 ${getProgressColor(stats.memory)}`} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-500" />
                <span className="font-medium text-sm">Диск</span>
              </div>
              <span className={`text-sm font-bold ${getStatusColor(stats.disk)}`}>
                {stats.disk == null ? "—" : `${Math.round(stats.disk)}%`}
              </span>
            </div>
            <Progress value={stats.disk ?? 0} className={`h-2 ${getProgressColor(stats.disk)}`} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-orange-500" />
                <span className="font-medium text-sm">Сеть</span>
              </div>
              <span className="text-sm font-bold text-blue-600">{networkLabel}</span>
            </div>
            <Progress
              value={Math.min(stats.networkDownload + stats.networkUpload, 100)}
              className="h-2 bg-blue-100"
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gauge className="w-5 h-5 text-blue-500" />
              Производительность системы
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={performanceData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={(label) => `Время: ${label}`}
                    formatter={(value, name) =>
                      value == null
                        ? ["—", name === "cpu" ? "CPU" : "Память"]
                        : [`${Math.round(value)}%`, name === "cpu" ? "CPU" : "Память"]
                    }
                  />
                  <Line type="monotone" dataKey="cpu" stroke="#3B82F6" strokeWidth={2} dot={false} name="cpu" />
                  <Line type="monotone" dataKey="memory" stroke="#10B981" strokeWidth={2} dot={false} name="memory" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Network className="w-5 h-5 text-orange-500" />
              Сетевая активность
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={networkData}>
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    labelFormatter={(label) => `Время: ${label}`}
                    formatter={(value, name) => [`${value?.toFixed?.(1) ?? value} Mbps`, name === "download" ? "Загрузка" : "Отправка"]}
                  />
                  <Area type="monotone" dataKey="download" stackId="1" stroke="#F59E0B" fill="#FDE68A" name="download" />
                  <Area type="monotone" dataKey="upload" stackId="1" stroke="#EF4444" fill="#FECACA" name="upload" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5 text-slate-600" />
              Информация о системе
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-slate-600">Время работы</div>
                <div className="font-bold flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {stats.uptime}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Активные соединения</div>
                <div className="font-bold flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {stats.activeConnections ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Версия системы</div>
                <div className="font-bold">{metrics?.system?.version ?? "—"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Платформа</div>
                <div className="font-bold text-xs">{metrics?.system?.platform ?? "—"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-emerald-600" />
              База данных
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Статус</span>
                <Badge
                  className={`text-xs ${
                    databaseInfo?.status === "online" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  <CheckCircle className="w-3 h-3 mr-1" />
                  {databaseInfo?.status || "unknown"}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Размер БД</span>
                <span className="font-bold">{formatBytes(databaseInfo?.size_bytes)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Тип</span>
                <span className="font-bold">{databaseInfo?.type || "—"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Активные запросы</span>
                <span className="font-bold">{databaseInfo?.active_queries ?? "—"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Аналитические алерты
          </CardTitle>
        </CardHeader>
        <CardContent>
          {modelAlerts.length === 0 ? (
            <p className="text-sm text-slate-600">Последние расчёты моделей не создавали алертов.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {modelAlerts.map((alert) => (
                <li key={alert.id} className="rounded border border-amber-200 bg-amber-50/70 p-3">
                  <div className="flex items-center justify-between text-xs uppercase text-amber-600">
                    <span>{alert.alert_type}</span>
                    <span>{alert.severity}</span>
                  </div>
                  <div className="text-slate-800">{alert.message}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {alert.created_at ? new Date(alert.created_at).toLocaleString("ru-RU") : "—"} · run {alert.run_id || "—"}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Быстрые действия
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" className="gap-2" disabled={!isAdmin} title={!isAdmin ? "Доступно только администратору" : undefined}>
              <Server className="w-4 h-4" />
              Перезапуск сервера
            </Button>
            <Button variant="outline" className="gap-2">
              <Database className="w-4 h-4" />
              Очистить кэш
            </Button>
            <Button variant="outline" className="gap-2">
              <Activity className="w-4 h-4" />
              Создать снимок системы
            </Button>
            <Button variant="outline" className="gap-2" disabled={!isAdmin} title={!isAdmin ? "Доступно только администратору" : undefined}>
              <Download className="w-4 h-4" />
              Скачать логи
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
