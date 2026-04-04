import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";

const CLI = resolve(import.meta.dirname, "..", "dist", "cli.js");

function run(...args: string[]): string {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 5000,
  });
}

function runFail(...args: string[]): { stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return { stdout, stderr: "" };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string };
    return { stdout: err.stdout || "", stderr: err.stderr || "" };
  }
}

describe("CLI integration", () => {
  it("shows help with --help", () => {
    const output = run("--help");
    expect(output).toContain("hungry");
    expect(output).toContain("Food delivery from the terminal");
    expect(output).toContain("auth");
    expect(output).toContain("search");
    expect(output).toContain("menu");
    expect(output).toContain("cart");
    expect(output).toContain("order");
    expect(output).toContain("history");
  });

  it("shows version with --version", () => {
    const output = run("--version");
    expect(output.trim()).toBe("0.1.0");
  });

  it("shows search help", () => {
    const output = run("search", "--help");
    expect(output).toContain("Search for food");
    expect(output).toContain("--json");
  });

  it("shows menu help", () => {
    const output = run("menu", "--help");
    expect(output).toContain("Browse a restaurant's menu");
    expect(output).toContain("--json");
  });

  it("shows cart subcommand help", () => {
    const output = run("cart", "--help");
    expect(output).toContain("add");
    expect(output).toContain("view");
    expect(output).toContain("clear");
  });

  it("shows order help", () => {
    const output = run("order", "--help");
    expect(output).toContain("Place your order");
    expect(output).toContain("--confirm");
  });

  it("shows history help", () => {
    const output = run("history", "--help");
    expect(output).toContain("View past orders");
    expect(output).toContain("--days");
  });

  it("shows auth help with --check and --status flags", () => {
    const output = run("auth", "--help");
    expect(output).toContain("Log into your delivery service");
    expect(output).toContain("--check");
    expect(output).toContain("--status");
  });

  it("auth --status reports not logged in when no session exists", () => {
    const { stdout } = runFail("auth", "--status");
    expect(stdout).toContain("Not logged in");
  });

  it("exits with error for unknown command", () => {
    const { stderr } = runFail("nonexistent");
    expect(stderr).toContain("unknown command");
  });
});
