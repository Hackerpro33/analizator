import { describe, it, expect } from "vitest";

import {
  parseCoordinate,
  parseNumericValue,
  findFirstValue,
  findNameField,
} from "../mapUtils";

describe("parseCoordinate", () => {
  it("parses numeric and string inputs", () => {
    expect(parseCoordinate(55.75)).toBe(55.75);
    expect(parseCoordinate("40,123")).toBeCloseTo(40.123, 3);
    expect(parseCoordinate("−12,75")).toBeCloseTo(-12.75, 2);
    expect(parseCoordinate(" ")).toBeNull();
    expect(parseCoordinate({})).toBeNull();
  });
});

describe("parseNumericValue", () => {
  it("normalizes decimal separators and rejects invalid input", () => {
    expect(parseNumericValue("12,5")).toBeCloseTo(12.5);
    expect(parseNumericValue("abc")).toBeNull();
    expect(parseNumericValue(null)).toBeNull();
  });

  it("handles percentages and sign variations", () => {
    expect(parseNumericValue("-10.2%")).toBeCloseTo(-10.2);
    expect(parseNumericValue("−7,5 %")).toBeCloseTo(-7.5);
    expect(parseNumericValue("(12,5%)")).toBeCloseTo(-12.5);
  });
});

describe("findFirstValue", () => {
  it("picks the first matching property", () => {
    const point = { lat: 10, Latitude: 12, lat_override: 15 };
    expect(findFirstValue(point, ["lat_override", "lat"])).toBe(15);
    expect(findFirstValue(point, ["missing", "Latitude"])).toBe(12);
    expect(findFirstValue(point, ["missing"])).toBeUndefined();
  });
});

describe("findNameField", () => {
  it("detects name-like properties", () => {
    expect(findNameField({ name: "Moscow" })).toBe("Moscow");
    expect(findNameField({ region_label: "Siberia" })).toBe("Siberia");
    expect(findNameField({})).toBeUndefined();
  });
});
