import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import {
  generateForecastReport,
  analyzeCorrelation,
  buildNetworkGraph,
  compareTables,
  summarizeProjectStructure,
  convertDataset,
  buildProjectReport,
  summarizeEmailBody,
  suggestDataApplications,
} from "../localAnalysis";

describe("generateForecastReport", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-05-01T00:00:00.000Z"));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it("builds a deterministic forecast with scenarios and insights", () => {
    const historical = Array.from({ length: 10 }, (_, index) => ({
      date: `2024-04-${String(index + 1).padStart(2, "0")}`,
      value: 100 + index * 5,
    }));

    const report = generateForecastReport({
      historical,
      horizon: 5,
      externalFactors: [
        {
          dataset_name: "Weather",
          column: "Temperature",
          sampleValues: ["+2°C", "+3°C"],
        },
      ],
    });

    expect(report.forecast_data).toHaveLength(5);
    expect(report.forecast_data[0]).toMatchObject({ date: "2024-05-02" });
    expect(report.scenarios.optimistic).toHaveLength(5);
    expect(report.scenarios.pessimistic).toHaveLength(5);
    expect(report.summary.trend_direction).toBe("возрастающий");
    expect(report.summary.key_insights.some((text) => text.includes("Прогноз на 5 дн."))).toBe(true);
  });

  it("falls back to synthetic history when no data provided", () => {
    const report = generateForecastReport({ historical: [], horizon: 2 });
    expect(report.forecast_data).toHaveLength(2);
    expect(report.summary.key_insights.length).toBeGreaterThan(0);
  });
});

describe("analyzeCorrelation", () => {
  it("builds correlation matrix and highlights strong links", () => {
    const result = analyzeCorrelation({
      features: [
        { label: "Sales", values: [100, 120, 140, 160] },
        { label: "Profit", values: [50, 60, 70, 80] },
        { label: "Noise", values: [5, 7, 6, 8] },
      ],
    });

    expect(result.correlation_matrix).toHaveLength(3);
    expect(result.correlation_matrix[0].correlations).toHaveProperty("Profit");
    expect(result.strongest_correlations[0].feature1).toBe("Sales");
    expect(Math.abs(result.strongest_correlations[0].correlation)).toBeCloseTo(1, 3);
    expect(result.meta.featureCount).toBe(3);
    expect(result.insights.some((text) => text.includes("корреляцию"))).toBe(true);
  });

  it("returns a warning when not enough data", () => {
    const result = analyzeCorrelation({ features: [{ label: "A", values: [1] }] });
    expect(result.insights).toContain(
      "Недостаточно числовых данных для построения матрицы корреляций."
    );
  });
});

describe("buildNetworkGraph", () => {
  it("connects numeric columns above the correlation threshold", () => {
    const columns = [
      { name: "sales", type: "number" },
      { name: "profit", type: "number" },
      { name: "region", type: "string" },
    ];
    const rows = [
      { sales: 10, profit: 2, region: "A" },
      { sales: 20, profit: 4, region: "B" },
      { sales: 30, profit: 6, region: "C" },
    ];

    const result = buildNetworkGraph({
      datasetName: "Demo",
      columns,
      rows,
      graphType: "social",
    });

    expect(result.nodes.map((node) => node.id)).toEqual(["sales", "profit"]);
    expect(result.links).toHaveLength(1);
    expect(result.insights.some((text) => text.includes("центры влияния"))).toBe(true);
    expect(result.metrics).toMatchObject({ total_nodes: 2, total_links: 1 });
    expect(result.node_metrics.find((metric) => metric.node === "sales")).toMatchObject({ degree: 1 });
    expect(result.adjacency_matrix[0].connections.find((conn) => conn.node === "profit").weight).toBeGreaterThan(0);
    expect(result.communities).toHaveLength(1);
  });
});

