import { describe, expect, it } from "vitest";

import {
  addDays,
  calculateInterest,
  countDays,
  type CalcOptions,
  type InterestInput,
} from "../src";

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

  // 이율 검증은 원금과 대칭이어야 한다. `NaN < 0` 이 false 라 부등호만으로는
  // 통과해 totalInterest 가 조용히 NaN 이 됐다 (.lcalc 로드 경로로 유입 가능).
  it("rejects non-finite customRate", () => {
    for (const rate of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => calculateInterest(input({ legalRatePreset: { customRate: rate } }))).toThrow(
        /customRate/,
      );
    }
  });

  it("rejects negative customRate", () => {
    expect(() => calculateInterest(input({ legalRatePreset: { customRate: -0.05 } }))).toThrow(
      /customRate/,
    );
  });

  it("accepts customRate = 0", () => {
    const result = calculateInterest(input({ legalRatePreset: { customRate: 0 } }));
    expect(result.totalInterest).toBe(0);
  });

  it("rejects non-finite rate in explicit segments", () => {
    for (const rate of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        calculateInterest(input({ segments: [{ from: "2024-01-01", to: "2024-12-31", rate }] })),
      ).toThrow(/rate/);
    }
  });

  it("includes dataVersion + computedAt for reproducibility", () => {
    const result = calculateInterest(input());
    expect(result.dataVersion).toBe("legal-rates/v1.0.1");
    expect(new Date(result.computedAt).toString()).not.toBe("Invalid Date");
  });
});

/**
 * 초일 불산입(민법 제157조)은 기간 전체의 기산일에 한 번만 적용된다.
 * 이율 변경으로 구간이 분할되어도 총 일수는 달라지지 않아야 한다.
 *
 * 이 불변식이 없던 동안 구간마다 초일 불산입이 중복 적용되어 두 번째 구간부터
 * 첫날이 어느 구간에도 산입되지 않았다 (구간 수 - 1 일 소실).
 */
describe("calculateInterest — 구간 일수 불변식", () => {
  const RANGES: Array<[string, string]> = [
    ["2019-01-01", "2019-12-31"], // 2구간 (15% → 12%)
    ["2015-01-01", "2020-12-31"], // 3구간 (20% → 15% → 12%)
    ["2015-09-30", "2015-10-01"], // 변경일 바로 앞뒤
    ["2019-05-31", "2019-06-01"],
    ["2016-01-01", "2016-12-31"], // 윤년
    ["2003-06-01", "2026-01-01"], // 전 구간 종주
  ];

  for (const mode of ["totalDays", "period"] as const) {
    for (const leapYear of ["fixed365", "actual"] as const) {
      for (const includeFirstDay of [true, false]) {
        for (const [startDate, endDate] of RANGES) {
          it(`Σsegments.days === countDays (${mode}/${leapYear}/초일${includeFirstDay ? "산입" : "불산입"}, ${startDate}~${endDate})`, () => {
            const options: CalcOptions = { mode, leapYear, includeFirstDay };
            const result = calculateInterest({
              principal: 10_000_000,
              startDate,
              endDate,
              legalRatePreset: "promotion",
              options,
            });
            const sumDays = result.segments.reduce((acc, s) => acc + s.days, 0);
            expect(sumDays).toBe(countDays(startDate, endDate, options));
          });
        }
      }
    }
  }

  it("구간이 기간 전체를 빈틈없이 타일링한다", () => {
    const result = calculateInterest({
      principal: 10_000_000,
      startDate: "2015-01-01",
      endDate: "2020-12-31",
      legalRatePreset: "promotion",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.segments[0]!.from).toBe("2015-01-01");
    expect(result.segments.at(-1)!.to).toBe("2020-12-31");
    for (let i = 1; i < result.segments.length; i++) {
      expect(result.segments[i]!.from).toBe(addDays(result.segments[i - 1]!.to, 1));
    }
  });
});
