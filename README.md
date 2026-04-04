# hungry-cli

Food delivery from the terminal. No ads, no upsells.

A CLI that automates food delivery services via Playwright, letting you search restaurants, browse menus, manage your cart, and place orders without opening a browser. Built for humans who live in the terminal and AI agents that need structured food delivery APIs.

## Install

```bash
git clone https://github.com/ericksoa/hungry-cli.git
cd hungry-cli
npm install
npx playwright install chromium
npm run build
```

Requires Node.js 22+ and Google Chrome installed.

## Quick Start

```bash
# Log into your delivery service (one-time, opens Chrome)
hungry auth

# Search for food
hungry search "chicken bowl"

# Browse a restaurant's menu (use a URL from search results)
hungry menu "<restaurant-url>"

# Add to cart, view, order
hungry cart add "<restaurant-url>" "Harvest Bowl"
hungry cart view
hungry order              # preview
hungry order --confirm    # place it
```

## Commands

### `hungry auth`

Opens Chrome for you to log into your delivery service. Saves the session for reuse.

```bash
hungry auth            # Open browser to log in
hungry auth --status   # Check if session file exists
hungry auth --check    # Verify session is still valid
```

### `hungry search <query>`

Search for restaurants matching your query. Returns restaurant name, rating, ETA, delivery fee level, and current offers.

```bash
hungry search "sushi"
hungry search "chicken bowl" --json
hungry search "pizza near me" --toon
```

### `hungry menu <restaurant-url>`

Browse a restaurant's full menu organized by category. Use a URL from search results.

```bash
hungry menu "<restaurant-url>" --json
```

### `hungry cart add <restaurant-url> <item>`

Add a menu item to your cart. Opens a headed Chrome window to interact with the delivery service UI.

```bash
hungry cart add "<restaurant-url>" "6 pc. Hot Wings"
```

### `hungry cart view`

View current cart contents.

```bash
hungry cart view
hungry cart view --toon
```

### `hungry cart clear`

Remove all items from the cart.

```bash
hungry cart clear
```

### `hungry order`

Preview or place your order.

```bash
hungry order              # Show summary (total, ETA) without ordering
hungry order --confirm    # Actually place the order
hungry order --toon       # Summary in TOON format for agent consumption
```

## Output Formats

Every command supports three output modes:

| Flag | Format | Use case |
|------|--------|----------|
| _(none)_ | Human-readable | Terminal use |
| `--json` | JSON | Scripts, piping, jq |
| `--toon` | TOON | LLM agents, skills (40% fewer tokens than JSON) |

### TOON Example

```bash
$ hungry search "tacos" --toon
success: true
data[3]{restaurant,restaurantUrl,itemName,description,price,eta,rating}:
  Taco Primo,https://example.com/store/taco-primo/...,Taco Primo,4.7 (500+),Low fee,13 min,4.7
  ...
metadata:
  timestamp: 2026-04-04T12:00:00.000Z
  count: 3
```

[TOON format spec](https://toonformat.dev/)

## How It Works

hungry-cli uses [Playwright](https://playwright.dev/) to automate a real Chrome browser against food delivery websites. There is no official API — all interaction is through browser automation with a pluggable adapter interface.

- **Auth**: Opens Chrome with a persistent user data directory. Your session (cookies, localStorage, IndexedDB) is saved locally in `~/.config/hungry/`.
- **Search/Menu**: Headless Chrome navigates to the delivery service, waits for dynamic content, and scrapes the DOM.
- **Cart/Order**: Headed Chrome (visible window) is used for interactive operations like adding items and placing orders.

### Anti-Detection

- Uses `channel: 'chrome'` to launch your real Chrome installation instead of Playwright's bundled Chromium
- Disables automation indicators (`--disable-blink-features=AutomationControlled`)
- Persistent browser context preserves full session state between runs

## Architecture

```
src/
  cli.ts              # Commander CLI entry point
  adapter.ts          # BaseAdapter interface (pluggable service adapters)
  adapters/
    index.ts          # Adapter registry
    ubereats.ts       # Playwright adapter for food delivery
  config.ts           # Config and data directory management
  format.ts           # Human-readable output formatting
  toon.ts             # TOON (Token-Oriented Object Notation) encoder
```

The adapter interface is pluggable — additional delivery services can be added by implementing `BaseAdapter`.

## Sister Project: LunchClaw

[LunchClaw](../lunchclaw) is a NemoClaw-hosted Telegram bot that uses hungry-cli as its backend to order healthy lunch via chat.

## Development

```bash
npm run build          # Compile TypeScript
npm run dev            # Watch mode
npm test               # Run tests (vitest)
npm run test:coverage  # Coverage report
```

TypeScript only — no `.js` source files.

## License

[Apache 2.0](LICENSE)
