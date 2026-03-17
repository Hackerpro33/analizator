import { beforeEach, describe, expect, it } from "vitest";

import { clearRememberedAccount, loadRememberedAccount, saveRememberedAccount } from "./rememberedAccount";

describe("rememberedAccount", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores and restores remembered email", () => {
    saveRememberedAccount("user@example.com");

    expect(loadRememberedAccount()).toEqual({ email: "user@example.com" });
  });

  it("clears remembered account when email is empty", () => {
    saveRememberedAccount("user@example.com");
    saveRememberedAccount("");

    expect(loadRememberedAccount()).toBeNull();
  });

  it("clears remembered account explicitly", () => {
    saveRememberedAccount("user@example.com");
    clearRememberedAccount();

    expect(loadRememberedAccount()).toBeNull();
  });
});
