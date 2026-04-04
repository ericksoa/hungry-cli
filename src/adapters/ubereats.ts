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

export class UberEatsAdapter extends BaseAdapter {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor() {
    super("ubereats");
  }

  private get stateDir(): string {
    return resolve(getDataDir(), "ubereats");
  }

  private get authStatePath(): string {
    return resolve(this.stateDir, "auth.json");
  }

  async isAuthenticated(): Promise<boolean> {
    return existsSync(this.authStatePath);
  }

  async auth(): Promise<void> {
    mkdirSync(this.stateDir, { recursive: true });

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://www.ubereats.com/login", {
      waitUntil: "domcontentloaded",
    });

    console.log("\nLog into your Uber Eats account in the browser window.");
    console.log("Once you're on the main page, press Enter here to save the session.\n");

    await new Promise<void>((resolve) => {
      process.stdin.setRawMode?.(false);
      process.stdin.resume();
      process.stdin.once("data", () => resolve());
    });

    await context.storageState({ path: this.authStatePath });
    await browser.close();
    console.log("Session saved.");
  }

  private async getContext(): Promise<BrowserContext> {
    if (this.context) return this.context;

    if (!(await this.isAuthenticated())) {
      throw new Error("Not logged in. Run `hungry auth` first.");
    }

    this.browser = await chromium.launch({ headless: true });
    this.context = await this.browser.newContext({
      storageState: this.authStatePath,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });

    return this.context;
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
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}
