#!/usr/bin/env node

// hungry-cli — food delivery automation from the terminal.

import { Command } from "commander";
import { createAdapter } from "./adapters/index.js";
import { getAdapterName } from "./config.js";
import { formatSearchResults, formatMenu, formatCart } from "./format.js";

const program = new Command();

program
  .name("hungry")
  .description("Food delivery from the terminal. No ads, no upsells.")
  .version("0.1.0");

function adapter() {
  return createAdapter(getAdapterName());
}

// --- auth ---
program
  .command("auth")
  .description("Log into your delivery service (opens a browser)")
  .action(async () => {
    const a = adapter();
    try {
      await a.auth();
    } finally {
      await a.cleanup();
    }
  });

// --- search ---
program
  .command("search <query...>")
  .description("Search for food")
  .option("--json", "Output as JSON")
  .action(async (queryParts: string[], opts: { json?: boolean }) => {
    const a = adapter();
    try {
      const query = queryParts.join(" ");
      const results = await a.search(query);
      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(formatSearchResults(results));
      }
    } finally {
      await a.cleanup();
    }
  });

// --- menu ---
program
  .command("menu <restaurant-url>")
  .description("Browse a restaurant's menu")
  .option("--json", "Output as JSON")
  .action(async (restaurantUrl: string, opts: { json?: boolean }) => {
    const a = adapter();
    try {
      const items = await a.menu(restaurantUrl);
      if (opts.json) {
        console.log(JSON.stringify(items, null, 2));
      } else {
        console.log(formatMenu(items));
      }
    } finally {
      await a.cleanup();
    }
  });

// --- cart ---
const cart = program.command("cart").description("Manage your cart");

cart
  .command("add <restaurant-url> <item...>")
  .description("Add an item to your cart")
  .action(async (restaurantUrl: string, itemParts: string[]) => {
    const a = adapter();
    try {
      const itemName = itemParts.join(" ");
      const result = await a.cartAdd(restaurantUrl, itemName);
      console.log(`Added "${itemName}" to cart. Total: ${result.cartTotal}`);
    } finally {
      await a.cleanup();
    }
  });

cart
  .command("view")
  .description("View current cart")
  .action(async () => {
    const a = adapter();
    try {
      const result = await a.cartView();
      console.log(formatCart(result));
    } finally {
      await a.cleanup();
    }
  });

cart
  .command("clear")
  .description("Clear your cart")
  .action(async () => {
    const a = adapter();
    try {
      await a.cartClear();
      console.log("Cart cleared.");
    } finally {
      await a.cleanup();
    }
  });

// --- order ---
program
  .command("order")
  .description("Place your order")
  .option("--confirm", "Actually place the order (without this flag, just shows summary)")
  .action(async (opts: { confirm?: boolean }) => {
    const a = adapter();
    try {
      const result = await a.order(opts.confirm);
      if (!opts.confirm) {
        console.log("Order summary (pass --confirm to place):");
      }
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await a.cleanup();
    }
  });

// --- history ---
program
  .command("history")
  .description("View past orders")
  .option("--days <n>", "Show orders from last N days", "7")
  .action(async (opts: { days: string }) => {
    console.log(`History (last ${opts.days} days) — not yet implemented`);
  });

program.parse();
