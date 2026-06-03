import { describe, expect, it } from "vitest";

import {
  applyValueSum20Cap,
  singlePaymentHoffman,
  VALUE_SUM_CAP,
} from "../../src/other-damages/caps";

describe("singlePaymentHoffman (단리 일시금 현가계수)", () => {
  it("months 0 → 1 (사고일 당일)", () => {
    expect(singlePaymentHoffman(0)).toBe(1);
  });

  it("months 12 → 1/1.05", () => {
    expect(singlePaymentHoffman(12)).toBeCloseTo(1 / 1.05, 12);
  });

  it("월이 클수록 단조 감소", () => {
    expect(singlePaymentHoffman(120)).toBeLessThan(singlePaymentHoffman(12));
  });

  it("음수 months 거부", () => {
    expect(() => singlePaymentHoffman(-1)).toThrow(RangeError);
  });
});

describe("applyValueSum20Cap (수치합계 20 cap)", () => {
  it("cap 미만은 그대로", () => {
    expect(applyValueSum20Cap(10)).toEqual({ rawSum: 10, appliedSum: 10, capped: false });
  });

  it("cap 초과 시 20 으로 clip + capped true", () => {
    expect(applyValueSum20Cap(25)).toEqual({ rawSum: 25, appliedSum: VALUE_SUM_CAP, capped: true });
  });

  it("정확히 cap 값은 미적용 (초과 아님)", () => {
    expect(applyValueSum20Cap(20)).toEqual({ rawSum: 20, appliedSum: 20, capped: false });
  });

  it("음수 rawSum 거부", () => {
    expect(() => applyValueSum20Cap(-1)).toThrow(RangeError);
  });
});
