#!/usr/bin/env node

// hungry-cli — food delivery automation from the terminal.

import { Command } from "commander";
import { createAdapter } from "./adapters/index.js";
import { getAdapterName } from "./config.js";
import { formatSearchResults, formatMenu, formatCart } from "./format.js";
import { toonResponse } from "./toon.js";

type OutputFormat = { json?: boolean; toon?: boolean };

/** Print data in the requested format, or fall back to the human formatter. */
function output(data: unknown, opts: OutputFormat, humanFn: () => string): void {
  if (opts.toon) {
    console.log(toonResponse(data));
  } else if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(humanFn());
  }
}

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
  .option("--check", "Check if current session is valid (no browser)")
  .option("--status", "Show auth status")
  .option("--json", "Output as JSON")
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (opts: { check?: boolean; status?: boolean } & OutputFormat) => {
    const a = adapter();
    try {
      if (opts.check || opts.status) {
        const hasSession = await a.isAuthenticated();
        if (!hasSession) {
          const result = { authenticated: false, message: "Not logged in" };
          output(result, opts, () => "Not logged in. Run `hungry auth` to log in.");
          process.exitCode = 1;
          return;
        }
        if (opts.check && "checkSession" in a) {
          const valid = await (a as { checkSession: () => Promise<boolean> }).checkSession();
          const result = { authenticated: true, valid, message: valid ? "Session is valid" : "Session expired" };
          output(result, opts, () => valid ? "Session is valid." : "Session expired. Run `hungry auth` to re-login.");
          if (!valid) process.exitCode = 1;
        } else {
          const result = { authenticated: true, valid: null, message: "Session file exists" };
          output(result, opts, () => "Session file exists. Use --check to verify it's still valid.");
        }
        return;
      }
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
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (queryParts: string[], opts: OutputFormat) => {
    const a = adapter();
    try {
      const query = queryParts.join(" ");
      const results = await a.search(query);
      output(results, opts, () => formatSearchResults(results));
    } finally {
      await a.cleanup();
    }
  });

// --- menu ---
program
  .command("menu <restaurant-url>")
  .description("Browse a restaurant's menu")
  .option("--json", "Output as JSON")
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (restaurantUrl: string, opts: OutputFormat) => {
    const a = adapter();
    try {
      const items = await a.menu(restaurantUrl);
      output(items, opts, () => formatMenu(items));
    } finally {
      await a.cleanup();
    }
  });

// --- cart ---
const cart = program.command("cart").description("Manage your cart");

cart
  .command("add <restaurant-url> <item...>")
  .description("Add an item to your cart")
  .option("--json", "Output as JSON")
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (restaurantUrl: string, itemParts: string[], opts: OutputFormat) => {
    const a = adapter();
    try {
      const itemName = itemParts.join(" ");
      const result = await a.cartAdd(restaurantUrl, itemName);
      output(result, opts, () => `Added "${itemName}" to cart. Total: ${result.cartTotal}`);
    } finally {
      await a.cleanup();
    }
  });

cart
  .command("view")
  .description("View current cart")
  .option("--json", "Output as JSON")
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (opts: OutputFormat) => {
    const a = adapter();
    try {
      const result = await a.cartView();
      output(result, opts, () => formatCart(result));
    } finally {
      await a.cleanup();
    }
  });

cart
  .command("clear")
  .description("Clear your cart")
  .option("--json", "Output as JSON")
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (opts: OutputFormat) => {
    const a = adapter();
    try {
      await a.cartClear();
      const result = { success: true, message: "Cart cleared" };
      output(result, opts, () => "Cart cleared.");
    } finally {
      await a.cleanup();
    }
  });

// --- order ---
program
  .command("order")
  .description("Place your order")
  .option("--confirm", "Actually place the order (without this flag, just shows summary)")
  .option("--json", "Output as JSON")
  .option("--toon", "Output as TOON (LLM-friendly)")
  .action(async (opts: { confirm?: boolean } & OutputFormat) => {
    const a = adapter();
    try {
      const result = await a.order(opts.confirm);
      output(result, opts, () => {
        if (!opts.confirm) {
          const lines = ["Order summary (pass --confirm to place):\n"];
          lines.push(`  Total: ${result.total}`);
          if (result.eta) lines.push(`  ETA:   ${result.eta}`);
          return lines.join("\n");
        }
        if (result.success) {
          const lines = ["Order placed!\n"];
          lines.push(`  Total: ${result.total}`);
          if (result.eta) lines.push(`  ETA:   ${result.eta}`);
          if (result.orderId) lines.push(`  Order: ${result.orderId}`);
          return lines.join("\n");
        }
        return "Order may not have been placed. Check the Uber Eats app.";
      });
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
