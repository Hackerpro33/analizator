import { describe, expect, it } from "vitest";
import { formatBytes, resolveAttachmentKind, validateAttachmentFile } from "./messengerUtils";

function makeFile({ name = "file.bin", type = "application/octet-stream", size = 1024 } = {}) {
  return { name, type, size };
}

describe("resolveAttachmentKind", () => {
  it("classifies images, audio and videos", () => {
    expect(resolveAttachmentKind(makeFile({ type: "image/png" }))).toBe("image");
    expect(resolveAttachmentKind(makeFile({ type: "audio/ogg" }))).toBe("voice");
    expect(resolveAttachmentKind(makeFile({ type: "video/mp4" }))).toBe("video_note");
  });
});

describe("validateAttachmentFile", () => {
  it("rejects files larger than 100 MB", () => {
    const result = validateAttachmentFile(makeFile({ size: 101 * 1024 * 1024 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/100 МБ/);
  });

  it("rejects video notes longer than 15 seconds", () => {
    const result = validateAttachmentFile(makeFile({ type: "video/mp4" }), {
      kind: "video_note",
      durationSeconds: 16,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/15 секунд/);
  });

  it("accepts supported files within limits", () => {
    const result = validateAttachmentFile(makeFile({ type: "application/pdf", size: 2048 }));
    expect(result).toEqual({ ok: true, kind: "document" });
  });
});

describe("formatBytes", () => {
  it("formats byte sizes for ui badges", () => {
    expect(formatBytes(0)).toBe("0 Б");
    expect(formatBytes(1536)).toBe("1.5 КБ");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
  });
});
