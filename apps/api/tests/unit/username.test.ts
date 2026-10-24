import { describe, expect, it } from "vitest";
import { normalizeUsername } from "../../src/auth/username.js";

describe("normalizeUsername", () => {
  it("normalizes case and Unicode compatibility forms", () => {
    expect(normalizeUsername("  Mira.User  ")).toBe("mira.user");
    expect(normalizeUsername("ＴＯＭＺ")).toBe("tomz");
  });

  it("rejects whitespace and punctuation outside the account-name contract", () => {
    expect(() => normalizeUsername("ab")).toThrow();
    expect(() => normalizeUsername("hello world")).toThrow();
    expect(() => normalizeUsername("hello@example.com")).toThrow();
  });
});
