import { describe, expect, it, vi } from "vitest";

import { openExternalUrl } from "./externalNavigation";

describe("openExternalUrl", () => {
  it("prefers opening a separate browser window", () => {
    const popup = {};
    const windowRef = {
      open: vi.fn(() => popup),
      location: { assign: vi.fn() },
    };

    const result = openExternalUrl("https://example.com/oauth", { windowRef });

    expect(result).toEqual({ opened: true, method: "window.open" });
    expect(windowRef.open).toHaveBeenCalledWith("https://example.com/oauth", "_blank", "noopener,noreferrer");
    expect(windowRef.location.assign).not.toHaveBeenCalled();
  });

  it("falls back to an anchor when popups are blocked", () => {
    const click = vi.fn();
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const anchor = {
      click,
      style: {},
    };
    const windowRef = {
      open: vi.fn(() => null),
      location: { assign: vi.fn() },
    };
    const documentRef = {
      body: { appendChild, removeChild },
      createElement: vi.fn(() => anchor),
    };

    const result = openExternalUrl("https://example.com/oauth", { windowRef, documentRef });

    expect(result).toEqual({ opened: true, method: "anchor" });
    expect(anchor.href).toBe("https://example.com/oauth");
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(click).toHaveBeenCalledOnce();
    expect(windowRef.location.assign).not.toHaveBeenCalled();
  });

  it("uses same-window navigation when no DOM fallback is available", () => {
    const assign = vi.fn();
    const windowRef = {
      open: vi.fn(() => null),
      location: { assign },
    };

    const result = openExternalUrl("https://example.com/oauth", { windowRef, documentRef: null });

    expect(result).toEqual({ opened: true, method: "location" });
    expect(assign).toHaveBeenCalledWith("https://example.com/oauth");
  });
});
