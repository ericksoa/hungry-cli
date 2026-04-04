import { describe, it, expect } from "vitest";
import { formatSearchResults, formatMenu, formatCart } from "./format.js";
import type { SearchResult, MenuItem, CartState } from "./adapter.js";

describe("formatSearchResults", () => {
  it("returns 'No results found.' for empty array", () => {
    expect(formatSearchResults([])).toBe("No results found.");
  });

  it("formats a single result with number, name, restaurant, price, eta", () => {
    const results: SearchResult[] = [
      {
        restaurant: "Sweetgreen",
        restaurantUrl: "https://ubereats.com/store/sweetgreen",
        itemName: "Harvest Bowl",
        description: "Warm quinoa, roasted chicken",
        price: "$14.95",
        eta: "25 min",
        rating: "4.7",
      },
    ];
    const output = formatSearchResults(results);
    expect(output).toContain("1. Harvest Bowl — Sweetgreen");
    expect(output).toContain("$14.95");
    expect(output).toContain("25 min");
    expect(output).toContain("Warm quinoa, roasted chicken");
  });

  it("formats multiple results with sequential numbering", () => {
    const results: SearchResult[] = [
      {
        restaurant: "Place A",
        restaurantUrl: "",
        itemName: "Item A",
        description: "",
        price: "$10",
        eta: "20 min",
        rating: "",
      },
      {
        restaurant: "Place B",
        restaurantUrl: "",
        itemName: "Item B",
        description: "",
        price: "$15",
        eta: "30 min",
        rating: "",
      },
    ];
    const output = formatSearchResults(results);
    expect(output).toContain("1. Item A — Place A");
    expect(output).toContain("2. Item B — Place B");
  });

  it("uses '??' for missing price and eta", () => {
    const results: SearchResult[] = [
      {
        restaurant: "Place",
        restaurantUrl: "",
        itemName: "Mystery Item",
        description: "",
        price: "",
        eta: "",
        rating: "",
      },
    ];
    const output = formatSearchResults(results);
    expect(output).toContain("No details");
  });
});

describe("formatMenu", () => {
  it("returns 'No menu items found.' for empty array", () => {
    expect(formatMenu([])).toBe("No menu items found.");
  });

  it("formats items with category headers", () => {
    const items: MenuItem[] = [
      { itemName: "Caesar Salad", description: "Romaine, croutons", price: "$12", category: "Salads" },
      { itemName: "Greek Salad", description: "Feta, olives", price: "$11", category: "Salads" },
      { itemName: "Grilled Chicken", description: "", price: "$16", category: "Entrees" },
    ];
    const output = formatMenu(items);
    expect(output).toContain("── Salads ──");
    expect(output).toContain("── Entrees ──");
    expect(output).toContain("Caesar Salad  $12");
    expect(output).toContain("    Romaine, croutons");
    expect(output).toContain("Greek Salad  $11");
    expect(output).toContain("Grilled Chicken  $16");
  });

  it("does not repeat the same category header", () => {
    const items: MenuItem[] = [
      { itemName: "A", description: "", price: "$1", category: "Bowls" },
      { itemName: "B", description: "", price: "$2", category: "Bowls" },
    ];
    const output = formatMenu(items);
    const matches = output.match(/── Bowls ──/g);
    expect(matches).toHaveLength(1);
  });

  it("skips description line when description is empty", () => {
    const items: MenuItem[] = [
      { itemName: "Plain Bowl", description: "", price: "$10", category: "Bowls" },
    ];
    const output = formatMenu(items);
    const lines = output.split("\n").filter((l) => l.trim());
    // Should have category header and item line, no description line
    expect(lines).toHaveLength(2);
  });

  it("handles items with no category", () => {
    const items: MenuItem[] = [
      { itemName: "Special", description: "Chef's choice", price: "$20", category: "" },
    ];
    const output = formatMenu(items);
    expect(output).not.toContain("──");
    expect(output).toContain("Special  $20");
  });

  it("handles items with empty price", () => {
    const items: MenuItem[] = [
      { itemName: "Market Price Fish", description: "Ask server", price: "", category: "Specials" },
    ];
    const output = formatMenu(items);
    // Should show item name with no price, just trailing spaces
    expect(output).toContain("Market Price Fish");
    expect(output).not.toContain("$");
  });
});

describe("formatCart", () => {
  it("returns 'Cart is empty.' for empty items", () => {
    const cart: CartState = {
      items: [],
      total: "$0",
      deliveryFee: "",
      serviceFee: "",
    };
    expect(formatCart(cart)).toBe("Cart is empty.");
  });

  it("formats cart items with quantity, name, price, and subtotal", () => {
    const cart: CartState = {
      items: [
        { name: "Salmon Bowl", price: "$16.99", qty: 1 },
        { name: "Green Tea", price: "$3.50", qty: 2 },
      ],
      total: "$23.99",
      deliveryFee: "$2.99",
      serviceFee: "$1.50",
    };
    const output = formatCart(cart);
    expect(output).toContain("1x Salmon Bowl  $16.99");
    expect(output).toContain("2x Green Tea  $3.50");
    expect(output).toContain("Subtotal: $23.99");
    expect(output).toContain("Delivery: $2.99");
    expect(output).toContain("Service fee: $1.50");
  });

  it("omits delivery fee line when empty", () => {
    const cart: CartState = {
      items: [{ name: "Salad", price: "$12", qty: 1 }],
      total: "$12",
      deliveryFee: "",
      serviceFee: "$1.00",
    };
    const output = formatCart(cart);
    expect(output).not.toContain("Delivery:");
    expect(output).toContain("Service fee: $1.00");
  });

  it("omits service fee line when empty", () => {
    const cart: CartState = {
      items: [{ name: "Salad", price: "$12", qty: 1 }],
      total: "$12",
      deliveryFee: "$2.99",
      serviceFee: "",
    };
    const output = formatCart(cart);
    expect(output).toContain("Delivery: $2.99");
    expect(output).not.toContain("Service fee:");
  });
});
