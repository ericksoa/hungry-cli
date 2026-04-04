import { describe, it, expect } from "vitest";
import { createAdapter } from "./index.js";
import { UberEatsAdapter } from "./ubereats.js";

describe("createAdapter", () => {
  it("creates an UberEatsAdapter for 'ubereats'", () => {
    const adapter = createAdapter("ubereats");
    expect(adapter).toBeInstanceOf(UberEatsAdapter);
    expect(adapter.name).toBe("ubereats");
  });

  it("throws for unknown adapter names", () => {
    expect(() => createAdapter("pizzahut")).toThrow(
      'Unknown adapter "pizzahut". Available: ubereats',
    );
  });

  it("error message lists all available adapters", () => {
    try {
      createAdapter("nope");
    } catch (e) {
      expect((e as Error).message).toContain("Available:");
      expect((e as Error).message).toContain("ubereats");
    }
  });
});
