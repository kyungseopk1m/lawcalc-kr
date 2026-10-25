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

describe("소장 송달일이 있으면 다음 날부터 소송촉진 등에 관한 특례법 이율 (연혁대로)", () => {
  // 손 계산 (기간식, 초일 산입, 구간별 원 미만 절사). 원금 10,000,000.
  // 민법 5%   2015-01-01 ~ 2015-06-30 181일/365: 500,000 × 181 / 365 = 247,945.2 → 247,945
  // 특례 20%  2015-07-01 ~ 2015-09-30  92일/366(2016-02-29 포함): 2,000,000 × 92 / 366 = 502,732.2 → 502,732
  // 특례 15%  2015-10-01 ~ 2019-05-31 3년 + 243일/365: 4,500,000 + 998,630.1 → 5,498,630
  // 특례 12%  2019-06-01 ~ 2019-12-31 214일/366(2020-02-29 포함): 1,200,000 × 214 / 366 = 701,639.3 → 701,639
  // 합계 6,950,946
  it("원금 10,000,000, 사고 2015-01-01, 송달 2015-06-30, 조정 2019-12-31 → 6,950,946", () => {
    const r = computeMediationInterest(
      10_000_000,
      "2015-01-01",
      "2019-12-31",
      undefined,
      "2015-06-30",
    );
    expect(r.interestWon).toBe(6_950_946);
    expect(r.totalWon).toBe(16_950_946);
  });

  it("송달일이 조정일 이후면 5% 만 (송달일 없음과 같다)", () => {
    const base = computeMediationInterest(79_967_731, "2010-01-01", "2026-10-22");
    expect(
      computeMediationInterest(79_967_731, "2010-01-01", "2026-10-22", undefined, "2026-10-22"),
    ).toEqual(base);
  });

  it("송달일이 사고일 앞이면 거절", () => {
    expect(() =>
      computeMediationInterest(1_000_000, "2015-01-01", "2019-12-31", undefined, "2014-12-31"),
    ).toThrow(RangeError);
  });
});
