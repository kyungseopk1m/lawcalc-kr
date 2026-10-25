import { describe, expect, it } from "vitest";
import { computeCompensation, computeCompensationDeath, type CompensationInput } from "../../src";

const FIXED_NOW = () => new Date("2026-10-25T00:00:00.000Z");

// VK 호봉승급 시나리오 5-4 (session-subscreens.md): 상실률 30%, 소득시작 2010.01.01, 360개월, 2단계 승급.
const base: CompensationInput = {
  base: {
    birthDate: "1980-01-01",
    accidentDate: "2010-01-01",
    treatmentEndDate: "2010-01-01",
    sex: "male",
    retirementAge: 60,
    courtTruncation: true,
  },
  lossRate: { permanent: [{ ratio: 0.3 }], hospitalizationFullLoss: false },
  lostIncome: {
    incomeSteps: [
      { fromDate: "2010-01-01", monthlyWageWon: 2_320_000 },
      { fromDate: "2012-01-01", monthlyWageWon: 2_436_000 },
      { fromDate: "2014-01-01", monthlyWageWon: 2_552_000 },
    ],
  },
};

describe("호봉승급 일정 (incomeSteps)", () => {
  it("VK 5-4: 승급일마다 구간을 나눠 165,819,114원", () => {
    const r = computeCompensation(base, { now: FIXED_NOW });
    expect(r.segments.map((s) => [s.startMonth, s.endMonth, s.monthlyWageWon])).toEqual([
      [0, 24, 2_320_000],
      [24, 48, 2_436_000],
      [48, 360, 2_552_000],
    ]);
    expect(r.segments.map((s) => s.amountFloorWon)).toEqual([15_888_984, 15_233_452, 134_696_678]);
    expect(r.lostIncomeSubtotalWon).toBe(165_819_114);
    expect(r.segments.every((s) => s.wageBasis === "step" && s.dailyWageWon === 0)).toBe(true);
  });

  it("첫 승급 이전은 일당 × 가동일수, 이후는 승급 월소득", () => {
    const r = computeCompensation(
      {
        ...base,
        lostIncome: {
          directWageWon: 100_000,
          workingDaysPerMonth: 20,
          incomeSteps: [{ fromDate: "2012-01-01", monthlyWageWon: 3_000_000 }],
        },
      },
      { now: FIXED_NOW },
    );
    expect(r.segments.map((s) => [s.endMonth, s.monthlyWageWon, s.wageBasis])).toEqual([
      [24, 2_000_000, undefined],
      [360, 3_000_000, "step"],
    ]);
  });

  it("첫 승급이 사고일 이후면 직종·일당 입력이 필요하다", () => {
    expect(() =>
      computeCompensation({
        ...base,
        lostIncome: { incomeSteps: [{ fromDate: "2012-01-01", monthlyWageWon: 1 }] },
      }),
    ).toThrow(RangeError);
    expect(() =>
      computeCompensation({
        ...base,
        lostIncome: {
          incomeSteps: [
            { fromDate: "2012-01-01", monthlyWageWon: 1 },
            { fromDate: "2011-01-01", monthlyWageWon: 1 },
          ],
        },
      }),
    ).toThrow(/incomeSteps\[1\]\.fromDate/);
  });
});

