import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  UploadFile,
  ExtractDataFromUploadedFile,
  SendEmail,
} from "./integrations";

const originalFetch = global.fetch;

describe("integrations API", () => {
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

  it("uploads files using multipart form data", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "success" }),
    });

    const file = new File(["test"], "demo.txt", { type: "text/plain" });
    const response = await UploadFile({ file });

    expect(response).toEqual({ status: "success" });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/upload");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("file")).toBe(file);
  });

  it("extracts structured data from uploaded files", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "success", output: {} }),
    });

    await ExtractDataFromUploadedFile({ file_url: "demo", json_schema: { id: "string" } });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/extract",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify({ file_url: "demo", json_schema: { id: "string" } }),
      })
    );
  });

  it("sends emails with JSON payload", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: "queued" }),
    });

    const body = { to: "user@example.com", subject: "Hi", body: "Hello" };
    const response = await SendEmail(body);

    expect(response.status).toBe("queued");
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/utils/send-email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      })
    );
  });

  it("throws errors with server message", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("problem"),
    });

    await expect(UploadFile({ file: new File(["x"], "x.txt") })).rejects.toThrow("problem");
  });
});
