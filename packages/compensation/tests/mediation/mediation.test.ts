import { describe, expect, it } from "vitest";

import {
  computeMediationInterest,
  faultRatioOfResponsibilityPercent,
  mediationResponsibilityPercents,
} from "../../src/mediation";

describe("조정 시나리오 책임비율", () => {
  it("과실 20% → 80, 75, 85 (외부 대조값 순서)", () => {
    expect(mediationResponsibilityPercents(0.2)).toEqual([80, 75, 85]);
  });

  it("0~100 밖과 중복은 뺀다", () => {
    expect(mediationResponsibilityPercents(0)).toEqual([100, 95]);
    expect(mediationResponsibilityPercents(0.98, 5)).toEqual([2, 7]);
    expect(mediationResponsibilityPercents(0.2, 0)).toEqual([80]);
    expect(mediationResponsibilityPercents(0.333, 10)).toEqual([66.7, 56.7, 76.7]);
  });

  it("가감 폭 범위 밖이면 거절", () => {
    expect(() => mediationResponsibilityPercents(0.2, -1)).toThrow(RangeError);
    expect(() => mediationResponsibilityPercents(0.2, Number.NaN)).toThrow(RangeError);
  });

  it("책임비율 → 과실비율은 십진 그대로", () => {
    expect(faultRatioOfResponsibilityPercent(85)).toBe(0.15);
    expect(faultRatioOfResponsibilityPercent(75)).toBe(0.25);
  });
});

describe("사고일부터 조정일까지 연 5% 이자", () => {
  it("B-1 원금 79,967,731, 2010-01-01 ~ 2026-10-22: 기간식 67,205,757 (외부 총일수 방식 67,249,575 와 -43,818)", () => {
    const r = computeMediationInterest(79_967_731, "2010-01-01", "2026-10-22");
    expect(r.interestWon).toBe(67_205_757);
    expect(r.totalWon).toBe(79_967_731 + 67_205_757);
  });

  it("원금 0 이면 이자 0", () => {
    expect(computeMediationInterest(0, "2010-01-01", "2026-10-22")).toEqual({
      interestWon: 0,
      totalWon: 0,
    });
  });
});
