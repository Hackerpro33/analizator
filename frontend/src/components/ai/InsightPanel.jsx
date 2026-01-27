import React from "react";
import { Brain, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatScore(model) {
  if (!model || !model.metrics) return "—";
  if (model.task_type === "regression") {
    const { r2 } = model.metrics;
    return r2 !== undefined ? r2.toFixed(2) : "—";
  }
  return formatPercent(model.metrics.f1_weighted ?? model.metrics.accuracy);
}

function formatTimestamp(value) {
  if (!value && value !== 0) {
    return "—";
  }
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function AIInsightPanel({ insights, isLoading, onRefresh }) {
  const highlight = insights?.highlight;
  const recommendations = insights?.recommendations ?? [];
  const models = insights?.models ?? [];

  return (
    <Card className="border-none shadow-lg bg-gradient-to-br from-white to-slate-50">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white flex items-center justify-center shadow-md">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl font-semibold">ИИ-инсайты</CardTitle>
            <p className="text-sm text-slate-500">Обученные модели и их рекомендации</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Обновить
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading && (
          <div className="text-sm text-slate-500 animate-pulse">Загружаем последние предсказания...</div>
        )}

        {!isLoading && !highlight && (
          <div className="rounded-lg bg-slate-100 border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            Пока нет обученных моделей. Обучите модель в разделе «ИИ-лаборатория», чтобы включить автоматические подсказки.
          </div>
        )}

        {highlight && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">Активная модель</p>
                <h3 className="text-lg font-semibold text-slate-900">{highlight.name}</h3>
                <p className="text-sm text-slate-500 truncate">
                  {highlight.dataset_name || "Неизвестный набор"} • {highlight.algorithm}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase text-slate-500">Качество</p>
                <p className="text-2xl font-semibold text-blue-600">{formatScore(highlight)}</p>
                <p className="text-xs text-slate-500">
                  обновлено {formatTimestamp(highlight.updated_date || highlight.updated_at)}
                </p>
              </div>
            </div>
            {highlight.latest_inference?.summary && (
              <div className="mt-4 flex flex-wrap gap-2">
                {Object.entries(highlight.latest_inference.summary).map(([label, value]) => (
                  <Badge key={label} variant="secondary" className="bg-blue-50 text-blue-700">
                    <Sparkles className="w-3.5 h-3.5 mr-1" />
                    {label}: {formatPercent(value)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {Boolean(recommendations.length) && (
          <div>
            <p className="text-xs uppercase text-slate-500 mb-2">Рекомендации</p>
            <ul className="space-y-2">
              {recommendations.map((item, index) => (
                <li key={`${item}-${index}`} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {models.length > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-600">Последние модели</p>
                <span className="text-xs text-slate-400">{models.length} активных</span>
              </div>
              <div className="space-y-2">
                {models.slice(0, 3).map((model) => (
                  <div
                    key={model.id}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{model.name}</p>
                      <p className="text-xs text-slate-500">
                        {model.dataset || "—"} • {model.algorithm}
                      </p>
                    </div>
                    <Badge variant="outline">{formatScore(model)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
