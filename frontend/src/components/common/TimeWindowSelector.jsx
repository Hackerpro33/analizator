import React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const normalizeColumns = (columns = []) => {
  if (Array.isArray(columns)) {
    return columns
      .map((column) => {
        if (typeof column === "string") {
          return { name: column, type: "" };
        }
        return column;
      })
      .filter((column) => column && column.name);
  }
  return [];
};

const detectInputType = (column) => {
  if (!column) {
    return "text";
  }
  const hint = (column.type || column.data_type || "").toLowerCase();
  if (hint.includes("date") || hint.includes("time")) {
    return "date";
  }
  return "text";
};

export default function TimeWindowSelector({ columns = [], value, onChange, label = "Интервал данных" }) {
  const normalizedColumns = normalizeColumns(columns);
  const selectedColumn = normalizedColumns.find((column) => column.name === value?.column);
  const inputType = detectInputType(selectedColumn);

  const handleChange = (patch) => {
    if (!onChange) return;
    onChange({
      column: value?.column || "",
      start: value?.start || "",
      end: value?.end || "",
      ...patch,
    });
  };

  const handleReset = () => {
    if (!onChange) return;
    onChange({ column: "", start: "", end: "" });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs uppercase text-slate-500">{label}</Label>
        {(value?.column || value?.start || value?.end) && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={handleReset}>
            Сбросить
          </Button>
        )}
      </div>
      <Select value={value?.column || ""} onValueChange={(column) => handleChange({ column })}>
        <SelectTrigger>
          <SelectValue placeholder="Колонка времени" />
        </SelectTrigger>
        <SelectContent>
          {normalizedColumns.map((column) => (
            <SelectItem key={column.name} value={column.name}>
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          type={inputType}
          placeholder={inputType === "date" ? "Начало" : "Значение от"}
          value={value?.start || ""}
          onChange={(event) => handleChange({ start: event.target.value })}
          disabled={!value?.column}
        />
        <Input
          type={inputType}
          placeholder={inputType === "date" ? "Конец" : "Значение до"}
          value={value?.end || ""}
          onChange={(event) => handleChange({ end: event.target.value })}
          disabled={!value?.column}
        />
      </div>
      <p className="text-xs text-slate-500">
        Можно задать только одно значение (тогда фильтр будет от/до), либо указать оба и получить диапазон.
      </p>
    </div>
  );
}
