import { describe, expect, it } from "vitest";

import { calculateInterest, type CalcOptions, type InterestInput } from "../src";

/**
 * 반올림 정책 v2 단위 테스트.
 *
 * `options.rounding` 미지정 → "floor" default (v1 회귀 호환). 모든 v1 골든/단위 회귀가
 * 그대로 통과해야 한다는 사실은 golden / interest / edge 스위트가 보호한다.
 *
 * 본 스위트는 v2 신규 분기를 다음 4축으로 회귀 고정한다:
 * 1. 동일 입력에서 mode=floor / ceil / round 의 totalInterest 가 매뉴얼 정의대로 갈리는가
 * 2. raw 가 정확히 정수일 때는 세 mode 모두 동일 결과
 * 3. ceil 은 floor 보다 작지 않다 / round 는 floor 와 ceil 사이
 * 4. segment-level 적용도 totalInterest 와 같은 mode 로 동작 (다구간 명시 segments)
 */
describe("rounding v2: default = floor (v1 회귀 호환)", () => {
  it("rounding 미지정 시 totalInterest = floor(raw) (case-001 등가)", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.totalInterest).toBe(50_000);
  });

  it("rounding=floor 명시 = 미지정 동작 동등", () => {
    const base: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-04-10",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    };
    const a = calculateInterest(base);
    const b = calculateInterest({
      ...base,
      options: { ...base.options, rounding: "floor" },
    });
    expect(b.totalInterest).toBe(a.totalInterest);
    expect(b.segments[0]!.interest).toBe(a.segments[0]!.interest);
  });
});

describe("rounding v2: floor / ceil / round 분기", () => {
  // 1_000_000 × 0.05 × 100 / 365 = 13_698.6301... → floor 13_698, ceil 13_699, round 13_699
  function buildInput(rounding?: CalcOptions["rounding"]): InterestInput {
    const options: CalcOptions = {
      mode: "totalDays",
      leapYear: "fixed365",
      includeFirstDay: false,
      ...(rounding === undefined ? {} : { rounding }),
    };
    return {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-04-10", // 100일 (초일 불산입)
      legalRatePreset: "civil",
      options,
    };
  }

  it("floor → 13_698 (raw 13_698.63 절사)", () => {
    const result = calculateInterest(buildInput("floor"));
    expect(result.totalInterest).toBe(13_698);
    expect(result.segments[0]!.interest).toBe(13_698);
    expect(result.grandTotal).toBe(1_013_698);
  });

  it("ceil → 13_699 (raw 13_698.63 절상)", () => {
    const result = calculateInterest(buildInput("ceil"));
    expect(result.totalInterest).toBe(13_699);
    expect(result.segments[0]!.interest).toBe(13_699);
    expect(result.grandTotal).toBe(1_013_699);
  });

  it("round → 13_699 (raw 13_698.63 사사오입)", () => {
    const result = calculateInterest(buildInput("round"));
    expect(result.totalInterest).toBe(13_699);
    expect(result.segments[0]!.interest).toBe(13_699);
    expect(result.grandTotal).toBe(1_013_699);
  });

  it("invariant: floor ≤ round ≤ ceil (소수가 있는 raw)", () => {
    const f = calculateInterest(buildInput("floor")).totalInterest;
    const r = calculateInterest(buildInput("round")).totalInterest;
    const c = calculateInterest(buildInput("ceil")).totalInterest;
    expect(f).toBeLessThanOrEqual(r);
    expect(r).toBeLessThanOrEqual(c);
  });

  it("invariant: round 는 floor 와 ceil 중 더 가까운 쪽 (raw 13_698.63 → ceil 쪽)", () => {
    // raw fractional part 0.63 > 0.5 → round = ceil
    const r = calculateInterest(buildInput("round")).totalInterest;
    const c = calculateInterest(buildInput("ceil")).totalInterest;
    expect(r).toBe(c);
  });
});

