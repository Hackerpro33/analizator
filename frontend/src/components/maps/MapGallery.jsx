import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Edit, Map, Calendar, Globe } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";

const overlayLabels = {
  none: "Стандартный",
  heatmap: "Тепловая карта",
  clusters: "Кластеры",
  forecast: "Прогноз",
};

export default function MapGallery({ visualizations, isLoading, onEdit }) {
  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900">
          <Globe className="w-5 h-5 text-purple-500" />
          Ваши карты
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : visualizations.length === 0 ? (
          <div className="text-center py-12">
            <Map className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Карты еще не созданы</h3>
            <p className="text-slate-500">Создайте свою первую карту для визуализации географических данных</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visualizations.map((viz) => (
              <Card
                key={viz.id}
                className="group flex h-full flex-col overflow-hidden border-0 bg-white/70 backdrop-blur-sm shadow-lg transition-all hover:-translate-y-1 hover:shadow-2xl"
              >
                <div className="flex h-28 items-center justify-center bg-gradient-to-br from-purple-100 via-indigo-100 to-blue-100">
                  <Map className="h-10 w-10 text-purple-500 transition-transform duration-300 group-hover:scale-110" />
                </div>
                <CardContent className="flex flex-1 flex-col p-5">
                  <div className="flex-1 space-y-3">
                    <h3 className="font-bold text-slate-900 transition-colors group-hover:text-purple-600">
                      {viz.title || "Без названия"}
                    </h3>
                    <div className="flex items-center justify-between text-sm text-slate-500">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(viz.created_date), "dd MMM yyyy")}
                      </div>
                      {viz.config?.dataset_id && (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                          {viz.config.dataset_id === 'sample' ? 'Образец' : viz.config.dataset_id}
                        </span>
                      )}
                    </div>
                    {viz.config?.overlay_type && (
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        Режим: {overlayLabels[viz.config.overlay_type] || viz.config.overlay_type}
                      </div>
                    )}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-6 w-full gap-2 hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600"
                    onClick={() => onEdit(viz)}
                  >
                    <Edit className="h-4 w-4" />
                    Настроить карту
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}