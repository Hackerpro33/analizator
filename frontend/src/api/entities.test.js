import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { Dataset, Visualization, getDatasets, getVisualizations } from "./entities";

const originalFetch = global.fetch;

describe("entities API client", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    } else {
      delete global.fetch;
    }
  });

  it("lists datasets with default ordering", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: "d1" }]),
    });

    const response = await Dataset.list();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dataset/list?order_by=-created_at",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
    expect(response).toEqual([{ id: "d1" }]);
  });

  it("creates a dataset via POST", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "created" }),
    });

    const payload = { name: "Test" };
    await Dataset.create(payload);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dataset/create",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      })
    );
  });

  it("propagates errors with response text", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve("failure"),
      statusText: "Server Error",
    });

    await expect(Dataset.get("missing"))
      .rejects.toThrow("failure");
  });

  it("filters visualizations with POST body", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: "v1" }]),
    });

    const filters = { dataset_id: "d1" };
    await Visualization.filter(filters, "created_at");

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/visualization/filter",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ filters, order_by: "created_at" }),
      })
    );
  });

  it("exposes convenience getters", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
    });

    await getDatasets();
    await getVisualizations();

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dataset/list?order_by=-created_at",
      expect.any(Object)
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/visualization/list?order_by=-created_at",
      expect.any(Object)
    );
  });
});
