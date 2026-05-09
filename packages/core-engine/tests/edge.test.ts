import { describe, expect, it } from "vitest";

import {
  addDays,
  addYears,
  calculateInterest,
  countDays,
  type CalcOptions,
  type InterestInput,
} from "../src";

/**
 * Edge / boundary 회귀 테스트.
 *
 * W3에서 추가. 다음을 회귀로 고정한다:
 * - 매우 긴 기간 (50년 period mode 풀 1년 누적)
 * - 매우 큰 원금 (Number.MAX_SAFE_INTEGER 안에서의 정수 정밀도)
 * - 단일 일자 (same-day) totalDays / period 둘 다
 * - 다년 + 명시 segments + period 모드 조합 (`INTEREST_FORMULAS.md §8` 미해결 항목 확정)
 * - customRate = 0 (이자 없음)
 * - includeFirstDay=true 의 1년 boundary 동작
 * - addYears / addDays 50년 단위 헬퍼
 */
describe("edge: very long span (period mode 50년)", () => {
  it("civil 5% × 50년 = 50 풀 1년 누적, partial 0", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2000-01-01",
      endDate: "2050-01-01",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
    });
    // 효과 시작 2000-01-02, 풀 1년 50회 (2000-01-02..2001-01-01 ... 2049-01-02..2050-01-01), partial 0
    // 50 × 1_000_000 × 0.05 = 2_500_000
    expect(result.segments).toHaveLength(1);
    expect(result.totalInterest).toBe(2_500_000);
    expect(result.grandTotal).toBe(3_500_000);
  });

  it("civil 5% × 50년 + 1일 partial (initial+1day end)", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2000-01-01",
      endDate: "2050-01-02",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
    });
    // 효과 시작 2000-01-02, 풀 1년 50회 + partial 2050-01-02..2050-01-02 = 1일
    // 50 × 50_000 + 50_000 × 1/365 = 2_500_000 + 136.98... = 2_500_136.98 → floor 2_500_136
    expect(result.totalInterest).toBe(2_500_136);
  });
});

describe("edge: very large principal (정수 정밀도)", () => {
  it("1조원(1e12) civil 5% × 1년 → 500억(50_000_000_000)", () => {
    const result = calculateInterest({
      principal: 1_000_000_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.totalInterest).toBe(50_000_000_000);
    expect(result.grandTotal).toBe(1_050_000_000_000);
  });

  it("100조원(1e14) civil 5% × 1년 totalDays → 5조(5e12), 정수 정밀 유지", () => {
    const result = calculateInterest({
      principal: 100_000_000_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    // 1e14 × 0.05 × 365 / 365 = 5e12 (Number.MAX_SAFE_INTEGER ≈ 9.007e15 미만이라 안전)
    expect(result.totalInterest).toBe(5_000_000_000_000);
    expect(Number.isSafeInteger(result.totalInterest)).toBe(true);
    expect(Number.isSafeInteger(result.grandTotal)).toBe(true);
  });
});

describe("edge: same-day span", () => {
  it("totalDays + includeFirstDay=true → days=1, civil 5% on 1_000_000 = 136 (floor)", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2024-05-09",
      endDate: "2024-05-09",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: true },
    });
    expect(result.segments[0]!.days).toBe(1);
    // 1_000_000 × 0.05 × 1 / 365 = 136.986… → floor 136
    expect(result.totalInterest).toBe(136);
  });

  it("period + includeFirstDay=true → 1일 partial, totalDays 동등", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2024-05-09",
      endDate: "2024-05-09",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: true },
    });
    expect(result.totalInterest).toBe(136);
  });

  it("totalDays + includeFirstDay=false → days=0, interest=0", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2024-05-09",
      endDate: "2024-05-09",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.segments[0]!.days).toBe(0);
    expect(result.totalInterest).toBe(0);
    expect(result.grandTotal).toBe(1_000_000);
  });
});

