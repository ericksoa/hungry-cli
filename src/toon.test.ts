import { describe, it, expect } from "vitest";
import { toToon, toonResponse } from "./toon.js";

describe("toToon", () => {
  it("encodes primitives", () => {
    expect(toToon(null)).toBe("null");
    expect(toToon(true)).toBe("true");
    expect(toToon(42)).toBe("42");
    expect(toToon("hello")).toBe("hello");
  });

  it("quotes strings with special characters", () => {
    expect(toToon("has, comma")).toBe('"has, comma"');
    expect(toToon("has: colon")).toBe('"has: colon"');
    expect(toToon("")).toBe('""');
  });

  it("encodes a simple object", () => {
    const result = toToon({ name: "Taco", price: 5.99 });
    expect(result).toContain("name: Taco");
    expect(result).toContain("price: 5.99");
  });

  it("encodes nested objects with indentation", () => {
    const result = toToon({ context: { task: "lunch", location: "SF" } });
    expect(result).toContain("context:");
    expect(result).toContain("  task: lunch");
    expect(result).toContain("  location: SF");
  });

  it("encodes uniform arrays as tabular", () => {
    const data = {
      items: [
        { name: "Bowl", price: 12.5 },
        { name: "Salad", price: 9.0 },
      ],
    };
    const result = toToon(data);
    expect(result).toContain("items[2]{name,price}:");
    expect(result).toContain("Bowl,12.5");
    expect(result).toContain("Salad,9");
  });

  it("encodes empty arrays", () => {
    const result = toToon({ items: [] });
    expect(result).toContain("items[0]:");
  });
});

describe("toonResponse", () => {
  it("wraps data in a response envelope", () => {
    const result = toonResponse([{ a: 1 }]);
    expect(result).toContain("success: true");
    expect(result).toContain("count: 1");
    expect(result).toContain("timestamp:");
  });

  it("sets count from array length", () => {
    const result = toonResponse([1, 2, 3]);
    expect(result).toContain("count: 3");
  });

  it("sets success to false when specified", () => {
    const result = toonResponse(null, false);
    expect(result).toContain("success: false");
  });
});
