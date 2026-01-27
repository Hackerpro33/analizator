import React, { useMemo, useState } from "react";

import { attachDegrees, calculateNodePositions } from "@/lib/networkUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const NODE_COLORS = {
  ip: "#22d3ee",
  host: "#f97316",
  user: "#c084fc",
  domain: "#60a5fa",
  process: "#fbbf24",
  file: "#4ade80",
};

function buildAdjacency(edges) {
  const map = new Map();
  edges.forEach((edge) => {
    if (!edge?.source || !edge?.target) return;
    map.set(edge.source, [...(map.get(edge.source) ?? []), edge.target]);
    map.set(edge.target, [...(map.get(edge.target) ?? []), edge.source]);
  });
  return map;
}

function findShortestPath(edges, startId, endId) {
  if (!startId || !endId || startId === endId) {
    return [];
  }
  const adjacency = buildAdjacency(edges);
  const queue = [[startId]];
  const visited = new Set([startId]);
  while (queue.length) {
    const path = queue.shift();
    const node = path[path.length - 1];
    if (node === endId) {
      return path;
    }
    const neighbors = adjacency.get(node) ?? [];
    neighbors.forEach((neighbor) => {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    });
  }
  return [];
}

export default function SecurityGraph({ data, selection, onSelect }) {
  const [pathStart, setPathStart] = useState(null);
  const [pathNodes, setPathNodes] = useState([]);

  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];

  const preparedNodes = useMemo(() => {
    const nodesWithDegree = attachDegrees(
      nodes.map((node) => ({
        ...node,
        radius: 12,
        degree: 0,
      })),
      edges,
    );
    return calculateNodePositions(
      nodesWithDegree.map((node) => ({
        ...node,
        radius: 12 + (node.degree ?? 0),
      })),
      "force",
      420,
      420,
    );
  }, [nodes, edges]);

  const pathEdgeSet = useMemo(() => {
    if (pathNodes.length < 2) return new Set();
    const edgeSet = new Set();
    for (let index = 0; index < pathNodes.length - 1; index += 1) {
      const key = `${pathNodes[index]}-${pathNodes[index + 1]}`;
      const reverseKey = `${pathNodes[index + 1]}-${pathNodes[index]}`;
      edgeSet.add(key);
      edgeSet.add(reverseKey);
    }
    return edgeSet;
  }, [pathNodes]);

  const handleNodeClick = (node) => {
    onSelect?.({ type: "node", data: node });
    if (!pathStart || pathStart.id === node.id) {
      setPathStart(node);
      setPathNodes([]);
      return;
    }
    const path = findShortestPath(edges, pathStart.id, node.id);
    setPathNodes(path);
  };

  const findNodePosition = (nodeId) => preparedNodes.find((node) => node.id === nodeId);

  const renderEdges = () =>
    edges.map((edge) => {
      const source = findNodePosition(edge.source);
      const target = findNodePosition(edge.target);
      if (!source || !target) {
        return null;
      }
      const edgeKey = `${edge.source}-${edge.target}`;
      const isActive = pathEdgeSet.has(edgeKey) || (selection?.type === "edge" && selection?.data?.id === edge.id);
      return (
        <line
          key={edge.id || edgeKey}
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke={isActive ? "#f97316" : "#94a3b8"}
          strokeWidth={isActive ? 3 : Math.min(Math.max(edge.count ?? 1, 1), 4)}
          strokeOpacity={0.6}
          onClick={() => onSelect?.({ type: "edge", data: edge })}
        />
      );
    });

  const renderNodes = () =>
    preparedNodes.map((node) => {
      const color = NODE_COLORS[node.type] ?? "#38bdf8";
      const isSelected = selection?.type === "node" && selection?.data?.id === node.id;
      return (
        <g key={node.id} onClick={() => handleNodeClick(node)} className="cursor-pointer">
          <circle
            cx={node.x}
            cy={node.y}
            r={node.radius}
            stroke={isSelected ? "#facc15" : "#0f172a"}
            strokeWidth={isSelected ? 3 : 2}
            fill={color}
            opacity={0.85}
          />
          <text
            x={node.x}
            y={node.y - node.radius - 4}
            fontSize="10"
            textAnchor="middle"
            fill="#0f172a"
            className="select-none"
          >
            {node.label ?? node.id}
          </text>
        </g>
      );
    });

  return (
    <Card className="border border-slate-200 shadow-md">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-slate-700">Entity graph</CardTitle>
        <div className="text-xs text-slate-500">
          {pathStart ? `Начало пути: ${pathStart.label || pathStart.id}` : "Выберите узел для подсветки пути"}
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative w-full h-[420px]">
          <svg viewBox="0 0 420 420" className="w-full h-full bg-slate-50 rounded-xl border border-slate-200">
            {renderEdges()}
            {renderNodes()}
          </svg>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(NODE_COLORS).map(([type, color]) => (
            <Badge key={type} style={{ backgroundColor: color }} className="capitalize">
              {type}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
