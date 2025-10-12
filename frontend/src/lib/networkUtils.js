const NODE_SIZE_MAP = {
  small: 15,
  medium: 25,
  large: 35,
};

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function computePearsonCorrelation(seriesA, seriesB) {
  if (seriesA.length !== seriesB.length) {
    throw new Error("Series must have the same length");
  }

  const filtered = seriesA
    .map((value, index) => {
      const a = toNumber(value);
      const b = toNumber(seriesB[index]);
      return a === null || b === null ? null : [a, b];
    })
    .filter(Boolean);

  const n = filtered.length;
  if (n < 2) {
    return 0;
  }

  let sumA = 0;
  let sumB = 0;
  filtered.forEach(([a, b]) => {
    sumA += a;
    sumB += b;
  });

  const meanA = sumA / n;
  const meanB = sumB / n;

  let numerator = 0;
  let denomA = 0;
  let denomB = 0;

  filtered.forEach(([a, b]) => {
    const diffA = a - meanA;
    const diffB = b - meanB;
    numerator += diffA * diffB;
    denomA += diffA * diffA;
    denomB += diffB * diffB;
  });

  if (denomA === 0 || denomB === 0) {
    return 0;
  }

  return numerator / Math.sqrt(denomA * denomB);
}

export function buildCorrelationGraph({
  selectedColumns,
  nodeSize,
  sampleData = [],
  correlationThreshold = 0.3,
}) {
  if (!Array.isArray(selectedColumns) || selectedColumns.length < 2) {
    return { nodes: [], links: [] };
  }

  const columnValues = selectedColumns.reduce((acc, column) => {
    acc[column] = sampleData.map((row) => row?.[column]);
    return acc;
  }, {});

  const nodes = selectedColumns.map((column) => ({
    id: column,
    radius: NODE_SIZE_MAP[nodeSize] ?? NODE_SIZE_MAP.medium,
  }));

  const links = [];
  for (let i = 0; i < selectedColumns.length; i += 1) {
    for (let j = i + 1; j < selectedColumns.length; j += 1) {
      const source = selectedColumns[i];
      const target = selectedColumns[j];
      const correlation = computePearsonCorrelation(
        columnValues[source] ?? [],
        columnValues[target] ?? [],
      );

      if (Math.abs(correlation) >= correlationThreshold) {
        links.push({
          source,
          target,
          strength: Math.abs(correlation),
          type: correlation >= 0 ? "positive" : "negative",
        });
      }
    }
  }

  return { nodes, links };
}

export function normaliseGraphData(graphData, { nodeSize, selectedColumns }) {
  if (!graphData || !Array.isArray(graphData.nodes) || !Array.isArray(graphData.links)) {
    return null;
  }

  const nodeSizeValue = NODE_SIZE_MAP[nodeSize] ?? NODE_SIZE_MAP.medium;
  const providedNodes = new Map();

  graphData.nodes.forEach((node) => {
    if (!node?.id) return;
    providedNodes.set(node.id, {
      id: node.id,
      radius: node.radius ?? nodeSizeValue,
      group: node.group ?? null,
    });
  });

  if (Array.isArray(selectedColumns)) {
    selectedColumns.forEach((column) => {
      if (!providedNodes.has(column)) {
        providedNodes.set(column, {
          id: column,
          radius: nodeSizeValue,
          group: null,
        });
      }
    });
  }

  const nodes = Array.from(providedNodes.values());
  const links = graphData.links
    .map((link) => {
      if (!link) return null;
      const source = typeof link.source === "object" ? link.source.id : link.source;
      const target = typeof link.target === "object" ? link.target.id : link.target;
      if (!source || !target) return null;

      const value = Number(link.value ?? link.strength ?? 0);
      const strength = Number.isFinite(value) ? Math.max(Math.min(Math.abs(value), 1), 0) : 0;

      return {
        source,
        target,
        strength,
        type: (link.type ?? (value >= 0 ? "positive" : "negative")) === "negative"
          ? "negative"
          : "positive",
      };
    })
    .filter(Boolean);

  return { nodes, links };
}

export function calculateNodePositions(nodes, layout, width, height) {
  if (!nodes.length) {
    return [];
  }

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2.5;

  if (layout === "grid") {
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / columns);
    const cellWidth = width / (columns + 1);
    const cellHeight = height / (rows + 1);

    return nodes.map((node, index) => {
      const row = Math.floor(index / columns) + 1;
      const column = (index % columns) + 1;
      return {
        ...node,
        x: cellWidth * column,
        y: cellHeight * row,
      };
    });
  }

  if (layout === "circle") {
    return nodes.map((node, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI;
      return {
        ...node,
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    });
  }

  // simple deterministic "force" layout: heavier nodes closer to center based on degree
  const maxDegree = nodes.reduce((acc, node) => Math.max(acc, node.degree ?? 0), 0) || 1;

  return nodes.map((node, index) => {
    const angle = (index / nodes.length) * 2 * Math.PI;
    const degreeFactor = 1 - (node.degree ?? 0) / (maxDegree + 1);
    const distance = radius * (0.4 + degreeFactor * 0.6);
    return {
      ...node,
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
    };
  });
}

export function attachDegrees(nodes, links) {
  const degreeMap = new Map();

  links.forEach((link) => {
    degreeMap.set(link.source, (degreeMap.get(link.source) ?? 0) + 1);
    degreeMap.set(link.target, (degreeMap.get(link.target) ?? 0) + 1);
  });

  return nodes.map((node) => ({
    ...node,
    degree: degreeMap.get(node.id) ?? 0,
  }));
}

export const __TEST_ONLY__ = {
  NODE_SIZE_MAP,
  toNumber,
};

