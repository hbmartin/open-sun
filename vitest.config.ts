import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
  test: {
    environment: "node",
    globals: true,
    // Keep date formatting deterministic across machines and CI.
    env: { TZ: "UTC" },
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**/*.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/**/*.{ts,tsx}", "components/**/*.tsx"],
      // Enforce coverage on the tested business logic in lib/. UI components
      // are intentionally excluded from the gate until they gain tests.
      thresholds: {
        "lib/**": {
          statements: 88,
          branches: 72,
          functions: 88,
          lines: 88,
        },
      },
    },
  },
})
