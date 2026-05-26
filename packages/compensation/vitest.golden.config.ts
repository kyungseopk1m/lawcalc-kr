import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@lawcalc-kr/core-engine": decodeURIComponent(
        new URL("../core-engine/src/index.ts", import.meta.url).pathname,
      ),
      "@lawcalc-kr/datasets-compensation": decodeURIComponent(
        new URL("../datasets-compensation/src/index.ts", import.meta.url).pathname,
      ),
    },
  },
  test: {
    include: ["tests/auto-injury/golden.test.ts"],
    environment: "node",
  },
});
