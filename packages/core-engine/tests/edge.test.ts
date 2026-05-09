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

describe("edge: period mode days = formula 분자 일수 합 (TIER-A #1 + #2 회귀)", () => {
  it("윤년 02-29 시작 + 02-28 만료 = 정확히 1년 (민법 159·160, A-W8 = 변호사 A안 채택)", () => {
    // segment.from=2024-02-29, segment.to=2025-02-28, includeFirstDay=true.
    // 민법 160조 3항 "해당일 없는 때 그 월의 말일" → [2024-02-29, 2025-02-28] = 정확히 1년.
    // - cursor=2024-02-29, periodCycleEnd → end=2025-02-28 (clip 자체), nextCursor=2025-03-01.
    //   2025-02-28 ≤ 2025-02-28 → fullYears=1.
    // - cursor=2025-03-01, periodCycleEnd → end=2026-02-28 > 2025-02-28 → break.
    // - partialStart=2025-03-01 > segment.to → partialDays=0.
    // - cycle 일수 = 366 (2024-02-29..2025-02-28 inclusive, 윤일 포함). days = 366 + 0 = 366.
    // - formula = "1년 × 1,000,000원 × 5%" (partial 없음).
    // - interest = 1 × 1_000_000 × 0.05 = 50_000 (50,136 → 50,000 정정).
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2024-02-29",
      endDate: "2025-02-28",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "actual", includeFirstDay: true },
    });
    expect(result.segments[0]!.days).toBe(366);
    expect(result.segments[0]!.formula).toContain("1년 ×");
    expect(result.segments[0]!.formula).not.toContain("/ 365");
    expect(result.segments[0]!.formula).not.toContain("/ 366");
    expect(result.totalInterest).toBe(50_000);
  });

  it("윤년 02-29 시작 + 1년 + 15일 partial (cycle 흡수 + 다음 cursor 03-01)", () => {
    // [2024-02-29, 2025-03-15], includeFirstDay=true, period actual.
    // - cycle1 만료 = 2025-02-28 (clip 흡수), 다음 cursor = 2025-03-01.
    // - cycle2 시도: end=2026-02-28 > 2025-03-15 → break. partialStart=2025-03-01.
    // - partialDays = 2025-03-01..2025-03-15 = 15.
    // - denom (actual): containsLeapDay(2025-03-01, 2026-02-28) → 윤일 없음 → 365.
    // - cycle 일수 = 366 (2024-02-29..2025-02-28 inclusive, 윤일 포함). days = 366 + 15 = 381.
    // - interestRaw = 50_000 + 1_000_000 × 0.05 × 15 / 365 = 50_000 + 2_054.794… = 52_054.794…
    // - floor 52_054.
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2024-02-29",
      endDate: "2025-03-15",
      legalRatePreset: "civil",
      options: { mode: "period", leapYear: "actual", includeFirstDay: true },
    });
    expect(result.segments[0]!.days).toBe(381);
    expect(result.segments[0]!.formula).toContain("1년 ×");
    expect(result.segments[0]!.formula).toContain("× 15일 / 365");
    expect(result.totalInterest).toBe(52_054);
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

describe("edge: 소수 이율(12.345%) floating-point 누적 (TIER-A #7 회귀)", () => {
  it("0.12345 × period 5년 풀 + partial 0 = 정확 누적 floor 617_250", () => {
    // 1_000_000 × 0.12345 = 123_450 (IEEE 754 round-trip: 123_450.00000000001)
    // 풀 5년 raw = fullYears × principal × rate = 5 × 1_000_000 × 0.12345
    //          = 617_250.0000000001 → floor 617_250
    // 사용자 테스트 (12.345% 등 비정수 이율) 에서 floor 결과가 흔들리지 않도록 회귀 고정.
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2020-01-01",
      endDate: "2025-01-01",
      legalRatePreset: { customRate: 0.12345 },
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.totalInterest).toBe(617_250);
  });

  it("0.12345 × period 1년 풀 + 100일 partial → floor 157_271", () => {
    // effectiveStart=2020-01-02, fullYears=1 (~2021-01-01), partial 2021-01-02..2021-04-11=100일.
    // raw = 1 × 1_000_000 × 0.12345 + 1_000_000 × 0.12345 × 100/365
    //     = 123_450 + 33_821.917… = 157_271.917… → floor 157_271
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2020-01-01",
      endDate: "2021-04-11",
      legalRatePreset: { customRate: 0.12345 },
      options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.totalInterest).toBe(157_271);
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
