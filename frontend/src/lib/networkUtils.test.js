import { describe, expect, it } from "vitest";
import {
  attachDegrees,
  buildCorrelationGraph,
  calculateNodePositions,
  computePearsonCorrelation,
  normaliseGraphData,
} from "./networkUtils";

const sampleData = [
  { sales: 10, profit: 5, loss: -5 },
  { sales: 20, profit: 10, loss: -10 },
  { sales: 30, profit: 15, loss: -15 },
  { sales: 40, profit: 20, loss: -20 },
];

describe("computePearsonCorrelation", () => {
  it("returns 1 for identical series", () => {
    const values = [1, 2, 3, 4];
    expect(computePearsonCorrelation(values, values)).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly inverse series", () => {
    const values = [1, 2, 3, 4];
    const inverted = values.map((value) => -value);
    expect(computePearsonCorrelation(values, inverted)).toBeCloseTo(-1, 5);
  });

  it("ignores non-numeric values", () => {
    const left = [1, "", 3, "n/a", 5];
    const right = [2, 4, 6, 8, 10];
    expect(computePearsonCorrelation(left, right)).toBeCloseTo(1, 5);
  });
});

describe("buildCorrelationGraph", () => {
  it("creates links for strongly correlated columns", () => {
    const graph = buildCorrelationGraph({
      selectedColumns: ["sales", "profit", "loss"],
      nodeSize: "medium",
      sampleData,
      correlationThreshold: 0.5,
    });

    const pair = graph.links.find((link) => link.source === "sales" && link.target === "profit");
    expect(pair?.strength).toBeGreaterThan(0.99);
    expect(pair?.type).toBe("positive");

    const inversePair = graph.links.find((link) => link.source === "profit" && link.target === "loss");
    expect(inversePair?.type).toBe("negative");
    expect(inversePair?.strength).toBeGreaterThan(0.99);
  });

  it("returns empty graph if columns are insufficient", () => {
    const graph = buildCorrelationGraph({
      selectedColumns: ["only"],
      nodeSize: "small",
      sampleData,
    });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.links).toHaveLength(0);
  });
});

describe("normaliseGraphData", () => {
  it("normalises nodes and links from generated graph", () => {
    const graphData = {
      nodes: [{ id: "A" }],
      links: [{ source: "A", target: "B", value: 0.8 }],
    };

    const result = normaliseGraphData(graphData, { nodeSize: "large", selectedColumns: ["A", "B"] });

    expect(result?.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "A", radius: expect.any(Number) }),
        expect.objectContaining({ id: "B" }),
      ]),
    );
    expect(result?.links[0]).toMatchObject({ source: "A", target: "B", strength: 0.8, type: "positive" });
  });
});

describe("attachDegrees", () => {
  it("assigns degree counts to nodes", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const links = [
      { source: "A", target: "B" },
      { source: "A", target: "C" },
    ];

    const result = attachDegrees(nodes, links);
    const nodeA = result.find((node) => node.id === "A");
    expect(nodeA?.degree).toBe(2);
    expect(result.find((node) => node.id === "B")?.degree).toBe(1);
  });
});

describe("calculateNodePositions", () => {
  const nodes = [
    { id: "A", radius: 10, degree: 2 },
    { id: "B", radius: 10, degree: 1 },
    { id: "C", radius: 10, degree: 0 },
  ];

  it("supports circle layout", () => {
    const positioned = calculateNodePositions(nodes, "circle", 400, 400);
    expect(positioned).toHaveLength(3);
    positioned.forEach((node) => {
      expect(node.x).toBeGreaterThan(0);
      expect(node.y).toBeGreaterThan(0);
    });
  });

  it("supports grid layout", () => {
    const positioned = calculateNodePositions(nodes, "grid", 400, 400);
    expect(positioned).toHaveLength(3);
    expect(new Set(positioned.map((node) => node.x)).size).toBeGreaterThan(1);
  });
});
