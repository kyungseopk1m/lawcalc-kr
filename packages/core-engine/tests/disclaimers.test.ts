import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "../src";

describe("STANDARD_DISCLAIMER", () => {
  it("matches the v0.2 baseline copy", () => {
    expect(STANDARD_DISCLAIMER).toBe(
      "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.",
    );
  });
});
