import React, {
  useMemo,
  useState,
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
} from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { buildNetworkGraph } from "@/utils/localAnalysis";
import { attachDegrees, calculateNodePositions } from "@/lib/networkUtils";
import { Link2, AlertTriangle } from "lucide-react";

const CLUSTER_WIDTH = 360;
const CLUSTER_HEIGHT = 280;
const CLUSTER_PADDING = 96;
const NODE_RADIUS = 18;
const DATASET_COLORS = [
  "#0ea5e9",
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#14b8a6",
  "#e11d48",
  "#a855f7",
  "#84cc16",
  "#06b6d4",
];

function buildGraphsFromDatasets(datasets = []) {
  return datasets.map((dataset) => {
    const numericColumns = (dataset?.columns || []).filter((column) => column.type === "number");
    const hasSample = Array.isArray(dataset?.sample_data) && dataset.sample_data.length > 0;

    let graphData = {
      nodes: [],
      links: [],
      metrics: null,
    };

    let warning = "";

    if (numericColumns.length < 2) {
      warning = "Недостаточно числовых столбцов для построения связей";
    } else if (!hasSample) {
      warning = "Нет примеров данных — связи сложно оценить";
    }

    let nodeMetrics = [];
    try {
      if (numericColumns.length >= 2) {
        graphData = buildNetworkGraph({
          datasetName: dataset?.name ?? "Набор данных",
          columns: dataset?.columns ?? [],
          rows: dataset?.sample_data ?? [],
          graphType: "general",
        });
        nodeMetrics = Array.isArray(graphData?.node_metrics) ? graphData.node_metrics : [];
      }
    } catch (error) {
      console.error("Не удалось построить локальный граф", error);
      warning = "Ошибка локального анализа — проверьте данные";
    }

    const metricMap = nodeMetrics.reduce((map, metric) => {
      map[metric.node] = metric;
      return map;
    }, {});

    const enrichedNodes = (graphData?.nodes ?? []).map((node) => {
      const metrics = metricMap[node.id];
      return {
        ...node,
        degree: metrics?.degree ?? node.degree ?? 0,
        strength: metrics?.strength ?? node.strength ?? 0,
      };
    });

    const nodesWithDegree = attachDegrees(enrichedNodes, graphData?.links ?? []);
    const layoutNodes = calculateNodePositions(
      nodesWithDegree,
      "force",
      CLUSTER_WIDTH,
      CLUSTER_HEIGHT,
    ).map((node) => ({
      ...node,
      layoutX: Math.min(Math.max(node.x, NODE_RADIUS * 1.5), CLUSTER_WIDTH - NODE_RADIUS * 1.5),
      layoutY: Math.min(Math.max(node.y, NODE_RADIUS * 1.5), CLUSTER_HEIGHT - NODE_RADIUS * 1.5),
    }));

    return {
      datasetId: dataset?.id ?? `dataset-${dataset?.name}`,
      datasetName: dataset?.name ?? "Неизвестный набор",
      nodes: layoutNodes,
      links: graphData?.links ?? [],
      warning,
    };
  });
}

const generateConnectionId = (from, to) => {
  const base = `${from.datasetId}:${from.nodeId}-->${to.datasetId}:${to.nodeId}`;
  return base.toLowerCase();
};

