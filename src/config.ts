// Config and data directory management.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

const DATA_DIR = resolve(homedir(), ".config", "hungry");
const CONFIG_PATH = resolve(DATA_DIR, "config.json");

export interface HungryConfig {
  adapter?: string;
  address?: string;
  budget?: number;
}

export function getDataDir(): string {
  mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export function loadConfig(): HungryConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as HungryConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: HungryConfig): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function getAdapterName(): string {
  const config = loadConfig();
  return config.adapter || "ubereats";
}
