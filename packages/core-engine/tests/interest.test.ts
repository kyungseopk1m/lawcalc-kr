import { describe, expect, it } from "vitest";

import { calculateInterest, type CalcOptions, type InterestInput } from "../src";

function input(over: Partial<InterestInput> = {}): InterestInput {
  const options: CalcOptions = {
    mode: "totalDays",
    leapYear: "fixed365",
    includeFirstDay: false,
  };
  return {
    principal: 1_000_000,
    startDate: "2024-01-01",
    endDate: "2024-12-31",
    legalRatePreset: "civil",
    options,
    ...over,
  };
}

describe("calculateInterest — totalDays mode", () => {
  it("civil 5% on 365 days, fixed365, exclude first day → days=365, interest=50,000", () => {
    // 2023-01-01 → 2024-01-01, 초일 불산입 = 365일 (평년 가운데)
    const result = calculateInterest(input({ startDate: "2023-01-01", endDate: "2024-01-01" }));
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.days).toBe(365);
    // 1_000_000 * 0.05 * 365 / 365 = 50,000
    expect(result.totalInterest).toBe(50_000);
    expect(result.grandTotal).toBe(1_050_000);
  });

  it("100 days at 5% = 1_000_000 × 0.05 × 100 / 365 = 13,698 (floor)", () => {
    const result = calculateInterest(
      input({
        startDate: "2024-01-01",
        endDate: "2024-04-10", // 100 days excluding first day
      }),
    );
    expect(result.segments[0]!.days).toBe(100);
    expect(result.totalInterest).toBe(13_698);
  });

  it("leapYear=actual: range containing 2/29 uses 366 denominator", () => {
    const opts: CalcOptions = {
      mode: "totalDays",
      leapYear: "actual",
      includeFirstDay: false,
    };
    // 2024-01-01 → 2024-12-31, 초일 불산입 = 365일, 윤일 포함 → 분모 366
    const result = calculateInterest(input({ options: opts }));
    expect(result.segments[0]!.days).toBe(365);
    // 1_000_000 * 0.05 * 365 / 366 = 49_863.387… → floor 49_863
    expect(result.totalInterest).toBe(49_863);
  });

  it("leapYear=actual: range without 2/29 uses 365 denominator", () => {
    const opts: CalcOptions = {
      mode: "totalDays",
      leapYear: "actual",
      includeFirstDay: false,
    };
    const result = calculateInterest(
      input({ startDate: "2023-01-01", endDate: "2023-12-31", options: opts }),
    );
    expect(result.segments[0]!.days).toBe(364);
    // 1_000_000 * 0.05 * 364 / 365 = 49_863.013… → floor 49_863
    expect(result.totalInterest).toBe(49_863);
  });

  it("includeFirstDay=true adds one day", () => {
    const a = calculateInterest(
      input({
        startDate: "2024-01-01",
        endDate: "2024-04-10",
        options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
      }),
    );
    const b = calculateInterest(
      input({
        startDate: "2024-01-01",
        endDate: "2024-04-10",
        options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: true },
      }),
    );
    expect(b.segments[0]!.days - a.segments[0]!.days).toBe(1);
  });

  it("auto-splits 소촉법 across 2019-06-01 with correct per-segment rates", () => {
    const result = calculateInterest({
      principal: 10_000_000,
      startDate: "2019-01-01",
      endDate: "2019-12-31",
      legalRatePreset: "promotion",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.rate).toBe(0.15);
    expect(result.segments[1]!.rate).toBe(0.12);
    // 둘이 합쳐 약 1년치 이자 (정확 비교는 골든)
    expect(result.totalInterest).toBeGreaterThan(0);
  });
});

describe("calculateInterest — period mode (기간식)", () => {
  it("exact 1-year span at civil 5% → full-year multiplier, fixed365", () => {
    const result = calculateInterest(
      input({
        startDate: "2023-01-01",
        endDate: "2024-01-01",
        options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
      }),
    );
    // 초일 불산입 → 효과 시작 2023-01-02, 끝 2024-01-01 = 정확히 1년
    // 1_000_000 * 0.05 = 50,000
    expect(result.totalInterest).toBe(50_000);
  });

  it("partial year (100 days) at 5% leapYear=fixed365 → 13,698", () => {
    const result = calculateInterest(
      input({
        startDate: "2024-01-01",
        endDate: "2024-04-10",
        options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
      }),
    );
    // 1_000_000 * 0.05 * 100 / 365 = 13,698.63 → floor 13,698
    expect(result.totalInterest).toBe(13_698);
  });

  it("partial year leapYear=actual: 시작 2015-05-01 (1년 사이 2016-02-29) → 분모 366", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2015-05-01",
      endDate: "2015-08-08", // 100일 (초일 불산입 가정)
      legalRatePreset: { customRate: 0.05 },
      options: { mode: "period", leapYear: "actual", includeFirstDay: false },
    });
    // 효과 시작 2015-05-02, 끝 2015-08-08 = 99일
    // 분모 결정: partial 시작 2015-05-02 + 1년 = 2016-05-01 → [2015-05-02, 2016-05-01]
    // 이 사이에 2016-02-29 포함 → 366
    // 1_000_000 * 0.05 * 99 / 366 = 13,524.59 → floor 13,524
    expect(result.totalInterest).toBe(13_524);
  });

  it("multi-year span: 2년 + 100일 partial", () => {
    const result = calculateInterest(
      input({
        startDate: "2021-01-01",
        endDate: "2023-04-11",
        options: { mode: "period", leapYear: "fixed365", includeFirstDay: false },
      }),
    );
    // 초일 불산입 → 효과 시작 2021-01-02
    // 풀 1년: [2021-01-02, 2022-01-01] (1년차), [2022-01-02, 2023-01-01] (2년차) → 2년 풀
    // partial: 2023-01-02 ~ 2023-04-11 = 100일
    // 1_000_000 * 0.05 * 2 + 1_000_000 * 0.05 * 100 / 365
    //   = 100,000 + 13,698.63 = 113,698.63 → floor 113,698
    expect(result.totalInterest).toBe(113_698);
  });
});

describe("calculateInterest — defensive checks", () => {
  it("rejects non-finite principal", () => {
    expect(() => calculateInterest(input({ principal: Number.NaN }))).toThrow();
  });

  it("rejects principal = 0", () => {
    expect(() => calculateInterest(input({ principal: 0 }))).toThrow(/principal/);
  });

  it("includes dataVersion + computedAt for reproducibility", () => {
    const result = calculateInterest(input());
    expect(result.dataVersion).toBe("legal-rates/v1.0.0");
    expect(new Date(result.computedAt).toString()).not.toBe("Invalid Date");
  });
});
