import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  getDataDir,
  setDataDir,
  loadConfig,
  saveConfig,
  getAdapterName,
} from "./config.js";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "hungry-test-"));
    setDataDir(tempDir);
  });

  afterEach(() => {
    setDataDir(null);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("getDataDir", () => {
    it("returns the configured directory", () => {
      expect(getDataDir()).toBe(tempDir);
    });

    it("creates the directory if it doesn't exist", () => {
      const nested = join(tempDir, "deep", "nested");
      setDataDir(nested);
      const result = getDataDir();
      expect(result).toBe(nested);
      expect(existsSync(nested)).toBe(true);
    });

    it("falls back to ~/.config/hungry when no override is set", () => {
      setDataDir(null);
      const result = getDataDir();
      expect(result).toContain(".config");
      expect(result).toContain("hungry");
      // Reset to temp dir so afterEach cleanup works
      setDataDir(tempDir);
    });
  });

  describe("loadConfig", () => {
    it("returns empty object when no config file exists", () => {
      expect(loadConfig()).toEqual({});
    });

    it("loads config from disk", () => {
      const config = { adapter: "doordash", address: "123 Main St", budget: 25 };
      writeFileSync(
        join(tempDir, "config.json"),
        JSON.stringify(config),
      );
      expect(loadConfig()).toEqual(config);
    });

    it("returns empty object for corrupted JSON", () => {
      writeFileSync(join(tempDir, "config.json"), "not json{{{");
      expect(loadConfig()).toEqual({});
    });
  });

  describe("saveConfig", () => {
    it("writes config to disk", () => {
      const config = { adapter: "ubereats", budget: 30 };
      saveConfig(config);
      const raw = readFileSync(join(tempDir, "config.json"), "utf-8");
      expect(JSON.parse(raw)).toEqual(config);
    });

    it("overwrites existing config", () => {
      saveConfig({ adapter: "ubereats" });
      saveConfig({ adapter: "doordash", address: "456 Oak Ave" });
      const raw = readFileSync(join(tempDir, "config.json"), "utf-8");
      const loaded = JSON.parse(raw);
      expect(loaded.adapter).toBe("doordash");
      expect(loaded.address).toBe("456 Oak Ave");
    });

    it("pretty-prints with trailing newline", () => {
      saveConfig({ adapter: "ubereats" });
      const raw = readFileSync(join(tempDir, "config.json"), "utf-8");
      expect(raw).toContain("\n");
      expect(raw.endsWith("\n")).toBe(true);
      // Should be indented (pretty-printed)
      expect(raw).toContain("  ");
    });
  });

  describe("getAdapterName", () => {
    it("returns 'ubereats' by default when no config exists", () => {
      expect(getAdapterName()).toBe("ubereats");
    });

    it("returns configured adapter name", () => {
      saveConfig({ adapter: "doordash" });
      expect(getAdapterName()).toBe("doordash");
    });

    it("returns 'ubereats' when adapter is not set in config", () => {
      saveConfig({ budget: 50 });
      expect(getAdapterName()).toBe("ubereats");
    });
  });
});
