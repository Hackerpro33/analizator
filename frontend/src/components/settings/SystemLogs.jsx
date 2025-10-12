import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Activity, 
  Download, 
  Search, 
  Filter, 
  Clock, 
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle
} from "lucide-react";

export default function SystemLogs() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [logLevel, setLogLevel] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');

  useEffect(() => {
    generateMockLogs();
  }, []);

  useEffect(() => {
    filterLogs();
  }, [searchTerm, logLevel, dateFilter, logs]);

  const generateMockLogs = () => {
    const mockLogs = [
      {
        id: 1,
        timestamp: new Date(Date.now() - 1000 * 60 * 5),
        level: 'info',
        category: 'dataset',
        message: 'Пользователь загрузил новый набор данных "Продажи Q4"',
        details: 'Файл: sales_q4.csv, Размер: 2.3MB, Строк: 15420'
      },
      {
        id: 2,
        timestamp: new Date(Date.now() - 1000 * 60 * 15),
        level: 'success',
        category: 'visualization',
        message: 'Создана новая визуализация "Тренды продаж"',
        details: 'Тип: line, Dataset: Продажи Q4, X-axis: date, Y-axis: revenue'
      },
      {
        id: 3,
        timestamp: new Date(Date.now() - 1000 * 60 * 30),
        level: 'warning',
        category: 'ai',
        message: 'Внешние модели отключены, используется локальный движок прогнозов',
        details: 'Причина: превышен лимит запросов, автоматическое восстановление через 1 час'
      },
      {
        id: 4,
        timestamp: new Date(Date.now() - 1000 * 60 * 45),
        level: 'error',
        category: 'system',
        message: 'Ошибка при обработке Excel файла',
        details: 'Файл: data.xlsx содержит неподдерживаемые макросы'
      },
      {
        id: 5,
        timestamp: new Date(Date.now() - 1000 * 60 * 60),
        level: 'info',
        category: 'forecast',
        message: 'Завершено создание прогноза на 30 дней',
        details: 'Dataset: Продажи Q4, Точность модели: 94.2%, Время обработки: 2.3с'
      },
      {
        id: 6,
        timestamp: new Date(Date.now() - 1000 * 60 * 90),
        level: 'info',
        category: 'user',
        message: 'Новый пользователь зарегистрировался в системе',
        details: 'Email: user@example.com, Роль: user, IP: 192.168.1.100'
      },
      {
        id: 7,
        timestamp: new Date(Date.now() - 1000 * 60 * 120),
        level: 'success',
        category: 'map',
        message: 'Создана географическая карта "Распределение клиентов"',
        details: 'Источник: dataset_customers, Точек данных: 1247'
      }
    ];
    setLogs(mockLogs);
  };

  const filterLogs = () => {
    let filtered = logs;

    // Фильтр по поиску
    if (searchTerm) {
      filtered = filtered.filter(log => 
        log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Фильтр по уровню
    if (logLevel !== 'all') {
      filtered = filtered.filter(log => log.level === logLevel);
    }

    // Фильтр по дате
    const now = new Date();
    switch (dateFilter) {
      case 'today':
        filtered = filtered.filter(log => {
          const logDate = new Date(log.timestamp);
          return logDate.toDateString() === now.toDateString();
        });
        break;
      case 'week':
        const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(log => new Date(log.timestamp) >= weekAgo);
        break;
      case 'month':
        const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(log => new Date(log.timestamp) >= monthAgo);
        break;
    }

    setFilteredLogs(filtered);
  };

  const exportLogs = () => {
    const logsText = filteredLogs.map(log => 
      `[${log.timestamp.toLocaleString()}] ${log.level.toUpperCase()} [${log.category}] ${log.message}\nДетали: ${log.details}\n`
    ).join('\n');
    
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `system_logs_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getLevelIcon = (level) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      default:
        return <Info className="w-4 h-4 text-blue-600" />;
    }
  };

  const getLevelBadge = (level) => {
    const variants = {
      error: 'bg-red-100 text-red-700',
      warning: 'bg-yellow-100 text-yellow-700',
      success: 'bg-green-100 text-green-700',
      info: 'bg-blue-100 text-blue-700'
    };
    
    return (
      <Badge className={`${variants[level]} text-xs font-medium`}>
        {level.toUpperCase()}
      </Badge>
    );
  };

  const getCategoryColor = (category) => {
    const colors = {
      dataset: 'bg-purple-100 text-purple-700',
      visualization: 'bg-blue-100 text-blue-700',
      ai: 'bg-orange-100 text-orange-700',
      system: 'bg-gray-100 text-gray-700',
      forecast: 'bg-green-100 text-green-700',
      user: 'bg-indigo-100 text-indigo-700',
      map: 'bg-teal-100 text-teal-700'
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      {/* Log Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {['info', 'success', 'warning', 'error'].map(level => {
          const count = logs.filter(log => log.level === level).length;
          return (
            <Card key={level}>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  {getLevelIcon(level)}
                </div>
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-slate-600 uppercase">{level}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters and Export */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-500" />
              Системные логи
            </CardTitle>
            <Button onClick={exportLogs} className="gap-2">
              <Download className="w-4 h-4" />
              Экспорт логов
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
              <Input
                placeholder="Поиск в логах..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={logLevel} onValueChange={setLogLevel}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Уровень логов" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все уровни</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateFilter} onValueChange={setDateFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Период" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Сегодня</SelectItem>
                <SelectItem value="week">Неделя</SelectItem>
                <SelectItem value="month">Месяц</SelectItem>
                <SelectItem value="all">Все время</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Logs List */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {filteredLogs.map(log => (
              <div key={log.id} className="border rounded-lg p-4 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    {getLevelIcon(log.level)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900">{log.message}</span>
                        <Badge className={`${getCategoryColor(log.category)} text-xs`}>
                          {log.category}
                        </Badge>
                      </div>
                      <div className="text-sm text-slate-600 mb-2">{log.details}</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="w-3 h-3" />
                        {log.timestamp.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {getLevelBadge(log.level)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredLogs.length === 0 && (
            <div className="text-center py-12">
              <Activity className="w-16 h-16 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Логи не найдены</h3>
              <p className="text-slate-500">Попробуйте изменить параметры фильтрации</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}