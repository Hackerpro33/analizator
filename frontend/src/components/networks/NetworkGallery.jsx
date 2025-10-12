import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Network, Edit, Calendar, Share2 } from 'lucide-react';
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function NetworkGallery({ networks, isLoading, onEdit }) {
  return (
    <Card className="border-0 bg-white/50 backdrop-blur-xl shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-slate-900 heading-text">
          <Share2 className="w-5 h-5 text-cyan-500" />
          Ваши графы связей
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-48 w-full rounded-xl bg-slate-200" />
            ))}
          </div>
        ) : networks.length === 0 ? (
          <div className="text-center py-12">
            <Network className="w-16 h-16 mx-auto text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2 heading-text">Графы связей не созданы</h3>
            <p className="text-slate-500 elegant-text">Создайте свой первый граф для визуализации взаимосвязей в данных</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {networks.map((network) => (
              <Card key={network.id} className="group border-0 bg-white/70 backdrop-blur-sm shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <div className="h-32 bg-gradient-to-br from-cyan-100 via-blue-100 to-indigo-200 rounded-t-xl flex items-center justify-center relative overflow-hidden">
                  <Network className="w-12 h-12 text-cyan-600" />
                  <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/10 to-blue-500/10" />
                </div>
                <CardContent className="p-4">
                  <h3 className="font-bold text-slate-900 mb-2 group-hover:text-cyan-600 transition-colors heading-text">
                    {network.title}
                  </h3>
                  
                  <div className="flex items-center justify-between text-sm text-slate-500 mb-4 elegant-text">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(new Date(network.created_date), "d MMM yyyy")}
                    </div>
                    <Badge variant="secondary" className="text-xs elegant-text">
                      Граф связей
                    </Badge>
                  </div>

                  <div className="text-xs text-slate-600 mb-4 elegant-text">
                    {network.config?.selectedColumns?.length || 0} узлов • локальный анализ связей
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 hover:bg-cyan-50 hover:border-cyan-200 hover:text-cyan-600 elegant-text"
                    onClick={() => onEdit(network)}
                  >
                    <Edit className="w-4 h-4" />
                    Редактировать граф
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