describe("edge: explicit segments + period mode 조합", () => {
  it("다년 명시 segments → segment 단위로 period 분해 (1년 풀 + 부분일 합산)", () => {
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2021-01-01",
      endDate: "2024-12-31",
      segments: [
        { from: "2021-01-01", to: "2022-06-30", rate: 0.05 },
        { from: "2022-07-01", to: "2024-12-31", rate: 0.06 },
      ],
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
    };
    const result = calculateInterest(input);

    // segment[0] 2021-01-01..2022-06-30
    //   효과 시작 2021-01-02 → 풀 1년 1회(2021-01-02..2022-01-01) + partial 2022-01-02..2022-06-30 = 180일
    //   raw = 1×50_000 + 50_000×180/365 = 50_000 + 24_657.5342… = 74_657.5342…
    //   floor 74_657
    expect(result.segments[0]!.interest).toBe(74_657);

    // segment[1] 2022-07-01..2024-12-31
    //   효과 시작 2022-07-02 → 풀 1년 2회(2022-07-02..2023-07-01, 2023-07-02..2024-07-01)
    //                         + partial 2024-07-02..2024-12-31 = 183일
    //   raw = 2×60_000 + 60_000×183/365 = 120_000 + 30_082.1917… = 150_082.1917…
    //   floor 150_082
    expect(result.segments[1]!.interest).toBe(150_082);

    // raw 합 224_739.7260… → totalInterest floor 224_739 (segment floor 합과 동치)
    expect(result.totalInterest).toBe(224_739);
    expect(result.grandTotal).toBe(1_224_739);
  });
});

describe("edge: zero / minimal rate", () => {
  it("customRate=0 → 모든 segment.interest=0, total=0", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: { customRate: 0 },
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.totalInterest).toBe(0);
    expect(result.grandTotal).toBe(1_000_000);
    expect(result.segments[0]!.interest).toBe(0);
  });
});

describe("edge: includeFirstDay=true 의 1년 boundary", () => {
  it("period + includeFirstDay=true + 1년 boundary → 풀 1년 + 1일 partial", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: true },
    });
    // 효과 시작 2023-01-01, 풀 1년 1회(2023-01-01..2023-12-31), partial 2024-01-01..2024-01-01 = 1일
    // raw = 50_000 + 136.986… = 50_136.986… → floor 50_136
    expect(result.totalInterest).toBe(50_136);
  });
});

describe("edge: addYears / addDays / countDays at long span", () => {
  it("addYears 50년 from 2000-01-02 = 2050-01-02", () => {
    expect(addYears("2000-01-02", 50)).toBe("2050-01-02");
  });

  it("addYears 100년 + 02-29 → 02-29 (2000 윤년이라 유지) → 2100-02-28 (비윤년 clip)", () => {
    expect(addYears("2000-02-29", 100)).toBe("2100-02-28");
  });

  it("addDays large (10000일)", () => {
    // 10000 / 365.25 ≈ 27.38년
    expect(addDays("2000-01-01", 10_000)).toBe("2027-05-19");
  });

  it("countDays over 100년 boundary (1924-01-01..2024-01-01, includeFirstDay=false) = 36525일", () => {
    // 그레고리력 100년 = 36525일 정확. inclusive=36526, 초일불산입 → 36525
    expect(
      countDays("1924-01-01", "2024-01-01", { leapYear: "actual", includeFirstDay: false }),
    ).toBe(36_525);
  });
});

describe("edge: floor accumulation (segment 합 vs totalInterest 1원 차이 가능성)", () => {
  it("총 4구간 명시 segments — segment.interest 합 ≤ totalInterest (≤ 1원 차)", () => {
    // 각 구간 raw 가 소수를 가질 때 segment-level floor 합산이 raw-합 floor 보다 작아질 수 있음
    const opts: CalcOptions = { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false };
    const result = calculateInterest({
      principal: 1_234_567,
      startDate: "2023-01-01",
      endDate: "2023-12-31",
      segments: [
        { from: "2023-01-01", to: "2023-03-31", rate: 0.05 },
        { from: "2023-04-01", to: "2023-06-30", rate: 0.06 },
        { from: "2023-07-01", to: "2023-09-30", rate: 0.07 },
        { from: "2023-10-01", to: "2023-12-31", rate: 0.08 },
      ],
      options: opts,
    });
    const sumOfFloors = result.segments.reduce((acc, s) => acc + s.interest, 0);
    const diff = result.totalInterest - sumOfFloors;
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(diff).toBeLessThanOrEqual(3); // 4 segment 면 raw 누적 시 최대 3원 차이 가능
  });
});
