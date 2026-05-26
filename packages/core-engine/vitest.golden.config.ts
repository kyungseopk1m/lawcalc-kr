import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/golden.test.ts",
      "tests/inheritance-golden.test.ts",
      "tests/appropriation-golden.test.ts",
    ],
    environment: "node",
  },
});
