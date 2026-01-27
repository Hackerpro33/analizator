import { describe, expect, it } from "vitest";
import { aggregateValues, computeDeltaMap, updateSelection } from "./utils";

describe("computeDeltaMap", () => {
  it("calculates MoM and YoY deltas", () => {
    const timeline = [
      { date: "2022-01-01", actual: 100, forecast: null },
      { date: "2022-02-01", actual: 120, forecast: null },
      { date: "2023-02-01", actual: 180, forecast: null },
    ];
    const map = computeDeltaMap(timeline);
    expect(map["2022-02-01"].mom.abs).toBe(0 + 120 - 100);
    expect(map["2022-02-01"].mom.pct?.toFixed(2)).toBe("20.00");
    expect(map["2023-02-01"].yoy.abs).toBe(60);
  });
});

describe("updateSelection", () => {
  const timeline = [
    { date: "2022-01-01" },
    { date: "2022-02-01" },
    { date: "2022-03-01" },
  ];

  it("selects single tile without modifiers", () => {
    const result = updateSelection(new Set(), timeline, null, "2022-01-01", {});
    expect(result.selection.has("2022-01-01")).toBe(true);
    expect(result.selection.size).toBe(1);
  });

  it("adds tiles with ctrl/meta", () => {
    const initial = new Set(["2022-01-01"]);
    const result = updateSelection(initial, timeline, "2022-01-01", "2022-02-01", { ctrlKey: true });
    expect(result.selection.has("2022-01-01")).toBe(true);
    expect(result.selection.has("2022-02-01")).toBe(true);
  });

  it("selects range with shift", () => {
    const result = updateSelection(new Set(["2022-01-01"]), timeline, "2022-01-01", "2022-03-01", { shiftKey: true });
    expect(result.selection.has("2022-02-01")).toBe(true);
    expect(result.selection.size).toBe(3);
  });
});

describe("aggregateValues", () => {
  it("sums included months", () => {
    const months = [
      { date: "2022-01-01", actual: 100, forecast: null },
      { date: "2022-02-01", actual: null, forecast: 50 },
    ];
    const value = aggregateValues(months, "sum");
    expect(value).toBe(150);
  });
});
