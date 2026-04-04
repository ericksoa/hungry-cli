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

  private async launchContext(headless = true): Promise<BrowserContext> {
    // If we already have a context, only reuse it if the headless mode matches
    if (this.context) {
      // Can't switch headless mode on an existing context — just reuse
      return this.context;
    }

    if (!(await this.isAuthenticated())) {
      throw new Error("Not logged in. Run `hungry auth` first.");
    }

    // Prefer persistent context (user data dir) for best session durability
    this.context = await chromium.launchPersistentContext(this.userDataDir, {
      ...LAUNCH_OPTIONS,
      headless,
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

  async cartAdd(restaurantUrl: string, itemName: string): Promise<CartAddResult> {
    // Cart interactions need headed mode — Uber Eats blocks clicks in headless
    await this.cleanup(); // close any existing headless context
    const context = await this.launchContext(false);
    const page = await context.newPage();

    try {
      const url = restaurantUrl.startsWith("http")
        ? restaurantUrl
        : `${UBEREATS_URL}${restaurantUrl}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForSelector('a[href*="/store/"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // Find the menu item link by matching item name in the link text.
      // Use case-insensitive partial match since names may not be exact.
      const lowerName = itemName.toLowerCase();
      const itemLink = await page.evaluateHandle((name: string) => {
        const links = Array.from(document.querySelectorAll('a[href*="/store/"]'));
        return links.find((a) => {
          const text = (a.textContent || "").toLowerCase();
          // Must contain a price to be a menu item link
          return text.includes(name) && /\$\d+\.\d{2}/.test(text);
        }) || null;
      }, lowerName);

      if (!itemLink || !(await itemLink.asElement())) {
        throw new Error(`Item "${itemName}" not found on the menu.`);
      }

      // Click the item to open the detail/customization modal
      await (itemLink.asElement()!).click();
      await page.waitForTimeout(1500);

      // Click "Add to order" button in the modal.
      // Look for buttons with text containing "Add to order" or "Add X to order"
      const addButton = page.getByRole("button", { name: /add.*to order|add \d+ to order/i });
      await addButton.waitFor({ timeout: 8000 });
      await addButton.click();
      await page.waitForTimeout(2000);

      // After adding, try to read the cart count from the page
      const cartInfo = await page.evaluate(() => {
        // Look for cart badge or button showing item count and total
        const cartButton = document.querySelector('[data-testid="cart-button"], a[href*="/checkout"]');
        const text = cartButton?.textContent || "";
        const countMatch = text.match(/(\d+)\s*item/i);
        const totalMatch = text.match(/\$[\d.]+/);
        return {
          count: countMatch ? parseInt(countMatch[1], 10) : 1,
          total: totalMatch ? totalMatch[0] : "",
        };
      });

      return {
        success: true,
        cartTotal: cartInfo.total || "see cart",
        itemCount: cartInfo.count,
      };
    } finally {
      await page.close();
    }
  }

  async cartView(): Promise<CartState> {
    await this.cleanup();
    const context = await this.launchContext(false);
    const page = await context.newPage();

    try {
      // Go to Uber Eats feed — the cart is accessible from the top nav.
      await page.goto(UBEREATS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(3000);

      // The cart button in the top nav has aria-label like "1 cart" or "2 cart".
      // Click it to open the cart sidebar.
      const cartButton = page.locator('button[aria-label*="cart" i]').first();
      let cartOpened = false;
      if (await cartButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await cartButton.click();
        // Wait for the sidebar to fully render
        await page.waitForTimeout(4000);
        cartOpened = true;
        if (process.env.HUNGRY_DEBUG) {
          console.error(`Cart button clicked: ${cartOpened}`);
        }
      } else if (process.env.HUNGRY_DEBUG) {
        console.error("Cart button NOT found");
      }

      if (process.env.HUNGRY_DEBUG) {
        const debug = await page.evaluate(() => {
          const info: string[] = [];
          info.push(`URL: ${location.href}`);
          // Show text around "Harvest" in the full body text
          const full = (document.body.textContent || "");
          const idx = full.indexOf("Harvest");
          if (idx >= 0) {
            info.push(`\nText around "Harvest" (raw, no whitespace collapse):`);
            info.push(`  "${full.slice(Math.max(0, idx - 60), idx + 80)}"`);
          }
          const collapsed = full.replace(/\s+/g, " ");
          const idx2 = collapsed.indexOf("Harvest");
          if (idx2 >= 0) {
            info.push(`\nText around "Harvest" (collapsed):`);
            info.push(`  "${collapsed.slice(Math.max(0, idx2 - 60), idx2 + 80)}"`);
          }
          // Test the regex directly
          const pattern = /Chevron right small(.+?)bases:/g;
          const m = pattern.exec(collapsed);
          info.push(`\nRegex match: ${m ? JSON.stringify(m[1]) : "NO MATCH"}`);
          // Also check if "Chevron right small" even exists in the text
          info.push(`Contains "Chevron right small": ${collapsed.includes("Chevron right small")}`);
          // Look specifically for the cart sidebar content
          // The Increment/Decrement buttons indicate cart items are present
          const decrementBtns = document.querySelectorAll('button[aria-label="Decrement"]');
          info.push(`\nDecrement buttons found: ${decrementBtns.length}`);
          decrementBtns.forEach((btn, i) => {
            // Walk up to find the cart item container
            let container = btn.parentElement;
            for (let j = 0; j < 6 && container; j++) {
              container = container.parentElement;
            }
            if (container) {
              info.push(`  Item ${i}: "${container.textContent?.replace(/\s+/g, " ").trim().slice(0, 200)}"`);
            }
          });
          info.push(`\nAll $ text (first 15):`);
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let count = 0;
          let node: Text | null;
          while ((node = walker.nextNode() as Text | null) && count < 15) {
            const t = node.textContent?.trim() || "";
            if (t.includes("$") && t.length < 60) {
              info.push(`  "${t}"`);
              count++;
            }
          }
          return info.join("\n");
        });
        console.error(debug);
      }

      // Parse cart from the sidebar. The sidebar shows item names with
      // customization text like "Harvest Bowl bases: included Kale..."
      // but doesn't show individual prices. We extract what we can.
      const cart = await page.evaluate(() => {
        const allText = (document.body.textContent || "").replace(/\s+/g, " ");

        // Only treat as empty if there's no cart button with a count
        const hasCartButton = !!document.querySelector('button[aria-label*="cart"]');
        if (!hasCartButton && /your cart is empty/i.test(allText)) {
          return { items: [] as { name: string; price: string; qty: number }[], total: "$0.00", deliveryFee: "", serviceFee: "" };
        }

        // Get cart item count from the cart button aria-label ("1 cart", "3 cart")
        const cartBtn = document.querySelector('button[aria-label*="cart"]') ||
          document.querySelector('button[aria-label*="Cart"]');
        const cartLabel = cartBtn?.getAttribute("aria-label") || "";
        const countMatch = cartLabel.match(/(\d+)/);
        const itemCount = countMatch ? parseInt(countMatch[1], 10) : 0;

        // The cart sidebar text follows a pattern like:
        // "Close [store] [store] [address] Chevron right small [ItemName] bases: ..."
        // Extract item names by looking for text between "Chevron right small" and "bases:"
        const items: { name: string; price: string; qty: number }[] = [];

        // Look for "Go to checkout" button which often has the total
        const checkoutBtn = document.querySelector('a[href*="checkout"], button');
        let total = "";
        document.querySelectorAll("a, button").forEach((el) => {
          const t = el.textContent?.trim() || "";
          if (/go to checkout/i.test(t)) {
            const priceMatch = t.match(/\$[\d.]+/);
            if (priceMatch) total = priceMatch[0];
          }
        });

        const fullText = allText; // already collapsed above

        const itemPattern = /Chevron right small(.+?)bases:/g;
        let match;
        const itemCounts = new Map<string, number>();
        while ((match = itemPattern.exec(fullText)) !== null) {
          const name = match[1].trim();
          if (name.length >= 2 && name.length < 80) {
            itemCounts.set(name, (itemCounts.get(name) || 0) + 1);
          }
        }

        // Also try pattern without "bases:" for items that don't have customization
        // e.g., drinks: "Chevron right small[ItemName]$XX.XX" or just "Chevron right small[ItemName]1"
        if (itemCounts.size === 0) {
          const altPattern = /Chevron right small([A-Z][^$\d]{2,60?}?)(?:\$|\d)/g;
          while ((match = altPattern.exec(fullText)) !== null) {
            const name = match[1].trim();
            if (name.length >= 2 && name.length < 80) {
              itemCounts.set(name, (itemCounts.get(name) || 0) + 1);
            }
          }
        }

        const dedupedItems = Array.from(itemCounts.entries()).map(([name, qty]) => ({
          name,
          price: "",
          qty,
        }));

        // If no items found and count is 0, cart is empty
        if (dedupedItems.length === 0 && itemCount === 0) {
          return { items: [] as { name: string; price: string; qty: number }[], total: "$0.00", deliveryFee: "", serviceFee: "" };
        }

        // If no items found via regex but count > 0, create a generic summary
        const finalItems = dedupedItems.length > 0 ? dedupedItems : [{
          name: `${itemCount} item(s)`,
          price: total,
          qty: itemCount,
        }];

        return {
          items: finalItems,
          total: total || "see checkout",
          deliveryFee: "",
          serviceFee: "",
        };
      });

      return cart;
    } finally {
      await page.close();
    }
  }

  async cartClear(): Promise<void> {
    await this.cleanup();
    const context = await this.launchContext(false);
    const page = await context.newPage();

    try {
      // Go to home page and open the cart sidebar
      await page.goto(UBEREATS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(3000);

      // Click the cart button (aria-label "N cart") to open the sidebar
      const cartButton = page.locator('button[aria-label*="cart" i]').first();
      if (!(await cartButton.isVisible({ timeout: 5000 }).catch(() => false))) {
        // No cart button = cart is already empty
        return;
      }
      await cartButton.click();
      await page.waitForTimeout(3000);

      // Inside the cart sidebar, use the Decrement buttons to reduce qty to 0.
      // Each click on Decrement reduces by 1; when qty hits 0 the item is removed.
      // This is more reliable than finding "Remove" buttons which may not exist.
      for (let i = 0; i < 50; i++) {
        const decBtn = page.locator('button[aria-label="Decrement"]').first();
        if (!(await decBtn.isVisible({ timeout: 2000 }).catch(() => false))) break;
        await decBtn.click();
        await page.waitForTimeout(500);
      }

      await page.waitForTimeout(1000);
    } finally {
      await page.close();
    }
  }

  async order(confirm?: boolean): Promise<OrderResult> {
    // Use headed mode — checkout page needs full JS rendering
    await this.cleanup();
    const context = await this.launchContext(false);
    const page = await context.newPage();

    try {
      // Navigate to home and open cart sidebar to get to checkout
      await page.goto(UBEREATS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      await page.waitForTimeout(3000);

      // Click the cart button to open sidebar
      const cartButton = page.locator('button[aria-label*="cart" i]').first();
      if (!(await cartButton.isVisible({ timeout: 5000 }).catch(() => false))) {
        throw new Error("Cart is empty. Add items first.");
      }
      await cartButton.click();
      await page.waitForTimeout(3000);

      // Click "Go to checkout" in the sidebar
      const checkoutLink = page.locator('a:has-text("Go to checkout"), a:has-text("checkout"), button:has-text("Go to checkout")').first();
      if (await checkoutLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await checkoutLink.click();
        await page.waitForTimeout(4000);
      } else {
        // Try navigating directly
        await page.goto(`${UBEREATS_URL}/checkout`, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await page.waitForTimeout(4000);
      }

      // Scrape the checkout page for order summary
      const summary = await page.evaluate(() => {
        const allText = (document.body.textContent || "").replace(/\s+/g, " ");

        // Extract totals
        const subtotalMatch = allText.match(/Subtotal\s*\$?([\d.]+)/i);
        const deliveryMatch = allText.match(/Delivery Fee\s*\$?([\d.]+)/i);
        const serviceMatch = allText.match(/Service Fee\s*\$?([\d.]+)/i);
        const taxMatch = allText.match(/(?:Tax|Estimated Tax)\s*\$?([\d.]+)/i);
        const totalMatch = allText.match(/Total\s*\$?([\d.]+)/i);

        // Extract ETA — look for "XX–YY min" or "XX min" patterns
        // Use word boundary or whitespace before digits to avoid matching "0022min"
        const etaMatch = allText.match(/(?:^|\s)(\d{1,3}[\u2013\u2014–-]\d{1,3}\s*min)(?:\s|$)/i)
          || allText.match(/(?:^|\s)(\d{1,3}\s+min)(?:\s|$)/i);
        const eta = etaMatch ? etaMatch[1].trim() : "";

        // Extract delivery address
        const addressMatch = allText.match(/Deliver(?:y|ing)?\s*to\s*([^·•\n]{5,60})/i);
        const address = addressMatch ? addressMatch[1].trim() : "";

        return {
          subtotal: subtotalMatch ? `$${subtotalMatch[1]}` : "",
          deliveryFee: deliveryMatch ? `$${deliveryMatch[1]}` : "",
          serviceFee: serviceMatch ? `$${serviceMatch[1]}` : "",
          tax: taxMatch ? `$${taxMatch[1]}` : "",
          total: totalMatch ? `$${totalMatch[1]}` : "",
          eta,
          address,
        };
      });

      if (!confirm) {
        // Just return the summary without placing the order
        return {
          success: false,
          total: summary.total || "unknown",
          eta: summary.eta || "unknown",
          orderId: "",
        };
      }

      // ACTUALLY PLACE THE ORDER — only if --confirm was passed
      // Dismiss any modals/overlays (upsells, tip prompts, promos)
      // that Uber Eats shows before allowing checkout.
      for (let i = 0; i < 8; i++) {
        // Press Escape to dismiss any modal
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);

        // Click dismiss buttons if visible
        const dismissSelectors = [
          'button:has-text("No thanks")',
          'button:has-text("Skip")',
          'button:has-text("Not now")',
          'button[aria-label="Close"]',
          'button:has-text("Continue")',
          'button:has-text("Got it")',
          'button:has-text("Dismiss")',
        ];
        let dismissed = false;
        for (const sel of dismissSelectors) {
          const btn = page.locator(sel).first();
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            await btn.click({ force: true });
            await page.waitForTimeout(800);
            dismissed = true;
            break;
          }
        }

        // Check if Place order button is now clickable (no overlay)
        const placeBtn = page.locator('[data-testid="place-order-btn"]').first();
        if (await placeBtn.isVisible({ timeout: 500 }).catch(() => false)) {
          try {
            await placeBtn.click({ timeout: 2000 });
            // If click succeeded without timeout, we're done
            await page.waitForTimeout(8000);
            break;
          } catch {
            // Overlay still blocking — keep dismissing
          }
        }

        if (!dismissed) {
          // Nothing left to dismiss — force click as last resort
          const btn = page.locator('[data-testid="place-order-btn"]').first();
          if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await btn.click({ force: true });
            await page.waitForTimeout(8000);
            break;
          }
        }
      }

      // After placing, try to scrape confirmation details
      const confirmation = await page.evaluate(() => {
        const text = (document.body.textContent || "").replace(/\s+/g, " ");
        // Order ID: look for UUID-like or numeric order references
        const orderIdMatch = text.match(/order\s*#\s*([A-F0-9-]{8,})/i)
          || text.match(/confirmation\s*#?\s*:?\s*([A-F0-9-]{8,})/i);
        // ETA: "XX min" with a space before digits to avoid garbage like "0022min"
        const etaMatch = text.match(/(?:arrive|delivery|eta|ready)\s+(?:in\s+)?(\d{1,3}\s*[\u2013\u2014–-]\s*\d{1,3}\s*min|\d{1,3}\s+min)/i)
          || text.match(/(\d{1,2}\s*[\u2013\u2014–-]\s*\d{1,2}\s+min)/i);
        return {
          orderId: orderIdMatch ? orderIdMatch[1] : "",
          eta: etaMatch ? etaMatch[1].trim() : "",
        };
      });

      return {
        success: true,
        total: summary.total || "see receipt",
        eta: confirmation.eta || summary.eta || "see app",
        orderId: confirmation.orderId || "confirmed",
      };
    } finally {
      await page.close();
    }
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