describe("일실수입 표 행 단위 편집 (manualRows)", () => {
  it("승급 결과와 같은 행을 직접 넣으면 같은 금액", () => {
    const r = computeCompensation(
      {
        ...base,
        lostIncome: {
          manualRows: [
            {
              startMonth: 0,
              endMonth: 24,
              monthlyWageWon: 2_320_000,
              lossRate: 0.3,
              livingCostDeducted: false,
            },
            {
              startMonth: 24,
              endMonth: 48,
              monthlyWageWon: 2_436_000,
              lossRate: 0.3,
              livingCostDeducted: false,
            },
            {
              startMonth: 48,
              endMonth: 360,
              monthlyWageWon: 2_552_000,
              lossRate: 0.3,
              livingCostDeducted: false,
            },
          ],
        },
      },
      { now: FIXED_NOW },
    );
    expect(r.lostIncomeSubtotalWon).toBe(165_819_114);
    expect(r.segments.every((s) => s.wageBasis === "manual")).toBe(true);
    expect(r.combinedLossRate).toBe(0.3);
  });

  it("행마다 상실률·생계비 공제, 계수는 H[끝] - H[시작], 240 한도는 행 순서대로", () => {
    const r = computeCompensation(
      {
        ...base,
        base: { ...base.base, courtTruncation: false },
        lostIncome: {
          manualRows: [
            {
              startMonth: 0,
              endMonth: 12,
              monthlyWageWon: 1_000_000,
              lossRate: 1,
              livingCostDeducted: false,
            },
            {
              startMonth: 12,
              endMonth: 600,
              monthlyWageWon: 1_000_000,
              lossRate: 0.5,
              livingCostDeducted: true,
            },
          ],
        },
      },
      { now: FIXED_NOW },
    );
    const [a, b] = r.segments;
    expect(a?.lossRate).toBe(1);
    expect(b?.livingCostDeducted).toBe(true);
    expect(r.hoffman240Cap.cappedAtIndex).toBe(1);
    expect((a?.appliedHoffman ?? 0) + (b?.appliedHoffman ?? 0)).toBeCloseTo(240, 10);
    expect(b?.amountFloorWon).toBe(
      Math.floor((1_000_000 * 0.5 * (b?.appliedHoffman ?? 0) * 2) / 3),
    );
  });

  it("겹치는 행은 거부", () => {
    expect(() =>
      computeCompensation({
        ...base,
        lostIncome: {
          manualRows: [
            {
              startMonth: 0,
              endMonth: 24,
              monthlyWageWon: 1,
              lossRate: 0.3,
              livingCostDeducted: false,
            },
            {
              startMonth: 12,
              endMonth: 30,
              monthlyWageWon: 1,
              lossRate: 0.3,
              livingCostDeducted: false,
            },
          ],
        },
      }),
    ).toThrow(/manualRows\[1\]/);
  });
});

describe("사망: 호봉승급·직접 편집", () => {
  const death = {
    mode: "death" as const,
    base: {
      birthDate: "1980-01-01",
      accidentDate: "2010-01-01",
      sex: "male" as const,
      retirementAge: 60,
      courtTruncation: true,
    },
    lostIncome: {
      incomeSteps: [
        { fromDate: "2010-01-01", monthlyWageWon: 2_320_000 },
        { fromDate: "2012-01-01", monthlyWageWon: 2_436_000 },
      ],
    },
  };

  it("승급일 경계 + 생계비 1/3 공제", () => {
    const r = computeCompensationDeath(death, { now: FIXED_NOW });
    expect(
      r.segments.map((s) => [s.startMonth, s.endMonth, s.monthlyWageWon, s.wageBasis]),
    ).toEqual([
      [0, 24, 2_320_000, "step"],
      [24, 360, 2_436_000, "step"],
    ]);
    // 2,320,000 × 22.8290 = 52,963,280, × 2/3 = 35,308,853.3 → 35,308,853.
    expect(r.segments[0]?.amountFloorWon).toBe(35_308_853);
  });

  it("직접 편집 행: 생계비 공제를 끈 행은 2/3 을 곱하지 않는다", () => {
    const r = computeCompensationDeath(
      {
        ...death,
        lostIncome: {
          manualRows: [
            {
              startMonth: 0,
              endMonth: 24,
              monthlyWageWon: 2_320_000,
              lossRate: 1,
              livingCostDeducted: true,
            },
            {
              startMonth: 24,
              endMonth: 48,
              monthlyWageWon: 2_436_000,
              lossRate: 0.5,
              livingCostDeducted: false,
            },
          ],
        },
      },
      { now: FIXED_NOW },
    );
    expect(r.segments[0]?.amountFloorWon).toBe(35_308_853);
    // 2,436,000 × 0.5 × (43.6739 - 22.8290 = 20.8449) = 25,389,088.2 → 25,389,088.
    expect(r.segments[1]?.amountFloorWon).toBe(25_389_088);
    expect(r.segments[1]?.lossRate).toBe(0.5);
    expect(r.segments.map((s) => s.livingCostDeducted)).toEqual([undefined, false]);
  });
});

