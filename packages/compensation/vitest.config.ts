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
      // auto-death 골든은 이 설정에서도 실행되므로 커버리지 가드 별칭이 여기에도 필요하다.
      "@golden-coverage": decodeURIComponent(
        new URL("../core-engine/tests/golden-coverage.ts", import.meta.url).pathname,
      ),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/auto-injury/golden.test.ts", "**/node_modules/**", "**/dist/**"],
    environment: "node",
  },
});
