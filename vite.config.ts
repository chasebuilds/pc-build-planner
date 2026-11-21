import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/pc-build-planner/",
  test: { include: ["tests/**/*.test.ts"] },
});
