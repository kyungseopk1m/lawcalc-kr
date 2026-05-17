import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: [
      "tests/golden.test.ts",
      "tests/inheritance-golden.test.ts",
      "tests/appropriation-golden.test.ts",
      "tests/compensation-golden.test.ts",
      "**/node_modules/**",
      "**/dist/**",
    ],
    environment: "node",
  },
});
