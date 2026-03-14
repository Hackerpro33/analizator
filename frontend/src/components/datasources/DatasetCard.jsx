import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  Calendar, 
  BarChart, 
  Eye, 
  Download,
  Tag
} from "lucide-react";
import { format } from "date-fns";

export default function DatasetCard({ dataset, onPreview }) {
  const getColumnTypeColor = (type) => {
    const colors = {
      string: "bg-blue-100 text-blue-700",
      number: "bg-emerald-100 text-emerald-700",
      date: "bg-purple-100 text-purple-700",
      boolean: "bg-orange-100 text-orange-700"
    };
    return colors[type] || "bg-gray-100 text-gray-700";
  };

  return (
    <Card className="group border-0 bg-white/70 backdrop-blur-xl shadow-lg hover:shadow-2xl transition-all duration-500 hover:scale-105">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg">
              <Database className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-safe-wrap">
                {dataset.name}
              </CardTitle>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="w-3 h-3" />
                {format(new Date(dataset.created_date), "d MMM yyyy")}
              </div>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600 line-clamp-2">
          {dataset.description || "Описание отсутствует"}
        </p>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <BarChart className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">{dataset.row_count || 0} строк</span>
            </div>
            <div className="flex items-center gap-1">
              <Database className="w-4 h-4 text-slate-400" />
              <span className="text-slate-600">{dataset.columns?.length || 0} колонок</span>
            </div>
          </div>
        </div>

        {dataset.columns && dataset.columns.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Типы столбцов
            </div>
            <div className="flex flex-wrap gap-1">
              {dataset.columns.slice(0, 3).map((column, index) => (
                <Badge 
                  key={index}
                  variant="secondary"
                  className={`text-xs ${getColumnTypeColor(column.type)}`}
                >
                  {column.type}
                </Badge>
              ))}
              {dataset.columns.length > 3 && (
                <Badge variant="secondary" className="text-xs bg-slate-100 text-slate-600">
                  +{dataset.columns.length - 3} ещё
                </Badge>
              )}
            </div>
          </div>
        )}

        {dataset.tags && dataset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {dataset.tags.map((tag, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                <Tag className="w-3 h-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPreview(dataset)}
            className="flex-1 gap-2 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600"
          >
            <Eye className="w-4 h-4" />
            Просмотр
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-600"
          >
            <Download className="w-4 h-4" />
            Экспорт
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
