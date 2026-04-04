# hungry-cli

Food delivery automation CLI with pluggable service adapters. Uses Playwright to automate Uber Eats.

## Sister Project

**lunchclaw** (`../lunchclaw`) is a NemoClaw-hosted Telegram bot that consumes hungry-cli as its backend. Build hungry-cli first, then wire lunchclaw to it.

## Build Plan

### Phase 1: hungry-cli core (this repo)

| Step | Feature | Status |
|------|---------|--------|
| 1 | Scaffold (CLI, adapter interface, config) | Done |
| 2 | Auth flow (Playwright persistent context, stealth, session check) | Done |
| 3 | `hungry search <query>` — scrape Uber Eats search results | Done |
| **4** | **`hungry menu <url>` — scrape restaurant menu** | **Next** |
| 5 | `hungry cart add/view/clear` — cart operations | Pending |
| 6 | `hungry order [--confirm]` — order summary + placement | Pending |

#### Validation checkpoints (Phase 1)

Each step MUST pass these before moving on:
- **Build**: `npm run build` succeeds with no errors
- **Unit tests**: `npm test` passes (including new tests for the step)
- **Manual smoke test**: Run the actual CLI command against live Uber Eats and confirm real output. Paste the output into the conversation so we can eyeball it together.
  - Step 3: `hungry search "chicken bowl"` — should print real restaurants/items
  - Step 4: `hungry menu <a-real-url-from-step-3>` — should print real menu items
  - Step 5: `hungry cart add <url> <item>`, `hungry cart view`, `hungry cart clear`
  - Step 6: `hungry order` (no --confirm) — should show summary without placing

Do NOT proceed to the next step until the current step's manual smoke test is reviewed.

### Phase 2: Wire lunchclaw to hungry-cli

| Step | What |
|------|------|
| 7 | Add hungry-cli as dependency in lunchclaw sandbox-app |
| 8 | Replace bot.ts placeholders with hungry-cli calls (search, menu, cart, order) |
| 9 | Integrate history.ts — record orders after placement |
| 10 | End-to-end: Telegram msg -> search -> pick -> confirm -> order |

#### Validation checkpoints (Phase 2)

- **Step 7**: `npm run build` in sandbox-app succeeds, can `import { UberEatsAdapter } from "hungry-cli"`
- **Step 8**: Unit tests for bot.ts pass with mocked adapter
- **Step 9**: Unit tests for history integration pass
- **Step 10**: Manual end-to-end test via real Telegram bot. Send a message, get food options back, pick one, confirm. Walk through the full flow together and verify each step produces correct output.

### Phase 3: Deploy

| Step | What |
|------|------|
| 11 | Test setup.sh against real NemoClaw sandbox |
| 12 | Auth flow inside sandbox (one-time Uber Eats login) |
| 13 | Bot live on Telegram |

#### Validation checkpoints (Phase 3)

- **Step 11**: `./scripts/setup.sh` runs clean, sandbox is provisioned, `openshell sandbox list` shows lunchclaw
- **Step 12**: `hungry auth` inside sandbox opens browser, login succeeds, `hungry auth --check` confirms session
- **Step 13**: Full Telegram conversation works end-to-end from phone

## Dev

- TypeScript only, no .js source files
- `npm run build` to compile, `npm test` to run vitest
- Adapter stubs in `src/adapters/ubereats.ts` have step numbers in their error messages
- Config/data lives in `~/.config/hungry/`
