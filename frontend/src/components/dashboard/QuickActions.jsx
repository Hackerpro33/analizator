
import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Upload, BarChart3, Map, TrendingUp, Plus, Sparkles } from "lucide-react";

export default function QuickActions() {
  const actions = [
    {
      title: "Загрузить данные",
      description: "Импорт файлов CSV или Excel",
      icon: Upload,
      href: createPageUrl("DataSources"),
      gradient: "from-emerald-500 to-teal-600",
      hoverGradient: "hover:from-emerald-600 hover:to-teal-700",
      kpiValue: "2.4 мин",
      kpiDescription: "среднее время подготовки"
    },
    {
      title: "Создать график",
      description: "Построить свои визуализации",
      icon: BarChart3,
      href: createPageUrl("Charts"),
      gradient: "from-blue-500 to-cyan-600",
      hoverGradient: "hover:from-blue-600 hover:to-cyan-700",
      kpiValue: "98%",
      kpiDescription: "точность аналитики"
    },
    {
      title: "Визуализация на карте",
      description: "Исследовать геоданные",
      icon: Map,
      href: createPageUrl("Maps"),
      gradient: "from-purple-500 to-indigo-600",
      hoverGradient: "hover:from-purple-600 hover:to-indigo-700",
      kpiValue: "12 слоёв",
      kpiDescription: "средняя детализация"
    },
    {
      title: "Локальное прогнозирование",
      description: "Предсказать будущие тренды без подключения к сети",
      icon: TrendingUp,
      href: createPageUrl("Forecasting"),
      gradient: "from-orange-500 to-red-600",
      hoverGradient: "hover:from-orange-600 hover:to-red-700",
      kpiValue: "+31%",
      kpiDescription: "прирост точности моделей"
    }
  ];

  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Быстрые действия
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {actions.map((action) => (
            <Link key={action.title} to={action.href}>
              <Button 
                variant="outline" 
                className={`h-auto p-6 w-full border-0 bg-gradient-to-r ${action.gradient} ${action.hoverGradient} text-white shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 group`}
              >
                <div className="flex flex-col items-center gap-3 text-center">
                  <div className="p-3 rounded-full bg-white/20 backdrop-blur-sm group-hover:bg-white/30 transition-colors">
                    <action.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{action.title}</div>
                    <div className="text-xs opacity-90 mt-1">{action.description}</div>
                  </div>
                  <div className="rounded-full bg-white/15 px-3 py-1 text-[10px] uppercase tracking-wide">
                    <span className="font-semibold text-white/90">{action.kpiValue}</span>
                    <span className="ml-1 text-white/70">{action.kpiDescription}</span>
                  </div>
                </div>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
