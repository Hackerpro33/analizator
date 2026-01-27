import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const METHODS = [
  { id: "sarima", label: "SARIMA" },
  { id: "ets", label: "ETS" },
  { id: "linear_regression", label: "Линейная регрессия" },
  { id: "lagged_regression", label: "Многофакторная (лаги)" },
  { id: "random_forest", label: "RandomForest" },
  { id: "gradient_boosting", label: "Gradient Boosting" },
];

export default function MethodPicker({ value = [], onChange, ensembleMode, onEnsembleChange }) {
  const toggle = (method) => {
    if (!onChange) return;
    if (value.includes(method)) {
      onChange(value.filter((item) => item !== method));
    } else {
      onChange([...value, method]);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-700">Методы</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {METHODS.map((method) => (
          <label key={method.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <Checkbox checked={value.includes(method.id)} onCheckedChange={() => toggle(method.id)} />
            <span>{method.label}</span>
          </label>
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-xs text-slate-500">Смешивание моделей</p>
        <Select value={ensembleMode} onValueChange={onEnsembleChange}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Без ансамбля" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Без смешивания</SelectItem>
            <SelectItem value="simple">Простое среднее</SelectItem>
            <SelectItem value="weighted">Взвешенное (по MAE)</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
