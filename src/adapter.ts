// Base adapter interface. Every delivery service adapter must implement these methods.

export interface SearchResult {
  restaurant: string;
  restaurantUrl: string;
  itemName: string;
  description: string;
  price: string;
  eta: string;
  rating: string;
}

export interface MenuItem {
  itemName: string;
  description: string;
  price: string;
  category: string;
}

export interface CartItem {
  name: string;
  price: string;
  qty: number;
}

export interface CartState {
  items: CartItem[];
  total: string;
  deliveryFee: string;
  serviceFee: string;
}

export interface CartAddResult {
  success: boolean;
  cartTotal: string;
  itemCount: number;
}

export interface OrderResult {
  success: boolean;
  total: string;
  eta: string;
  orderId: string;
}

export interface SearchOptions {
  address?: string;
  budget?: number;
}

export abstract class BaseAdapter {
  constructor(public readonly name: string) {}

  /** Launch a browser for the user to log in. Save session for reuse. */
  abstract auth(): Promise<void>;

  /** Check if we have a valid saved session. */
  abstract isAuthenticated(): Promise<boolean>;

  /** Search for food. */
  abstract search(query: string, opts?: SearchOptions): Promise<SearchResult[]>;

  /** Get full menu for a restaurant. */
  abstract menu(restaurantUrl: string): Promise<MenuItem[]>;

  /** Add an item to the cart. */
  abstract cartAdd(restaurantUrl: string, itemName: string): Promise<CartAddResult>;

  /** View current cart contents. */
  abstract cartView(): Promise<CartState>;

  /** Clear the cart. */
  abstract cartClear(): Promise<void>;

  /** Place the order. */
  abstract order(confirm?: boolean): Promise<OrderResult>;

  /** Clean up (close browser, etc). */
  async cleanup(): Promise<void> {}
}
