import { describe, it, expect } from "vitest";

import { createPageUrl } from "../index";

describe("createPageUrl", () => {
  it("preserves original casing and strips spaces", () => {
    expect(createPageUrl("Dashboard")).toBe("/Dashboard");
    expect(createPageUrl("  Data Spaces  ")).toBe("/DataSpaces");
  });
});
