import { describe, expect, it } from "vitest";
import {
  detectFileIcon,
  generateCSV,
  sanitizeCSVValue,
  getExportContentType,
  __TEST_ONLY__,
} from "../dataTransformation";
import {
  FileSpreadsheet,
  FileImage,
  Database,
} from "lucide-react";

describe("detectFileIcon", () => {
  it("returns spreadsheet icon for Excel files", () => {
    const { icon, color } = detectFileIcon("report.XLSX");
    expect(icon).toBe(FileSpreadsheet);
    expect(color).toBe("from-green-500 to-emerald-600");
  });

  it("returns database icon for SQL files", () => {
    const { icon } = detectFileIcon("dump.sql");
    expect(icon).toBe(Database);
  });

  it("falls back to default for unknown files", () => {
    const fallback = detectFileIcon("archive.unknown");
    expect(fallback.icon).toBe(__TEST_ONLY__.DEFAULT_FILE_ICON.icon);
    expect(fallback.color).toBe(__TEST_ONLY__.DEFAULT_FILE_ICON.color);
  });

  it("handles filenames without extension", () => {
    const result = detectFileIcon("README");
    expect(result).toEqual(__TEST_ONLY__.DEFAULT_FILE_ICON);
  });

  it("handles images specifically", () => {
    const { icon } = detectFileIcon("photo.jpeg");
    expect(icon).toBe(FileImage);
  });
});

describe("sanitizeCSVValue", () => {
  it("returns empty string for nullish values", () => {
    expect(sanitizeCSVValue(null)).toBe("");
    expect(sanitizeCSVValue(undefined)).toBe("");
  });

  it("preserves numbers and booleans", () => {
    expect(sanitizeCSVValue(0)).toBe("0");
    expect(sanitizeCSVValue(false)).toBe("false");
  });

  it("escapes quotes and wraps values with commas", () => {
    expect(sanitizeCSVValue('value,"with",comma')).toBe('"value,""with"",comma"');
  });
});

describe("generateCSV", () => {
  const columns = [
    { name: "city" },
    { name: "population" },
    { name: "note" },
  ];

  it("returns empty string when there is no data", () => {
    expect(generateCSV(columns, [])).toBe("");
  });

  it("generates CSV with escaped values", () => {
    const csv = generateCSV(columns, [
      { city: "Paris", population: 2148327, note: "Capital" },
      { city: "Berlin", population: 3769495, note: "Largest city" },
    ]);

    expect(csv).toBe("city,population,note\nParis,2148327,Capital\nBerlin,3769495,Largest city");
  });

  it("respects commas and quotes in data", () => {
    const csv = generateCSV(columns, [
      { city: "New York", population: 8804190, note: 'City "that" never sleeps' },
      { city: "Los Angeles", population: 3898747, note: "Sunny, sprawling" },
    ]);

    expect(csv).toBe(
      'city,population,note\nNew York,8804190,"City ""that"" never sleeps"\nLos Angeles,3898747,"Sunny, sprawling"'
    );
  });

  it("skips columns without names", () => {
    const csv = generateCSV([{ name: null }, { name: "value" }], [{ value: "ok" }]);
    expect(csv).toBe("value\nok");
  });
});

describe("getExportContentType", () => {
  it("returns mapped MIME types", () => {
    expect(getExportContentType("csv")).toBe("text/csv");
    expect(getExportContentType("JSON")).toBe("application/json");
  });

  it("returns octet-stream for unknown formats", () => {
    expect(getExportContentType("custom"))
      .toBe("application/octet-stream");
  });

  it("handles falsy values gracefully", () => {
    expect(getExportContentType(null)).toBe("application/octet-stream");
  });
});