describe("rounding v2: round half-away-from-zero (raw < 0.5 / > 0.5 / = 0.5)", () => {
  // 일수 / 분모 / 원금을 조정해 raw 의 소수부를 정확히 0.4 / 0.5 / 0.6 으로 만든다.
  // raw = principal × rate × days / 365
  // 0.4 위해: principal=1, rate=146, days=1, denom=365 → 0.4 (X — rate 비현실)
  // 보다 자연스러운 케이스: principal × rate 가 정수가 되도록 잡고 days 로 fractional 조정
  // principal=730, rate=0.05, days=365, denom=365 → raw = 36.5 (정확히 0.5)
  // principal=730, rate=0.05, days=146, denom=365 → raw = 14.6 (.6)
  // principal=730, rate=0.05, days=110, denom=365 → raw = 11... 다시 계산
  // 730 × 0.05 = 36.5; days/365 = 110/365 → 36.5 × 110/365 = 4015/365 = 11.0
  // 그냥 직접 raw 계산으로 가자: principal × rate / 365 × days
  // factor = principal × rate / 365. 730 × 0.05 / 365 = 0.1 → days=4 → 0.4, days=5 → 0.5, days=6 → 0.6
  function buildInput(rounding: CalcOptions["rounding"], days: number): InterestInput {
    // days 는 초일 불산입 기준이라 endDate = startDate + days
    const endDate = `2023-01-${String(1 + days).padStart(2, "0")}`;
    return {
      principal: 730,
      startDate: "2023-01-01",
      endDate,
      legalRatePreset: { customRate: 0.05 },
      options: {
        mode: "totalDays",
        leapYear: "fixed365",
        includeFirstDay: false,
        ...(rounding === undefined ? {} : { rounding }),
      },
    };
  }

  it("raw 0.4 → round = 0 (less than 0.5)", () => {
    const result = calculateInterest(buildInput("round", 4));
    expect(result.totalInterest).toBe(0);
  });

  it("raw 0.5 → round = 1 (Math.round half-away-from-zero)", () => {
    const result = calculateInterest(buildInput("round", 5));
    expect(result.totalInterest).toBe(1);
  });

  it("raw 0.6 → round = 1", () => {
    const result = calculateInterest(buildInput("round", 6));
    expect(result.totalInterest).toBe(1);
  });

  it("raw 0.4 → floor = 0, ceil = 1", () => {
    expect(calculateInterest(buildInput("floor", 4)).totalInterest).toBe(0);
    expect(calculateInterest(buildInput("ceil", 4)).totalInterest).toBe(1);
  });
});

describe("rounding v2: 정확히 정수 raw 는 세 mode 동등", () => {
  it("raw 50_000 (정수) → floor = ceil = round = 50_000", () => {
    const base: InterestInput = {
      principal: 1_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    };
    const f = calculateInterest({
      ...base,
      options: { ...base.options, rounding: "floor" },
    }).totalInterest;
    const c = calculateInterest({
      ...base,
      options: { ...base.options, rounding: "ceil" },
    }).totalInterest;
    const r = calculateInterest({
      ...base,
      options: { ...base.options, rounding: "round" },
    }).totalInterest;
    expect(f).toBe(50_000);
    expect(c).toBe(50_000);
    expect(r).toBe(50_000);
  });
});

describe("rounding v2: segment-level 적용 (다구간 명시 segments)", () => {
  // 4구간 명시 segments: 각 구간 raw 는 소수 포함, totalInterest 는 raw 합계
  function buildInput(rounding: CalcOptions["rounding"]): InterestInput {
    return {
      principal: 1_234_567,
      startDate: "2023-01-01",
      endDate: "2023-12-31",
      segments: [
        { from: "2023-01-01", to: "2023-03-31", rate: 0.05 },
        { from: "2023-04-01", to: "2023-06-30", rate: 0.06 },
        { from: "2023-07-01", to: "2023-09-30", rate: 0.07 },
        { from: "2023-10-01", to: "2023-12-31", rate: 0.08 },
      ],
      options: {
        mode: "totalDays",
        leapYear: "fixed365",
        includeFirstDay: false,
        ...(rounding === undefined ? {} : { rounding }),
      },
    };
  }

  it("ceil: 모든 segment.interest ≥ floor segment.interest", () => {
    const f = calculateInterest(buildInput("floor"));
    const c = calculateInterest(buildInput("ceil"));
    for (let i = 0; i < f.segments.length; i++) {
      expect(c.segments[i]!.interest).toBeGreaterThanOrEqual(f.segments[i]!.interest);
    }
    expect(c.totalInterest).toBeGreaterThanOrEqual(f.totalInterest);
  });

  it("round: 모든 segment.interest ∈ [floor, ceil]", () => {
    const f = calculateInterest(buildInput("floor"));
    const c = calculateInterest(buildInput("ceil"));
    const r = calculateInterest(buildInput("round"));
    for (let i = 0; i < f.segments.length; i++) {
      expect(r.segments[i]!.interest).toBeGreaterThanOrEqual(f.segments[i]!.interest);
      expect(r.segments[i]!.interest).toBeLessThanOrEqual(c.segments[i]!.interest);
    }
  });

  it("invariant: 어떤 mode 든 grandTotal = principal + totalInterest", () => {
    for (const mode of ["floor", "ceil", "round"] as const) {
      const result = calculateInterest(buildInput(mode));
      expect(result.grandTotal).toBe(result.principal + result.totalInterest);
    }
  });
});

describe("rounding v2: result.options 패스스루", () => {
  it("rounding 명시 시 result.options.rounding 에 그대로 노출 (.lcalc 재현성)", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: {
        mode: "totalDays",
        leapYear: "fixed365",
        includeFirstDay: false,
        rounding: "ceil",
      },
    });
    expect(result.options.rounding).toBe("ceil");
  });

  it("rounding 미지정 시 result.options.rounding 도 미지정 (입력 그대로 보존)", () => {
    const result = calculateInterest({
      principal: 1_000_000,
      startDate: "2023-01-01",
      endDate: "2024-01-01",
      legalRatePreset: "civil",
      options: { mode: "totalDays", leapYear: "fixed365", includeFirstDay: false },
    });
    expect(result.options.rounding).toBeUndefined();
  });
});
