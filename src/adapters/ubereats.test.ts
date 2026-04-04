import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { UberEatsAdapter } from "./ubereats.js";
import { setDataDir } from "../config.js";

describe("UberEatsAdapter", () => {
  let tempDir: string;
  let adapter: UberEatsAdapter;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "hungry-ue-test-"));
    setDataDir(tempDir);
    adapter = new UberEatsAdapter();
  });

  afterEach(() => {
    setDataDir(null);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("has name 'ubereats'", () => {
    expect(adapter.name).toBe("ubereats");
  });

  describe("isAuthenticated", () => {
    it("returns false when no auth state file exists", async () => {
      expect(await adapter.isAuthenticated()).toBe(false);
    });

    it("returns false when only auth.json exists but no chrome-profile", async () => {
      const stateDir = join(tempDir, "ubereats");
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(join(stateDir, "auth.json"), JSON.stringify({ cookies: [] }));
      expect(await adapter.isAuthenticated()).toBe(false);
    });

    it("returns false when only chrome-profile exists but no auth.json", async () => {
      const stateDir = join(tempDir, "ubereats");
      mkdirSync(join(stateDir, "chrome-profile"), { recursive: true });
      expect(await adapter.isAuthenticated()).toBe(false);
    });

    it("returns true when both auth.json and chrome-profile exist", async () => {
      const stateDir = join(tempDir, "ubereats");
      mkdirSync(join(stateDir, "chrome-profile"), { recursive: true });
      writeFileSync(join(stateDir, "auth.json"), JSON.stringify({ cookies: [] }));
      expect(await adapter.isAuthenticated()).toBe(true);
    });
  });

  describe("checkSession", () => {
    it("returns false when not authenticated", async () => {
      expect(await adapter.checkSession()).toBe(false);
    });
  });

  describe("search", () => {
    it("throws when not authenticated", async () => {
      await expect(adapter.search("tacos")).rejects.toThrow("Not logged in");
    });
  });

  describe("menu", () => {
    it("throws when not authenticated", async () => {
      await expect(adapter.menu("https://ubereats.com/store/123")).rejects.toThrow("Not logged in");
    });
  });

  describe("stub methods throw with descriptive messages", () => {

    it("cartAdd() throws not-implemented", async () => {
      await expect(adapter.cartAdd("https://ubereats.com/store/123", "Burrito")).rejects.toThrow(
        "not yet implemented",
      );
    });

    it("cartView() throws not-implemented", async () => {
      await expect(adapter.cartView()).rejects.toThrow("not yet implemented");
    });

    it("cartClear() throws not-implemented", async () => {
      await expect(adapter.cartClear()).rejects.toThrow("not yet implemented");
    });

    it("order() throws not-implemented", async () => {
      await expect(adapter.order()).rejects.toThrow("not yet implemented");
    });
  });

  describe("cleanup", () => {
    it("is safe to call when no browser is open", async () => {
      await adapter.cleanup();
    });

    it("can be called multiple times", async () => {
      await adapter.cleanup();
      await adapter.cleanup();
    });
  });
});
