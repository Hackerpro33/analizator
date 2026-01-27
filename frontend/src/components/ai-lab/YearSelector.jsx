import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function YearSelector({ years = [], selectedYears = [], onToggle }) {
  if (!years.length) {
    return null;
  }

  const toggle = (year) => {
    if (onToggle) {
      onToggle(year);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Годы</h3>
        <Badge variant="outline">{selectedYears.length || 0}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {years.map((year) => {
          const active = selectedYears.includes(year);
          return (
            <Button
              key={year}
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              onClick={() => toggle(year)}
            >
              {year}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
