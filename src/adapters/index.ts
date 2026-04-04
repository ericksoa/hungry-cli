// Adapter registry — maps adapter names to their classes.

import { type BaseAdapter } from "../adapter.js";
import { UberEatsAdapter } from "./ubereats.js";

type AdapterConstructor = new () => BaseAdapter;

const adapters: Record<string, AdapterConstructor> = {
  ubereats: UberEatsAdapter,
};

export function createAdapter(name: string): BaseAdapter {
  const Adapter = adapters[name];
  if (!Adapter) {
    const available = Object.keys(adapters).join(", ");
    throw new Error(`Unknown adapter "${name}". Available: ${available}`);
  }
  return new Adapter();
}