// 2026-10-25 독립 검증(report-p5-3) 결함 A~D 회귀. 기대값은 Fraction 손계산:
// H4[12] = 11.6858 (법원식 4자리 절사), H[60] - H[59] = 0.8 정확.
describe("직접 편집 행 상실률 절사·구간 계수 정확 분수 (검증 결함 A~D)", () => {
  const row = {
    startMonth: 0,
    endMonth: 12,
    monthlyWageWon: 1_000_000,
    lossRate: 0.123456,
    livingCostDeducted: false,
  };
  const death = {
    mode: "death" as const,
    base: {
      birthDate: "1980-01-01",
      accidentDate: "2010-01-01",
      sex: "male" as const,
      retirementAge: 60,
      courtTruncation: true,
    },
    lostIncome: { manualRows: [row] },
  };

  it("A: 법원식 절사면 행 상실률을 % 2자리에서 버린다 (0.123456 → 0.1234, 반올림 아님)", () => {
    // floor(1,000,000 × 0.1234 × 11.6858) = 1,442,027 (반올림 0.1235 면 1,443,196)
    const r = computeCompensation(
      { ...base, lostIncome: { manualRows: [row] } },
      { now: FIXED_NOW },
    );
    expect(r.segments[0]?.lossRate).toBe(0.1234);
    expect(r.segments[0]?.amountFloorWon).toBe(1_442_027);
    const d = computeCompensationDeath(death, { now: FIXED_NOW });
    expect(d.segments[0]?.lossRate).toBe(0.1234);
    expect(d.segments[0]?.amountFloorWon).toBe(1_442_027);
  });

  it("B: 법원식 + 단계마다 절사도 행 상실률을 버린 뒤 곱한다", () => {
    // floor(floor(1,000,000 × 0.1234) × 11.6858) = floor(123,400 × 11.6858) = 1,442,027
    // (미절사면 floor(123,456 × 11.6858) = 1,442,682)
    const r = computeCompensation(
      {
        ...base,
        base: { ...base.base, truncateEachStep: true },
        lostIncome: { manualRows: [row] },
      },
      { now: FIXED_NOW },
    );
    expect(r.segments[0]?.amountFloorWon).toBe(1_442_027);
    const d = computeCompensationDeath(
      { ...death, base: { ...death.base, truncateEachStep: true } },
      { now: FIXED_NOW },
    );
    expect(d.segments[0]?.amountFloorWon).toBe(1_442_027);
  });

  it("C: 구간 계수 H[60] - H[59] = 0.8 을 정확히 곱해 1원 모자라지 않는다", () => {
    // 1,000,000 × 0.15 × 0.8 = 120,000 (실수 뺄셈 0.7999999999999972 면 119,999)
    for (const truncateEachStep of [false, true]) {
      const r = computeCompensation(
        {
          base: {
            birthDate: "1946-05-01",
            accidentDate: "2006-05-01",
            sex: "female",
            retirementAge: 65,
            truncateEachStep,
            treatmentEndDate: "2011-04-01",
          },
          lostIncome: { workingDaysPerMonth: 20, directWageWon: 50_000 },
          lossRate: { permanent: [{ ratio: 0.15 }] },
          deductions: { ratio: [], absolute: [] },
        },
        { now: FIXED_NOW },
      );
      const seg = r.segments.find((s) => s.startMonth === 59 && s.endMonth === 60);
      expect(seg?.amountFloorWon).toBe(120_000);
    }
    const d = computeCompensationDeath(
      {
        ...death,
        base: { ...death.base, courtTruncation: false },
        lostIncome: {
          manualRows: [{ ...row, startMonth: 59, endMonth: 60, lossRate: 0.15 }],
        },
      },
      { now: FIXED_NOW },
    );
    expect(d.segments[0]?.amountFloorWon).toBe(120_000);
  });

  it("D: 사망에서 같은 월수의 승급 두 건은 길이 0 행을 남기지 않는다 (뒤 승급 적용)", () => {
    const d = computeCompensationDeath(
      {
        ...death,
        lostIncome: {
          incomeSteps: [
            { fromDate: "2010-01-01", monthlyWageWon: 2_000_000 },
            { fromDate: "2013-02-20", monthlyWageWon: 2_100_000 },
            { fromDate: "2013-02-25", monthlyWageWon: 2_200_000 },
          ],
        },
      },
      { now: FIXED_NOW },
    );
    expect(d.segments.map((s) => [s.startMonth, s.endMonth, s.monthlyWageWon])).toEqual([
      [0, 37, 2_000_000],
      [37, 360, 2_200_000],
    ]);
  });
});
