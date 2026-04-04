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
// Uber Eats /login redirects to the landing page when not authenticated.
// Use the Uber auth flow directly — it reliably shows the login form.
const LOGIN_URL = "https://auth.uber.com/v2/?uber_client_id=eats&flow=web-eater-v1&next_url=https%3A%2F%2Fwww.ubereats.com";

// Chromium args to reduce bot detection fingerprinting
const STEALTH_ARGS = [
  "--disable-blink-features=AutomationControlled",
  "--disable-features=IsolateOrigins,site-per-process",
  "--no-first-run",
  "--no-default-browser-check",
];

// Common launch options shared between auth and headless contexts.
// Uses channel: 'chrome' to launch the user's real Chrome installation
// instead of Playwright's bundled Chromium — much harder to detect as automation.
const LAUNCH_OPTIONS = {
  args: STEALTH_ARGS,
  viewport: { width: 1280, height: 900 } as const,
  ignoreDefaultArgs: ["--enable-automation"],
  channel: "chrome" as const,
};

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
      ...LAUNCH_OPTIONS,
      headless: false,
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
      ...LAUNCH_OPTIONS,
      headless: true,
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

  async search(query: string, _opts?: SearchOptions): Promise<SearchResult[]> {
    const context = await this.launchContext();
    const page = await context.newPage();

    try {
      // Navigate to Uber Eats search — the URL pattern handles the query directly
      const searchUrl = `${UBEREATS_URL}/search?q=${encodeURIComponent(query)}`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 20000 });

      // Wait for search results to render — Uber Eats loads results dynamically.
      // Look for links to /store/ pages which indicate restaurant result cards.
      await page.waitForSelector('a[href*="/store/"]', { timeout: 15000 }).catch(() => {
        // No results found within timeout — return empty
      });

      // Give the page a moment for remaining cards to hydrate
      await page.waitForTimeout(2000);

      // Scrape restaurant cards from the search results.
      // Each card is an <a> to /store/, but the metadata (rating, ETA, fee)
      // may live in the link itself or in the closest containing card element.
      // We walk up to the nearest shared parent to capture all text.
      const results = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/store/"]'));

        // Deduplicate by href (Uber Eats often renders duplicate links)
        const seen = new Set<string>();
        const unique: { link: Element; container: Element }[] = [];
        for (const link of links) {
          const href = link.getAttribute("href") || "";
          if (seen.has(href)) continue;
          seen.add(href);

          // Walk up to find the card container — typically 2-4 levels up.
          // The card container holds the link plus sibling metadata.
          let container: Element = link;
          for (let i = 0; i < 5; i++) {
            const parent = container.parentElement;
            if (!parent) break;
            // Stop if we've reached a list-like container (has many children)
            // or something that looks like a grid/list wrapper
            if (parent.children.length > 5) break;
            container = parent;
          }
          unique.push({ link, container });
        }

        return unique.slice(0, 20).map(({ link, container }) => {
          const href = link.getAttribute("href") || "";

          // Grab text from the full card container, not just the link
          const allText = (container.textContent || "").replace(/\s+/g, " ").trim();

          // Restaurant name: look for h3 in the container
          const h3 = container.querySelector("h3");
          const restaurant = h3?.textContent?.trim() || "";

          // Rating: "4.6Star" or "4.6 Star" pattern
          const ratingMatch = allText.match(/(\d\.\d)\s*Star/);
          const rating = ratingMatch ? ratingMatch[1] : "";

          // Rating count: "(1,000+)" or "(370+)" after Star
          const ratingCountMatch = allText.match(/Star\(([^)]+)\)/);
          const ratingCount = ratingCountMatch ? ratingCountMatch[1] : "";

          // ETA: "XX min" at end of text, after bullet
          const etaMatch = allText.match(/(\d+)\s*min/);
          const eta = etaMatch ? `${etaMatch[1]} min` : "";

          // Delivery fee level: "Low Delivery Fee" or "Moderate Delivery Fee"
          const feeMatch = allText.match(/(Low|Moderate|High)\s*Delivery\s*Fee/i);
          const deliveryFee = feeMatch ? `${feeMatch[1]} fee` : "";

          // Offers: "40% off (Spend $40)" or "Buy 1, Get 1 Free" or "Spend $20, Save $5"
          const offerMatch = allText.match(
            /(?:Top Offer\s*[•·]\s*)?(\d+%\s*off\s*\([^)]+\)|Buy\s*1,\s*Get\s*1\s*Free|Spend\s*\$\d+,\s*Save\s*\$\d+|Free\s*Item\s*\([^)]+\)|\d+\s*Offers?\s*Available)/i,
          );
          const offer = offerMatch ? offerMatch[1] : "";

          // Build the full URL
          const baseUrl = window.location.origin;
          const restaurantUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;

          // Build a clean description from the extracted parts
          const descParts = [
            ratingCount ? `${rating} (${ratingCount})` : rating,
            offer,
          ].filter(Boolean);
          const description = descParts.join(" · ");

          const price = deliveryFee;

          return {
            restaurant,
            restaurantUrl,
            itemName: restaurant,
            description,
            price,
            eta,
            rating,
          };
        });
      });

      return results.filter((r) => r.restaurant.length > 0);
    } finally {
      await page.close();
    }
  }

  async menu(restaurantUrl: string): Promise<MenuItem[]> {
    const context = await this.launchContext();
    const page = await context.newPage();

    try {
      // Restaurant URLs from search are full URLs or /store/ paths
      const url = restaurantUrl.startsWith("http")
        ? restaurantUrl
        : `${UBEREATS_URL}${restaurantUrl}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

      // Wait for menu content to render
      await page.waitForSelector('a[href*="/store/"], ul, [role="list"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(3000);

      // Scrape menu items from the restaurant page.
      // Uber Eats menu structure (from debug analysis):
      // - Category headings are <h3> elements ("Bowls", "Salads", "Drinks")
      // - Menu items are <a> links to the same store URL containing
      //   "ItemName$XX.XXDescription text..." as concatenated text
      // - The store's own URL path identifies which links are menu items
      //   vs. links to other restaurants
      const items = await page.evaluate((storeUrl: string) => {
        const results: {
          itemName: string;
          description: string;
          price: string;
          category: string;
        }[] = [];

        // Extract the store path to filter links (e.g., "/store/sweetgreen-marina/...")
        const storePath = new URL(storeUrl).pathname.split("?")[0];
        const storeSlug = storePath.split("/").filter(Boolean).slice(0, 2).join("/");

        // Build a map of category headings by their position in the DOM
        // so we can assign each item to its nearest preceding heading
        const headings = Array.from(document.querySelectorAll("h3"));
        const categoryHeadings = headings
          .map((h) => ({
            text: h.textContent?.trim() || "",
            top: h.getBoundingClientRect().top,
          }))
          .filter((h) => h.text.length > 0 && h.text.length < 50);

        // Find all <a> links that point to this store and contain a price
        const links = Array.from(document.querySelectorAll('a[href*="/store/"]'));
        const seenNames = new Set<string>();

        for (const link of links) {
          const href = link.getAttribute("href") || "";
          // Only links to THIS store are menu items
          if (!href.includes(storeSlug)) continue;

          const allText = (link.textContent || "").replace(/\s+/g, " ").trim();

          // Must contain a price to be a menu item
          const priceMatch = allText.match(/\$(\d+\.\d{2})/);
          if (!priceMatch) continue;

          const price = `$${priceMatch[1]}`;

          // Item name: text before the price.
          // Strip common prefixes like "#1 most liked", "Plus small"
          let beforePrice = allText.split(priceMatch[0])[0].trim();
          beforePrice = beforePrice
            .replace(/^#\d+\s*most\s*liked\s*/i, "")
            .replace(/^Plus\s*small\s*/i, "")
            .trim();

          if (!beforePrice || beforePrice.length < 2) continue;
          if (seenNames.has(beforePrice)) continue;
          seenNames.add(beforePrice);

          // Description: text after the price
          const afterPrice = allText.split(priceMatch[0]).slice(1).join("").trim();
          // Clean up UI artifacts that leak into text content
          const description = afterPrice
            .replace(/Plus\s*small\s*/gi, "")
            .replace(/^Create your own\s*/i, "")
            .trim()
            .slice(0, 200);

          // Find the nearest category heading above this link
          const linkTop = link.getBoundingClientRect().top;
          let category = "";
          for (let i = categoryHeadings.length - 1; i >= 0; i--) {
            if (categoryHeadings[i].top < linkTop) {
              category = categoryHeadings[i].text;
              break;
            }
          }

          results.push({
            itemName: beforePrice,
            description,
            price,
            category,
          });
        }

        return results;
      }, url);

      return items.filter((i) => i.itemName.length > 0);
    } finally {
      await page.close();
    }
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
