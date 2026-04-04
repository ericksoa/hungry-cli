import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/cli.ts", // CLI entry point — thin Commander glue, tested via subprocess
        "src/adapters/ubereats.ts", // Browser automation — requires real Chromium, tested in E2E
      ],
      reporter: ["text", "text-summary"],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 90,
        lines: 95,
      },
    },
  },
});
