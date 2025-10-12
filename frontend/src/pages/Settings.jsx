import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageContainer from "@/components/layout/PageContainer";
import {
  Settings as SettingsIcon,
  Trash2,
  Activity,
  Server,
  Download,
  Upload,
  Database,
  Cpu,
  HardDrive,
  Network,
  Clock,
  AlertTriangle,
  CheckCircle,
  User,
  ShieldCheck
} from "lucide-react";

import AIModelSettings from "../components/settings/AIModelSettings";
import BiasAuditCenter from "../components/settings/BiasAuditCenter";
import DataManagement from "../components/settings/DataManagement";
import SystemLogs from "../components/settings/SystemLogs";
import SystemMonitor from "../components/settings/SystemMonitor";
import UserManagement from "../components/settings/UserManagement";

export default function Settings() {
  const [activeTab, setActiveTab] = useState('modules');
  const [systemStats, setSystemStats] = useState({
    totalDatasets: 0,
    totalVisualizations: 0,
    storageUsed: 0,
    activeUsers: 1
  });

  const settingsTabs = [
    {
      id: 'modules',
      label: 'Локальные алгоритмы',
      icon: Cpu,
      description: 'Настройка локальных модулей анализа'
    },
    {
      id: 'data',
      label: 'Управление данными',
      icon: Database,
      description: 'Очистка и управление данными'
    },
    {
      id: 'logs',
      label: 'Логи системы',
      icon: Activity,
      description: 'Просмотр и экспорт логов'
    },
    {
      id: 'monitor',
      label: 'Мониторинг',
      icon: Server,
      description: 'Производительность и нагрузка'
    },
    {
      id: 'audit',
      label: 'Аудит алгоритмов',
      icon: ShieldCheck,
      description: 'Контроль смещения и расписания проверок'
    },
    {
      id: 'users',
      label: 'Пользователи',
      icon: User,
      description: 'Управление пользователями'
    }
  ];

  return (
    <PageContainer className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-blue-900 to-purple-900 bg-clip-text text-transparent heading-text">
            Настройки системы
          </h1>
          <p className="text-slate-600 text-lg max-w-2xl mx-auto elegant-text">
            Управляйте локальными алгоритмами, данными, мониторингом и другими параметрами системы
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center">
                <Database className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">{systemStats.totalDatasets}</div>
              <div className="text-sm text-slate-600 elegant-text">Наборов данных</div>
            </CardContent>
          </Card>
          
          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">{systemStats.totalVisualizations}</div>
              <div className="text-sm text-slate-600 elegant-text">Визуализаций</div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">{systemStats.storageUsed}GB</div>
              <div className="text-sm text-slate-600 elegant-text">Использовано места</div>
            </CardContent>
          </Card>

          <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-lg">
            <CardContent className="p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-orange-500 to-red-600 rounded-xl flex items-center justify-center">
                <User className="w-6 h-6 text-white" />
              </div>
              <div className="text-2xl font-bold text-slate-900 heading-text">{systemStats.activeUsers}</div>
              <div className="text-sm text-slate-600 elegant-text">Активных пользователей</div>
            </CardContent>
          </Card>
        </div>

        {/* Settings Tabs */}
        <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-8">
                {settingsTabs.map(tab => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex flex-col items-center gap-2 p-4 text-xs"
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="hidden sm:block">{tab.label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="modules" className="mt-0">
                <AIModelSettings />
              </TabsContent>

              <TabsContent value="data" className="mt-0">
                <DataManagement />
              </TabsContent>

              <TabsContent value="logs" className="mt-0">
                <SystemLogs />
              </TabsContent>

              <TabsContent value="monitor" className="mt-0">
                <SystemMonitor />
              </TabsContent>

              <TabsContent value="audit" className="mt-0">
                <BiasAuditCenter />
              </TabsContent>

              <TabsContent value="users" className="mt-0">
                <UserManagement />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
    </PageContainer>
  );
}