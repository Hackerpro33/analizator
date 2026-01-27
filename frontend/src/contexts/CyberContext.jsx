import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const DEFAULT_FILTERS = {
  timeRange: "1h",
  customRange: null,
  severity: ["low", "medium", "high", "critical"],
  segments: [],
  sources: [],
  eventTypes: [],
  phases: [],
  scenarioId: "",
  runId: "",
  search: "",
  live: false,
};

const CyberContext = createContext(null);

export function CyberProvider({ children }) {
  const [filters, setFilters] = useState(() => ({ ...DEFAULT_FILTERS }));
  const [selection, setSelection] = useState(null);

  const updateFilters = useCallback((patch) => {
    setFilters((prev) => {
      const nextPatch = typeof patch === "function" ? patch(prev) : patch;
      return { ...prev, ...nextPatch };
    });
  }, []);

  const value = useMemo(
    () => ({
      filters,
      updateFilters,
      selection,
      setSelection,
      resetSelection: () => setSelection(null),
      resetFilters: () => setFilters({ ...DEFAULT_FILTERS }),
    }),
    [filters, selection, updateFilters],
  );

  return <CyberContext.Provider value={value}>{children}</CyberContext.Provider>;
}

export function useCyberContext() {
  const context = useContext(CyberContext);
  if (!context) {
    throw new Error("useCyberContext must be used within CyberProvider");
  }
  return context;
}
