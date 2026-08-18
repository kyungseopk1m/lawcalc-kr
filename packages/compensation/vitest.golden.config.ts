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
      // 골든 커버리지 가드는 core-engine 하네스와 같은 파일을 쓴다. 공개 API 가 아니라
      // 테스트 전용이라 패키지 exports 대신 별칭으로 잇는다.
      "@golden-coverage": decodeURIComponent(
        new URL("../core-engine/tests/golden-coverage.ts", import.meta.url).pathname,
      ),
    },
  },
  test: {
    include: ["tests/auto-injury/golden.test.ts", "tests/auto-death/golden.test.ts"],
    environment: "node",
  },
});
