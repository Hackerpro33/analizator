import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  buildCyberQuery,
  fetchCyberEvents,
  fetchCyberGraph,
  fetchCyberHeatmap,
  fetchCyberMap,
  fetchCyberSummary,
} from "@/api/cybersecurity";
import { buildWsUrl } from "@/api/http";

const TIMELINE_PAGE_SIZE = 160;

export function useCyberData(filters) {
  const [summary, setSummary] = useState(null);
  const [eventsData, setEventsData] = useState({ items: [], page: 1, pageSize: TIMELINE_PAGE_SIZE, total: 0, pages: 0 });
  const [mapData, setMapData] = useState({ connections: [] });
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  const [heatmapData, setHeatmapData] = useState({ mode: "segment_time", matrix: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const abortRef = useRef(0);
  const wsRef = useRef(null);
  const lastLiveRefreshRef = useRef(0);

  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      customRange: filters.customRange
        ? {
            from: filters.customRange.from,
            to: filters.customRange.to,
          }
        : null,
    }),
    [filters],
  );

  const fetchAll = useCallback(async () => {
    const token = Date.now();
    abortRef.current = token;
    setLoading(true);
    setError(null);
    try {
      const [summaryPayload, eventsPayload, mapPayload, graphPayload, heatmapPayload] = await Promise.all([
        fetchCyberSummary(normalizedFilters),
        fetchCyberEvents(normalizedFilters, { page: 1, pageSize: TIMELINE_PAGE_SIZE }),
        fetchCyberMap(normalizedFilters),
        fetchCyberGraph(normalizedFilters, { limitNodes: 120, limitEdges: 160 }),
        fetchCyberHeatmap(normalizedFilters),
      ]);
      if (abortRef.current !== token) {
        return;
      }
      setSummary(summaryPayload);
      setEventsData({
        items: eventsPayload.items ?? [],
        page: eventsPayload.page ?? 1,
        pageSize: eventsPayload.pageSize ?? TIMELINE_PAGE_SIZE,
        total: eventsPayload.total ?? eventsPayload.items?.length ?? 0,
        pages: eventsPayload.pages ?? 1,
      });
      setMapData(mapPayload ?? { connections: [] });
      setGraphData(graphPayload ?? { nodes: [], edges: [] });
      setHeatmapData(heatmapPayload ?? { mode: "segment_time", matrix: [] });
    } catch (err) {
      if (abortRef.current !== token) {
        return;
      }
      setError(err?.message || "Не удалось загрузить данные");
    } finally {
      if (abortRef.current === token) {
        setLoading(false);
      }
    }
  }, [normalizedFilters, TIMELINE_PAGE_SIZE]);

  useEffect(() => {
    fetchAll();
    return () => {
      abortRef.current += 1;
    };
  }, [fetchAll, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!filters.live) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return undefined;
    }
    const query = buildCyberQuery(normalizedFilters);
    const url = buildWsUrl(`/cyber/live${query ? `?${query}` : ""}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.summary) {
          setSummary(payload.summary);
        }
        if (Array.isArray(payload.events) && payload.events.length) {
          setEventsData((prev) => {
            const seen = new Set(prev.items.map((item) => item.id));
            const fresh = payload.events.filter((eventItem) => eventItem?.id && !seen.has(eventItem.id));
            if (!fresh.length) {
              return prev;
            }
            const items = [...fresh, ...prev.items].slice(0, prev.pageSize ?? 120);
            return { ...prev, items };
          });
        }
        const now = Date.now();
        if (now - lastLiveRefreshRef.current > 15000) {
          lastLiveRefreshRef.current = now;
          refresh();
        }
      } catch {
        // ignore malformed payloads
      }
    };
    ws.onerror = () => {
      refresh();
    };
    ws.onclose = () => {
      wsRef.current = null;
    };
    return () => {
      ws.close();
    };
  }, [filters.live, normalizedFilters, refresh]);

  return {
    summary,
    events: eventsData,
    map: mapData,
    graph: graphData,
    heatmap: heatmapData,
    loading,
    error,
    refresh,
  };
}