export default function UnifiedNetworkWorkspace({ datasets }) {
  const graphs = useMemo(() => buildGraphsFromDatasets(datasets), [datasets]);
  const wrapperRef = useRef(null);
  const [workspaceWidth, setWorkspaceWidth] = useState(1200);
  const [nodePositions, setNodePositions] = useState({});
  const [connections, setConnections] = useState([]);
  const dragRef = useRef(null);

  useLayoutEffect(() => {
    const measure = () => {
      if (wrapperRef.current) {
        setWorkspaceWidth(wrapperRef.current.clientWidth || 1200);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const layoutMeta = useMemo(() => {
    if (!graphs.length) {
      return { anchors: {}, rows: 0, columns: 1, height: 480 };
    }
    const padding = CLUSTER_PADDING;
    const availableWidth = Math.max(workspaceWidth - padding, CLUSTER_WIDTH);
    const columns = Math.max(1, Math.floor(availableWidth / (CLUSTER_WIDTH + padding)));
    const anchors = {};
    graphs.forEach((graph, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      anchors[graph.datasetId] = {
        x: padding + column * (CLUSTER_WIDTH + padding) + CLUSTER_WIDTH / 2,
        y: padding + row * (CLUSTER_HEIGHT + padding) + CLUSTER_HEIGHT / 2,
      };
    });
    const rows = Math.ceil(graphs.length / columns) || 1;
    const height = rows * (CLUSTER_HEIGHT + padding) + padding;
    return { anchors, rows, columns, height };
  }, [graphs, workspaceWidth]);

  useEffect(() => {
    if (!graphs.length) {
      setNodePositions({});
      return;
    }
    setNodePositions((previous) => {
      const nextPositions = {};
      graphs.forEach((graph) => {
        const anchor = layoutMeta.anchors[graph.datasetId];
        if (!anchor) {
          return;
        }
        const offsetX = anchor.x - CLUSTER_WIDTH / 2;
        const offsetY = anchor.y - CLUSTER_HEIGHT / 2;
        graph.nodes.forEach((node) => {
          const key = `${graph.datasetId}:${node.id}`;
          const defaultPosition = {
            x: offsetX + (node.layoutX ?? CLUSTER_WIDTH / 2),
            y: offsetY + (node.layoutY ?? CLUSTER_HEIGHT / 2),
          };
          nextPositions[key] = previous[key] ?? defaultPosition;
        });
      });
      return nextPositions;
    });
  }, [graphs, layoutMeta]);

  useEffect(() => {
    setConnections((prev) =>
      prev.filter(
        (connection) =>
          graphs.some((graph) => graph.datasetId === connection.from.datasetId) &&
          graphs.some((graph) => graph.datasetId === connection.to.datasetId),
      ),
    );
  }, [graphs]);

  const handlePointerMove = useCallback((event) => {
    if (!dragRef.current) return;
    const { nodeKey, startX, startY, origin } = dragRef.current;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    setNodePositions((prev) => ({
      ...prev,
      [nodeKey]: {
        x: origin.x + deltaX,
        y: origin.y + deltaY,
      },
    }));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const handleNodePointerDown = useCallback(
    (event, nodeKey) => {
      event.preventDefault();
      event.stopPropagation();
      const origin = nodePositions[nodeKey] ?? { x: 0, y: 0 };
      dragRef.current = {
        nodeKey,
        startX: event.clientX,
        startY: event.clientY,
        origin,
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [nodePositions, handlePointerMove, handlePointerUp],
  );

  const datasetColorMap = useMemo(() => {
    return graphs.reduce((map, graph, index) => {
      map[graph.datasetId] = DATASET_COLORS[index % DATASET_COLORS.length];
      return map;
    }, {});
  }, [graphs]);

  const allNodes = useMemo(() => {
    return graphs.flatMap((graph) =>
      graph.nodes.map((node) => ({
        datasetId: graph.datasetId,
        datasetName: graph.datasetName,
        nodeId: node.id,
        degree: node.degree ?? 0,
        warning: graph.warning,
      })),
    );
  }, [graphs]);

  const internalLinks = useMemo(() => {
    return graphs.flatMap((graph, graphIndex) => {
      const color = datasetColorMap[graph.datasetId] ?? "#94a3b8";
      return graph.links.map((link, index) => {
        const sourceId = typeof link.source === "object" ? link.source.id : link.source;
        const targetId = typeof link.target === "object" ? link.target.id : link.target;
        return {
          id: `${graph.datasetId}-${graphIndex}-${index}-${sourceId}-${targetId}`,
          fromKey: `${graph.datasetId}:${sourceId}`,
          toKey: `${graph.datasetId}:${targetId}`,
          strength: Number(link.value ?? link.strength ?? 0),
          color,
        };
      });
    });
  }, [graphs, datasetColorMap]);

  const datasetRegions = useMemo(() => {
    return graphs
      .map((graph) => {
        const points = graph.nodes
          .map((node) => nodePositions[`${graph.datasetId}:${node.id}`])
          .filter(Boolean);
        if (!points.length) {
          return null;
        }
        const minX = Math.min(...points.map((point) => point.x));
        const maxX = Math.max(...points.map((point) => point.x));
        const minY = Math.min(...points.map((point) => point.y));
        const maxY = Math.max(...points.map((point) => point.y));
        return {
          datasetId: graph.datasetId,
          datasetName: graph.datasetName,
          warning: graph.warning,
          x: minX - 48,
          y: minY - 48,
          width: Math.max(maxX - minX + 96, CLUSTER_WIDTH / 2),
          height: Math.max(maxY - minY + 96, CLUSTER_HEIGHT / 2),
        };
      })
      .filter(Boolean);
  }, [graphs, nodePositions]);

  const createConnection = useCallback((from, to) => {
    const connectionId = generateConnectionId(from, to);
    const reverseId = generateConnectionId(to, from);
    setConnections((prev) => {
      if (prev.some((conn) => conn.id === connectionId || conn.id === reverseId)) {
        return prev;
      }
      return [
        ...prev,
        {
          id: connectionId,
          from,
          to,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, []);

  const removeConnection = useCallback((connectionId) => {
    setConnections((prev) => prev.filter((conn) => conn.id !== connectionId));
  }, []);

  const renderNode = (node) => {
    const nodeKey = `${node.datasetId}:${node.nodeId}`;
    const position = nodePositions[nodeKey];
    if (!position) {
      return null;
    }

    const color = datasetColorMap[node.datasetId] ?? "#0f172a";
    const relatedConnections = connections.filter(
      (connection) =>
        (connection.from.datasetId === node.datasetId && connection.from.nodeId === node.nodeId) ||
        (connection.to.datasetId === node.datasetId && connection.to.nodeId === node.nodeId),
    );
    const otherGraphs = graphs.filter((graph) => graph.datasetId !== node.datasetId && graph.nodes.length);

    return (
      <ContextMenu key={nodeKey}>
        <ContextMenuTrigger asChild>
          <div
            className="absolute flex flex-col items-center gap-1 text-center"
            style={{
              left: `${position.x}px`,
              top: `${position.y}px`,
              transform: "translate(-50%, -50%)",
            }}
            onPointerDown={(event) => handleNodePointerDown(event, nodeKey)}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-semibold text-slate-800 shadow-md"
              style={{ background: `${color}1A`, borderColor: color }}
            >
              {Math.max(1, Number(node.degree ?? 0)).toFixed(0)}
            </div>
            <span className="rounded border border-white/70 bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-600 shadow">
              {node.nodeId}
            </span>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuLabel>Связи для «{node.nodeId}»</ContextMenuLabel>
          <ContextMenuSeparator />
          {otherGraphs.length ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger>Связать с...</ContextMenuSubTrigger>
              <ContextMenuSubContent sideOffset={8}>
                {otherGraphs.map((graph) => (
                  <ContextMenuSub key={graph.datasetId}>
                    <ContextMenuSubTrigger>{graph.datasetName}</ContextMenuSubTrigger>
                    <ContextMenuSubContent sideOffset={8}>
                      {graph.nodes.map((targetNode) => (
                        <ContextMenuItem
                          key={`${graph.datasetId}:${targetNode.id}`}
                          onSelect={(event) => {
                            event.preventDefault();
                            createConnection(
                              { datasetId: node.datasetId, nodeId: node.nodeId },
                              { datasetId: graph.datasetId, nodeId: targetNode.id },
                            );
                          }}
                        >
                          {targetNode.id}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : (
            <ContextMenuItem disabled>Нет других графов для связи</ContextMenuItem>
          )}
          {relatedConnections.length > 0 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuLabel>Текущие соединения</ContextMenuLabel>
              {relatedConnections.map((connection) => {
                const isSource =
                  connection.from.datasetId === node.datasetId &&
                  connection.from.nodeId === node.nodeId;
                const peer = isSource ? connection.to : connection.from;
                const peerGraph = graphs.find((graph) => graph.datasetId === peer.datasetId);
                return (
                  <ContextMenuItem
                    key={`${connection.id}-${peer.datasetId}-${peer.nodeId}`}
                    onSelect={(event) => {
                      event.preventDefault();
                      removeConnection(connection.id);
                    }}
                  >
                    {peerGraph?.datasetName ?? peer.datasetId} · {peer.nodeId}
                  </ContextMenuItem>
                );
              })}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const hasDatasets = graphs.length > 0;

  return (
    <Card className="border-0 bg-white/70 backdrop-blur-xl shadow-xl">
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-slate-900 heading-text">Интерактивный граф данных</h3>
            <p className="text-sm text-slate-500 elegant-text">
              Все таблицы объединены в единое поле. Перетаскивайте узлы, исследуйте связи и создавайте новые
              связи между показателями правой кнопкой мыши.
            </p>
          </div>
          <Badge variant="secondary" className="text-slate-600">
            {allNodes.length} узлов • {connections.length} пользовательских связей
          </Badge>
        </div>
      </div>

      <div className="relative px-4 py-6" ref={wrapperRef}>
        {!hasDatasets ? (
          <div className="flex h-72 flex-col items-center justify-center gap-3 text-center text-slate-500">
            <AlertTriangle className="h-10 w-10 text-amber-500" />
            <p className="text-lg font-semibold text-slate-700">Нет загруженных таблиц</p>
            <p className="text-sm">Импортируйте данные, чтобы получить автоматические графы связей.</p>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 shadow-inner">
            <div
              className="relative w-full"
              style={{ minHeight: `${Math.max(layoutMeta.height, 480)}px` }}
            >
              <svg className="absolute inset-0 h-full w-full">
                {datasetRegions.map((region) => {
                  const color = datasetColorMap[region.datasetId] ?? "#94a3b8";
                  return (
                    <g key={region.datasetId} className="pointer-events-none">
                      <rect
                        x={region.x}
                        y={region.y}
                        width={region.width}
                        height={region.height}
                        rx={24}
                        ry={24}
                        fill={color}
                        fillOpacity="0.06"
                        stroke={color}
                        strokeDasharray="10 8"
                        strokeOpacity="0.6"
                      />
                      <text
                        x={region.x + 16}
                        y={region.y + 32}
                        className="text-sm font-semibold"
                        fill="#0f172a"
                      >
                        {region.datasetName}
                      </text>
                      {region.warning ? (
                        <text
                          x={region.x + 16}
                          y={region.y + 52}
                          className="text-xs"
                          fill="#b45309"
                        >
                          {region.warning}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {internalLinks.map((link) => {
                  const from = nodePositions[link.fromKey];
                  const to = nodePositions[link.toKey];
                  if (!from || !to) return null;
                  const strength = Math.max(1, Math.min(4, link.strength * 6));
                  return (
                    <line
                      key={link.id}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke={link.color}
                      strokeWidth={strength}
                      strokeLinecap="round"
                      strokeOpacity="0.35"
                    />
                  );
                })}
                {connections.map((connection) => {
                  const from = nodePositions[`${connection.from.datasetId}:${connection.from.nodeId}`];
                  const to = nodePositions[`${connection.to.datasetId}:${connection.to.nodeId}`];
                  if (!from || !to) return null;
                  return (
                    <g key={connection.id}>
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        stroke="#06b6d4"
                        strokeWidth={3}
                        strokeDasharray="6 6"
                        strokeLinecap="round"
                        strokeOpacity="0.85"
                      />
                      <text
                        x={(from.x + to.x) / 2}
                        y={(from.y + to.y) / 2 - 6}
                        textAnchor="middle"
                        className="text-[10px] font-semibold"
                        fill="#0284c7"
                      >
                        {connection.from.nodeId} ↔ {connection.to.nodeId}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {allNodes.map((node) => renderNode(node))}
            </div>
          </div>
        )}

        {connections.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-inner">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Link2 className="h-4 w-4 text-cyan-500" />
              Пользовательские связи
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {connections.map((connection) => {
                const leftGraph = graphs.find((graph) => graph.datasetId === connection.from.datasetId);
                const rightGraph = graphs.find((graph) => graph.datasetId === connection.to.datasetId);
                return (
                  <span
                    key={connection.id}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1"
                  >
                    <span className="font-semibold text-slate-800">
                      {leftGraph?.datasetName ?? connection.from.datasetId}
                    </span>
                    <span className="text-slate-500">{connection.from.nodeId}</span>
                    <span className="text-cyan-500">↔</span>
                    <span className="text-slate-500">{connection.to.nodeId}</span>
                    <span className="font-semibold text-slate-800">
                      {rightGraph?.datasetName ?? connection.to.datasetId}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