describe("compareTables", () => {
  it("detects shared structure, mismatched types and row differences", () => {
    const left = {
      columns: [
        { name: "id", type: "number" },
        { name: "city", type: "string" },
        { name: "amount", type: "number" },
      ],
      sample_data: [
        { id: 1, city: "Paris", amount: 120 },
        { id: 2, city: "Berlin", amount: 90 },
      ],
    };

    const right = {
      columns: [
        { name: "id", type: "int" },
        { name: "city", type: "STRING" },
        { name: "amount", type: "text" },
        { name: "status", type: "boolean" },
      ],
      sample_data: [
        { id: 1, city: "Paris", amount: "120", status: true },
        { id: 3, city: "Rome", amount: "70", status: false },
      ],
    };

    const result = compareTables({ left, right });

    expect(result.column_comparison.matching_columns).toEqual(["id", "city"]);
    expect(result.column_comparison.type_mismatches).toEqual([
      { column: "amount", left_type: "number", right_type: "string" },
    ]);
    expect(result.column_comparison.left_only).toEqual([]);
    expect(result.column_comparison.right_only).toEqual(["status"]);

    expect(result.row_comparison.matching_rows).toBe(1);
    expect(result.row_comparison.left_only_rows[0].count).toBe(1);
    expect(result.row_comparison.right_only_rows[0].count).toBe(1);
    expect(result.insights[0]).toContain("Совпадающих столбцов: 2 из 3");

    expect(result.cell_comparison.legend.match.color).toBe("green");
    expect(result.cell_comparison.rows[0].cells.every((cell) => cell.status === "match")).toBe(true);
  });

  it("builds highlighted grids for tables with similar layout and reordered columns", () => {
    const tableA1 = {
      columns: [
        { name: "id", type: "number" },
        { name: "name", type: "string" },
        { name: "score", type: "number" },
      ],
      sample_data: [
        { id: 1, name: "Alice", score: 80 },
        { id: 2, name: "Bob", score: 92 },
        { id: 3, name: "Cara", score: 87 },
        { id: 4, name: "Dan", score: 75 },
        { id: 5, name: "Eva", score: 91 },
      ],
    };

    const tableA2 = {
      columns: [
        { name: "id", type: "number" },
        { name: "name", type: "string" },
        { name: "score", type: "number" },
      ],
      sample_data: [
        { id: 1, name: "Alice", score: 80 },
        { id: 2, name: "Bob", score: 92 },
        { id: 3, name: "Cara", score: 87 },
        { id: 4, name: "Dan", score: 75 },
        { id: 5, name: "Eva", score: 70 },
      ],
    };

    const tableB1 = {
      columns: [
        { name: "region", type: "string" },
        { name: "q1", type: "number" },
        { name: "q2", type: "number" },
      ],
      sample_data: [
        { region: "North", q1: 100, q2: 120 },
        { region: "South", q1: 95, q2: 110 },
      ],
    };

    const tableB2 = {
      columns: [
        { name: "q2", type: "number" },
        { name: "region", type: "string" },
        { name: "q1", type: "number" },
      ],
      sample_data: [
        { q2: 120, region: "North", q1: 100 },
        { q2: 110, region: "South", q1: 95 },
      ],
    };

    const similarLayout = compareTables({ left: tableA1, right: tableA2 });
    const reorderedColumns = compareTables({ left: tableB1, right: tableB2 });

    const fifthRowCells = similarLayout.cell_comparison.rows[4].cells;
    expect(fifthRowCells.some((cell) => cell.status === "mismatch")).toBe(true);
    expect(fifthRowCells.find((cell) => cell.column === "score").color).toBe("red");
    expect(similarLayout.cell_comparison.rows[0].cells.every((cell) => cell.color === "green")).toBe(true);

    reorderedColumns.cell_comparison.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        expect(cell.status).toBe("match");
        expect(cell.color).toBe("green");
      });
    });
  });
});

describe("summarizeProjectStructure", () => {
  it("detects key and unused datasets", () => {
    const datasets = [
      { id: "d1", name: "Sales" },
      { id: "d2", name: "Marketing" },
    ];
    const visualizations = [
      { id: "v1", dataset_id: "d1" },
      { id: "v2", dataset_id: "d1" },
    ];

    const summary = summarizeProjectStructure({ datasets, visualizations });

    expect(summary.key_datasets).toContain("Sales — 2 визуализаций");
    expect(summary.unused_datasets).toContain("Marketing");
    expect(summary.insights[0]).toContain("визуализаций");
  });
});

