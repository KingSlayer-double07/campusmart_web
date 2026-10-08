import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    // Frontend only; backend/ has its own Jest setup
    include: ["lib/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "*.test.ts"],
    exclude: ["node_modules/**", "backend/**", ".next/**"],
    restoreMocks: true,
  },
});
