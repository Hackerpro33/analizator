import React, { useEffect, useMemo, useRef } from "react";
import { Card } from "@/components/ui/card";
import {
  attachDegrees,
  buildCorrelationGraph,
  calculateNodePositions,
  normaliseGraphData,
} from "@/lib/networkUtils";

export default function NetworkVisualization({ config, graphData, dataset }) {
  const svgRef = useRef(null);

  const preparedGraph = useMemo(() => {
    if (graphData?.nodes?.length && graphData?.links?.length) {
      return normaliseGraphData(graphData, config);
    }

    if (dataset?.sample_data?.length) {
      return buildCorrelationGraph({
        selectedColumns: config.selectedColumns,
        nodeSize: config.nodeSize,
        sampleData: dataset.sample_data,
      });
    }

    return { nodes: [], links: [] };
  }, [config, dataset, graphData]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const width = svg.clientWidth || 400;
    const height = svg.clientHeight || 400;

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const { nodes, links } = preparedGraph ?? { nodes: [], links: [] };
    if (!nodes.length) {
      return;
    }

    const nodesWithDegree = attachDegrees(nodes, links);
    const positionedNodes = calculateNodePositions(
      nodesWithDegree,
      config.layout,
      width,
      height,
    );

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const gradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
    gradient.setAttribute("id", "nodeGradient");

    const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("stop-color", "#06B6D4");

    const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("stop-color", "#3B82F6");

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    defs.appendChild(gradient);
    svg.appendChild(defs);

    links.forEach((link) => {
      const sourceNode = positionedNodes.find((node) => node.id === link.source);
      const targetNode = positionedNodes.find((node) => node.id === link.target);
      if (!sourceNode || !targetNode) return;

      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", sourceNode.x);
      line.setAttribute("y1", sourceNode.y);
      line.setAttribute("x2", targetNode.x);
      line.setAttribute("y2", targetNode.y);
      line.setAttribute("stroke", link.type === "negative" ? "#EF4444" : "#10B981");
      line.setAttribute("stroke-width", String(Math.max(link.strength * 4, 1)));
      line.setAttribute("opacity", "0.7");
      svg.appendChild(line);
    });

    positionedNodes.forEach((node) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", node.x);
      circle.setAttribute("cy", node.y);
      circle.setAttribute("r", String(node.radius));
      circle.setAttribute("fill", "url(#nodeGradient)");
      circle.setAttribute("stroke", "#1E293B");
      circle.setAttribute("stroke-width", "2");
      svg.appendChild(circle);

      if (config.showLabels) {
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", node.x);
        text.setAttribute("y", node.y + node.radius + 14);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "#1E293B");
        text.setAttribute("font-size", "12");
        text.setAttribute("font-weight", "600");
        text.textContent = node.id;
        svg.appendChild(text);
      }
    });
  }, [config.layout, config.showLabels, preparedGraph]);

  const hasData = preparedGraph?.nodes?.length;

  return (
    <Card className="relative w-full h-96 bg-gradient-to-br from-slate-50 to-blue-50 border border-slate-200 overflow-hidden">
      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500 elegant-text">
          <div className="text-center px-6">
            <p className="font-medium">Недостаточно данных для построения графа</p>
            <p className="text-sm mt-1">
              Выберите минимум два числовых столбца или дождитесь результатов генерации графа
            </p>
          </div>
        </div>
      )}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        viewBox="0 0 400 400"
        className="w-full h-full"
        role="img"
        aria-label="Network visualization"
      />
      <div className="absolute bottom-4 left-4 text-xs text-slate-500 elegant-text bg-white/80 px-3 py-2 rounded-lg shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-emerald-500" />
            <span>Положительная связь</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-red-500" />
            <span>Отрицательная связь</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
