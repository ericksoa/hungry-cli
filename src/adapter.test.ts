import { describe, it, expect } from "vitest";
import {
  BaseAdapter,
  type SearchResult,
  type MenuItem,
  type CartAddResult,
  type CartState,
  type OrderResult,
  type SelectionPromptFn,
} from "./adapter.js";

// Concrete test implementation of the abstract class
class TestAdapter extends BaseAdapter {
  authCalled = false;

  constructor() {
    super("test-adapter");
  }

  async auth(): Promise<void> {
    this.authCalled = true;
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authCalled;
  }

  async search(_query: string): Promise<SearchResult[]> {
    return [
      {
        restaurant: "Test Place",
        restaurantUrl: "https://example.com",
        itemName: "Test Bowl",
        description: "A test bowl",
        price: "$12.99",
        eta: "25 min",
        rating: "4.5",
      },
    ];
  }

  async menu(_restaurantUrl: string): Promise<MenuItem[]> {
    return [
      {
        itemName: "Salad",
        description: "Fresh greens",
        price: "$9.99",
        category: "Healthy",
      },
    ];
  }

  async cartAdd(_restaurantUrl: string, _itemName: string, _promptFn?: SelectionPromptFn): Promise<CartAddResult> {
    return { success: true, cartTotal: "$12.99", itemCount: 1 };
  }

  async cartView(): Promise<CartState> {
    return {
      items: [{ name: "Test Bowl", price: "$12.99", qty: 1 }],
      total: "$12.99",
      deliveryFee: "$2.99",
      serviceFee: "$1.50",
    };
  }

  async cartClear(): Promise<void> {}

  async order(_confirm?: boolean): Promise<OrderResult> {
    return { success: true, total: "$17.48", eta: "25 min", orderId: "abc123" };
  }
}

describe("BaseAdapter", () => {
  it("stores the adapter name", () => {
    const adapter = new TestAdapter();
    expect(adapter.name).toBe("test-adapter");
  });

  it("cleanup() is callable on the base class (no-op default)", async () => {
    const adapter = new TestAdapter();
    await adapter.cleanup(); // should not throw
  });

  it("concrete adapter methods work as expected", async () => {
    const adapter = new TestAdapter();

    expect(await adapter.isAuthenticated()).toBe(false);
    await adapter.auth();
    expect(await adapter.isAuthenticated()).toBe(true);

    const results = await adapter.search("test");
    expect(results).toHaveLength(1);
    expect(results[0].restaurant).toBe("Test Place");

    const menu = await adapter.menu("https://example.com");
    expect(menu).toHaveLength(1);
    expect(menu[0].itemName).toBe("Salad");

    const addResult = await adapter.cartAdd("url", "item");
    expect(addResult.success).toBe(true);

    const cart = await adapter.cartView();
    expect(cart.items).toHaveLength(1);
    expect(cart.total).toBe("$12.99");

    await adapter.cartClear(); // no-op, should not throw

    const order = await adapter.order(true);
    expect(order.success).toBe(true);
    expect(order.orderId).toBe("abc123");
  });
});
