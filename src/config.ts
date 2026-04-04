// Config and data directory management.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { homedir } from "os";

export interface HungryConfig {
  adapter?: string;
  address?: string;
  budget?: number;
}

// Allow overriding the data dir for testing
let dataDirOverride: string | null = null;

export function setDataDir(dir: string | null): void {
  dataDirOverride = dir;
}

function getDefaultDataDir(): string {
  return process.env.HUNGRY_DATA_DIR || resolve(homedir(), ".config", "hungry");
}

export function getDataDir(): string {
  const dir = dataDirOverride ?? getDefaultDataDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

function getConfigPath(): string {
  return resolve(getDataDir(), "config.json");
}

export function loadConfig(): HungryConfig {
  const configPath = getConfigPath();
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as HungryConfig;
  } catch {
    return {};
  }
}

export function saveConfig(config: HungryConfig): void {
  const configPath = getConfigPath();
  mkdirSync(getDataDir(), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

export function getAdapterName(): string {
  const config = loadConfig();
  return config.adapter || "ubereats";
}
