// Output formatting for CLI display.

import type { SearchResult, MenuItem, CartState } from "./adapter.js";

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return "No results found.";

  const lines: string[] = [];
  for (const [i, r] of results.entries()) {
    // For restaurant-level results, itemName === restaurant — don't repeat it
    const title = r.itemName && r.itemName !== r.restaurant
      ? `${r.itemName} — ${r.restaurant}`
      : r.restaurant;
    const details = [r.price, r.eta, r.description].filter(Boolean).join(" · ");
    lines.push(`${i + 1}. ${title}\n   ${details || "No details"}`);
  }
  return lines.join("\n\n");
}

export function formatMenu(items: MenuItem[]): string {
  if (items.length === 0) return "No menu items found.";

  const lines: string[] = [];
  let currentCategory: string | null = null;

  for (const item of items) {
    if (item.category && item.category !== currentCategory) {
      currentCategory = item.category;
      lines.push(`\n── ${currentCategory} ──`);
    }
    lines.push(`  ${item.itemName}  ${item.price || ""}`);
    if (item.description) {
      lines.push(`    ${item.description}`);
    }
  }
  return lines.join("\n");
}

export function formatCart(cart: CartState): string {
  if (cart.items.length === 0) return "Cart is empty.";

  const lines: string[] = [];
  for (const item of cart.items) {
    lines.push(`  ${item.qty}x ${item.name}  ${item.price}`);
  }
  lines.push("");
  lines.push(`  Subtotal: ${cart.total}`);
  if (cart.deliveryFee) lines.push(`  Delivery: ${cart.deliveryFee}`);
  if (cart.serviceFee) lines.push(`  Service fee: ${cart.serviceFee}`);
  return lines.join("\n");
}
