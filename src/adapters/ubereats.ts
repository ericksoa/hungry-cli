// Uber Eats adapter — uses Playwright to automate the Uber Eats website.

import { chromium, type BrowserContext, type Browser } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { resolve } from "path";
import {
  BaseAdapter,
  type SearchResult,
  type MenuItem,
  type CartAddResult,
  type CartState,
  type OrderResult,
  type SearchOptions,
} from "../adapter.js";
import { getDataDir } from "../config.js";

const UBEREATS_URL = "https://www.ubereats.com";
const LOGIN_URL = `${UBEREATS_URL}/login`;

// Chromium args to reduce bot detection fingerprinting
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--no-first-run",
  "--no-default-browser-check",
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class UberEatsAdapter extends BaseAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super("ubereats");
  }

  private get stateDir(): string {
    return resolve(getDataDir(), "ubereats");
  }

  private get userDataDir(): string {
    return resolve(this.stateDir, "chrome-profile");
  }

  private get authStatePath(): string {
    return resolve(this.stateDir, "auth.json");
  }

  async isAuthenticated(): Promise<boolean> {
    // Check both: storageState file AND user data dir exist
    return existsSync(this.authStatePath) && existsSync(this.userDataDir);
  }

  async auth(): Promise<void> {
    mkdirSync(this.stateDir, { recursive: true });

    // Use a persistent context with user data dir — this preserves
    // cookies, localStorage, IndexedDB, service workers, and other
    // browser state that storageState alone misses.
    const context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: false,
      args: STEALTH_ARGS,
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
    });

    const page = context.pages()[0] || (await context.newPage());
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

    console.log();
    console.log("  Log into your Uber Eats account in the browser window.");
    console.log("  Complete any 2FA/verification if prompted.");
    console.log();
    console.log("  Once you see the Uber Eats home page, press Enter here.");
    console.log();

    await waitForEnter();

    // Validate that we're actually logged in before saving
    const isLoggedIn = await checkLoggedIn(page);
    if (!isLoggedIn) {
      console.log("  WARNING: Doesn't look like you're logged in yet.");
      console.log("  The session will be saved anyway — you can retry with `hungry auth`.");
    }

    // Save storageState as a portable backup
    await context.storageState({ path: this.authStatePath });
    await context.close();

    console.log("  Session saved to %s", this.stateDir);
  }

  /**
   * Check if the saved session is still valid by loading ubereats.com
   * and checking for login indicators.
   */
  async checkSession(): Promise<boolean> {
    if (!(await this.isAuthenticated())) return false;

    const context = await this.launchContext();
    try {
      const page = await context.newPage();
      await page.goto(UBEREATS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      // Give the page a moment to settle (redirects, JS hydration)
      await page.waitForTimeout(2000);
      return await checkLoggedIn(page);
    } catch {
      return false;
    } finally {
      await this.cleanup();
    }
  }

  private async launchContext(): Promise<BrowserContext> {
    if (this.context) return this.context;

    if (!(await this.isAuthenticated())) {
      throw new Error("Not logged in. Run `hungry auth` first.");
    }

    // Prefer persistent context (user data dir) for best session durability
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: true,
      args: STEALTH_ARGS,
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 900 },
      ignoreDefaultArgs: ["--enable-automation"],
    });

    // launchPersistentContext returns a BrowserContext but we need to track
    // the browser for cleanup — persistent contexts own their browser
    this.browser = this.context.browser();

    return this.context;
  }

  /** Get a ready-to-use browser context. */
  protected async getContext(): Promise<BrowserContext> {
    return this.launchContext();
  }

  async search(_query: string, _opts?: SearchOptions): Promise<SearchResult[]> {
    throw new Error("search() not yet implemented — coming in step 3");
  }

  async menu(_restaurantUrl: string): Promise<MenuItem[]> {
    throw new Error("menu() not yet implemented — coming in step 4");
  }

  async cartAdd(_restaurantUrl: string, _itemName: string): Promise<CartAddResult> {
    throw new Error("cartAdd() not yet implemented — coming in step 5");
  }

  async cartView(): Promise<CartState> {
    throw new Error("cartView() not yet implemented — coming in step 5");
  }

  async cartClear(): Promise<void> {
    throw new Error("cartClear() not yet implemented — coming in step 5");
  }

  async order(_confirm?: boolean): Promise<OrderResult> {
    throw new Error("order() not yet implemented — coming in step 6");
  }

  async cleanup(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
      this.browser = null;
    }
  }
}

/**
 * Check if the current page indicates a logged-in Uber Eats user.
 * Looks for typical logged-in indicators (account avatar, cart, address bar)
 * and absence of login buttons.
 */
async function checkLoggedIn(page: import("playwright").Page): Promise<boolean> {
  try {
    // If we're on the login page, definitely not logged in
    if (page.url().includes("/login")) return false;

    // Look for common logged-in indicators.
    // Uber Eats shows a user avatar/account icon when logged in.
    const loggedInIndicators = [
      "[data-testid='user-avatar']",
      "[data-testid='account-button']",
      "a[href*='/orders']",
      "a[href*='/account']",
      // Cart button is only shown when logged in
      "[data-testid='cart-button']",
    ];

    for (const selector of loggedInIndicators) {
      const el = await page.$(selector);
      if (el) return true;
    }

    // Fallback: check if there's NO "Sign in" / "Log in" button visible
    const loginButton = await page.$("a[href*='/login'], button:has-text('Sign in'), button:has-text('Log in')");
    return loginButton === null;
  } catch {
    return false;
  }
}

/** Wait for the user to press Enter on stdin. */
function waitForEnter(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(false);
    }
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}
