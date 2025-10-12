import React, { useState, useEffect } from 'react';
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
  Download
} from "lucide-react";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

export default function SystemMonitor() {
  const [systemStats, setSystemStats] = useState({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    activeConnections: 0,
    uptime: '2d 14h 32m'
  });

  const [performanceData, setPerformanceData] = useState([]);
  const [networkData, setNetworkData] = useState([]);

  useEffect(() => {
    // Симуляция обновления метрик в реальном времени
    const interval = setInterval(() => {
      updateSystemStats();
      updatePerformanceData();
      updateNetworkData();
    }, 2000);

    // Инициализация данных
    updateSystemStats();
    initializePerformanceData();
    initializeNetworkData();

    return () => clearInterval(interval);
  }, []);

  const updateSystemStats = () => {
    setSystemStats(prev => ({
      ...prev,
      cpu: Math.max(0, Math.min(100, prev.cpu + (Math.random() - 0.5) * 10)),
      memory: Math.max(0, Math.min(100, prev.memory + (Math.random() - 0.5) * 5)),
      disk: Math.max(0, Math.min(100, prev.disk + (Math.random() - 0.5) * 2)),
      network: Math.max(0, Math.min(100, Math.random() * 30 + 10)),
      activeConnections: Math.floor(Math.random() * 50) + 10
    }));
  };

  const initializePerformanceData = () => {
    const data = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      data.push({
        time: new Date(now - i * 60000).toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        cpu: Math.random() * 80 + 10,
        memory: Math.random() * 70 + 20,
        timestamp: now - i * 60000
      });
    }
    setPerformanceData(data);
  };

  const updatePerformanceData = () => {
    setPerformanceData(prev => {
      const newData = [...prev.slice(1)];
      newData.push({
        time: new Date().toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        cpu: systemStats.cpu,
        memory: systemStats.memory,
        timestamp: Date.now()
      });
      return newData;
    });
  };

  const initializeNetworkData = () => {
    const data = [];
    const now = Date.now();
    for (let i = 29; i >= 0; i--) {
      data.push({
        time: new Date(now - i * 60000).toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        download: Math.random() * 50 + 5,
        upload: Math.random() * 20 + 2,
        timestamp: now - i * 60000
      });
    }
    setNetworkData(data);
  };

  const updateNetworkData = () => {
    setNetworkData(prev => {
      const newData = [...prev.slice(1)];
      newData.push({
        time: new Date().toLocaleTimeString('ru-RU', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        download: Math.random() * 50 + 5,
        upload: Math.random() * 20 + 2,
        timestamp: Date.now()
      });
      return newData;
    });
  };

  const getStatusColor = (value) => {
    if (value < 30) return 'text-green-600';
    if (value < 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (value) => {
    if (value < 30) return '';
    if (value < 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* System Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-sm">CPU</span>
              </div>
              <span className={`text-sm font-bold ${getStatusColor(systemStats.cpu)}`}>
                {Math.round(systemStats.cpu)}%
              </span>
            </div>
            <Progress 
              value={systemStats.cpu} 
              className={`h-2 ${getProgressColor(systemStats.cpu)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-500" />
                <span className="font-medium text-sm">Память</span>
              </div>
              <span className={`text-sm font-bold ${getStatusColor(systemStats.memory)}`}>
                {Math.round(systemStats.memory)}%
              </span>
            </div>
            <Progress 
              value={systemStats.memory} 
              className={`h-2 ${getProgressColor(systemStats.memory)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-purple-500" />
                <span className="font-medium text-sm">Диск</span>
              </div>
              <span className={`text-sm font-bold ${getStatusColor(systemStats.disk)}`}>
                {Math.round(systemStats.disk)}%
              </span>
            </div>
            <Progress 
              value={systemStats.disk} 
              className={`h-2 ${getProgressColor(systemStats.disk)}`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Network className="w-4 h-4 text-orange-500" />
                <span className="font-medium text-sm">Сеть</span>
              </div>
              <span className="text-sm font-bold text-blue-600">
                {Math.round(systemStats.network)} Mbps
              </span>
            </div>
            <Progress value={(systemStats.network / 100) * 100} className="h-2" />
          </CardContent>
        </Card>
      </div>

      {/* Performance Charts */}
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
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    labelFormatter={(label) => `Время: ${label}`}
                    formatter={(value, name) => [
                      `${Math.round(value)}%`, 
                      name === 'cpu' ? 'CPU' : 'Память'
                    ]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="cpu" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    dot={false}
                    name="cpu"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="memory" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    dot={false}
                    name="memory"
                  />
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
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip 
                    labelFormatter={(label) => `Время: ${label}`}
                    formatter={(value, name) => [
                      `${Math.round(value)} Mbps`, 
                      name === 'download' ? 'Загрузка' : 'Отправка'
                    ]}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="download" 
                    stackId="1"
                    stroke="#F59E0B" 
                    fill="#FDE68A"
                    name="download"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="upload" 
                    stackId="1"
                    stroke="#EF4444" 
                    fill="#FECACA"
                    name="upload"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Information */}
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
                  {systemStats.uptime}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Активные соединения</div>
                <div className="font-bold flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {systemStats.activeConnections}
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Версия системы</div>
                <div className="font-bold">Анализатор 2.1.0</div>
              </div>
              <div>
                <div className="text-sm text-slate-600">Последнее обновление</div>
                <div className="font-bold">15 янв 2024</div>
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
                <Badge className="bg-green-100 text-green-700">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Подключена
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Размер БД</span>
                <span className="font-bold">127.3 MB</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Активные запросы</span>
                <span className="font-bold">4</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Последний бэкап</span>
                <span className="font-bold">Сегодня, 03:00</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            Быстрые действия
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Button variant="outline" className="gap-2">
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
            <Button variant="outline" className="gap-2">
              <Download className="w-4 h-4" />
              Скачать логи
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}