describe("convertDataset", () => {
  const dataset = {
    name: "Retail Data",
    columns: [
      { name: "city", type: "string" },
      { name: "sales", type: "number" },
      { name: "notes with space", type: "string" },
    ],
    sample_data: [
      { city: "Paris", sales: 120, "notes with space": "ACME, Inc." },
      { city: "Berlin", sales: 80, "notes with space": "Line1\nLine2" },
      { city: "Rome", sales: 100, "notes with space": "<script>alert(1)</script>" },
    ],
  };

  it("converts to SQL with sanitized identifiers", () => {
    const result = convertDataset({ dataset, format: "sql" });
    expect(result.converted_data).toContain("CREATE TABLE Retail_Data");
    expect(result.converted_data).toContain("notes_with_space TEXT");
    expect(result.converted_data).toContain("INSERT INTO Retail_Data VALUES ('Paris', 120, 'ACME, Inc.');");
  });

  it("adds compatibility notes for virtual Excel export", () => {
    const result = convertDataset({ dataset, format: "xlsx" });
    expect(result.compatibility_notes).toContain(
      "Формат сгенерирован в виде текстового представления для локальной загрузки."
    );
  });

  it("quotes CSV values that include delimiters or newlines", () => {
    const result = convertDataset({ dataset, format: "csv" });
    expect(result.converted_data).toContain('"ACME, Inc."');
    expect(result.converted_data).toContain('"Line1\nLine2"');
  });

  it("supports disabling CSV headers via options", () => {
    const result = convertDataset({ dataset, format: "csv", options: { includeHeaders: false } });
    expect(result.converted_data.startsWith('Paris,120,"ACME, Inc."')).toBe(true);
  });

  it("serializes JSON in a parseable structure", () => {
    const result = convertDataset({ dataset, format: "json" });
    expect(() => JSON.parse(result.converted_data)).not.toThrow();
  });

  it("sanitizes XML tags and escapes special characters", () => {
    const result = convertDataset({ dataset, format: "xml" });
    expect(result.converted_data).toContain("<notes_with_space>ACME, Inc.</notes_with_space>");
    expect(result.converted_data).toContain(
      "<notes_with_space>&lt;script&gt;alert(1)&lt;/script&gt;</notes_with_space>"
    );
  });

  it("escapes HTML table content", () => {
    const result = convertDataset({ dataset, format: "html" });
    expect(result.converted_data).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.converted_data).toContain("<th>notes with space</th>");
  });

  it("formats plain text tables with padded columns", () => {
    const result = convertDataset({ dataset, format: "txt" });
    expect(result.converted_data.split("\n")[0]).toContain("city");
    expect(result.converted_data).toContain("Line1 Line2");
  });

  it("falls back to CSV-like output for parquet with compatibility note", () => {
    const result = convertDataset({ dataset, format: "parquet" });
    expect(result.converted_data).toContain('"ACME, Inc."');
    expect(result.compatibility_notes).toContain(
      "Формат сгенерирован в виде текстового представления для локальной загрузки."
    );
  });

  it("derives columns from sample data when metadata is missing", () => {
    const minimalDataset = {
      name: "Dynamic",
      sample_data: [{ dynamic: 1, value: "ok" }],
    };
    const result = convertDataset({ dataset: minimalDataset, format: "csv" });
    expect(result.converted_data.startsWith("dynamic,value")).toBe(true);
  });
});

describe("buildProjectReport and summarizeEmailBody", () => {
  it("builds narrative summaries and renders email text", () => {
    const report = buildProjectReport({
      datasets: [
        { name: "Sales", columns: [{}, {}], sample_data: [] },
        { name: "HR", columns: [{}], sample_data: [{}] },
      ],
      visualizations: [
        { title: "KPI", type: "chart" },
        { title: "Map", type: "geo" },
      ],
    });

    expect(report.executive_summary).toContain("Локальный анализ проекта");
    expect(report.key_insights.length).toBe(3);
    expect(report.dataset_overview.total).toBe(2);
    expect(report.dataset_overview.coverage_summary.length).toBeGreaterThan(0);
    expect(report.visualization_overview.highlights[0]).toContain("KPI");
    expect(report.risk_zones.length).toBeGreaterThan(0);

    const email = summarizeEmailBody(report);
    expect(email).toContain("Краткое описание локального анализа:");
    expect(email).toContain("Рекомендации:");
  });
});

describe("suggestDataApplications", () => {
  it("proposes local analytical scenarios based on dataset structure", () => {
    const dataset = {
      name: "Crime Stats",
      row_count: 1200,
      columns: [
        { name: "date", type: "date" },
        { name: "district", type: "string" },
        { name: "incidents", type: "number" },
        { name: "latitude", type: "number" },
        { name: "longitude", type: "number" },
        { name: "notes", type: "string" },
      ],
      sample_data: [
        {
          date: "2024-01-01",
          district: "Downtown",
          incidents: 42,
          latitude: 40.7128,
          longitude: -74.006,
          notes: "Вечерние патрули отмечают всплеск правонарушений вблизи станции метро.",
        },
      ],
    };

    const project = {
      datasets: [{ id: "d1" }, { id: "d2" }],
    };

    const suggestion = suggestDataApplications({ dataset, project });

    expect(suggestion.summary).toContain("Локальный ассистент");
    expect(suggestion.suggestions.some((text) => text.toLowerCase().includes("прогноз"))).toBe(true);
    expect(suggestion.suggestions.some((text) => text.toLowerCase().includes("карту"))).toBe(true);
    expect(suggestion.tags).toEqual(expect.arrayContaining(["forecast", "geo"]));
    expect(suggestion.focus_areas.length).toBeGreaterThan(0);
    expect(suggestion.confidence).toBeGreaterThan(0);
    expect(suggestion.local_execution_note).toContain("локально");
  });

  it("falls back to exploratory advice when structure is minimal", () => {
    const dataset = {
      name: "Minimal",
      columns: [{ name: "id", type: "string" }],
      sample_data: [],
    };

    const suggestion = suggestDataApplications({ dataset });

    expect(suggestion.suggestions[0]).toContain("базовой визуализации");
    expect(suggestion.focus_areas[0]).toContain("Разведочный анализ");
    expect(suggestion.tags).toHaveLength(0);
  });
});
