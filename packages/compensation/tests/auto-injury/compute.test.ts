import { describe, expect, it } from "vitest";
import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";

const FIXED_NOW = () => new Date("2026-05-18T00:00:00.000Z");

function baseInput(): CompensationInput {
  return {
    base: {
      birthDate: "1996-01-01",
      accidentDate: "2026-01-01",
      treatmentEndDate: "2026-01-01",
      sex: "male",
      retirementAge: 60,
    },
    lossRate: {
      permanent: [{ department: "정형외과", ratio: 0.3 }],
      temporary: [],
      priorImpairmentRatio: 0,
    },
    lostIncome: { occupation: "보통인부", discountMethod: "hoffman" },
    solatiumWon: 0,
    faultRatio: 0,
    deductions: { ratio: [], absolute: [] },
  };
}

describe("computeCompensation — 10 단계 path", () => {
  it("case-comp-001 path: 영구장해 30% 단일 segment 360개월 → 249,399,900원", () => {
    const result = computeCompensation(baseInput(), { now: FIXED_NOW });
    expect(result.combinedLossRate).toBeCloseTo(0.3, 6);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.startMonth).toBe(0);
    expect(result.segments[0]!.endMonth).toBe(360);
    expect(result.segments[0]!.dailyWageWon).toBe(172068);
    expect(result.segments[0]!.monthlyWageWon).toBe(3785496);
    expect(result.lostIncomeSubtotalWon).toBe(249399909);
    expect(result.faultOffset.afterWon).toBe(249399909);
    expect(result.deductions.afterWon).toBe(249399909);
    expect(result.finalWon).toBe(249399900);
    expect(result.hoffman240Cap.cappedAtIndex).toBeNull();
  });

  it("case-comp-002 path: 한시 5y×20% 환산 + 영구 58% → 단일 segment 0.622 → 517,089,100원", () => {
    const input = baseInput();
    input.lossRate.permanent = [{ department: "신장내과", ratio: 0.58 }];
    input.lossRate.temporary = [{ department: "정형외과", ratio: 0.2, years: 5 }];
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.combinedLossRate).toBeCloseTo(0.622, 6);
    expect(result.segments).toHaveLength(1);
    expect(result.lostIncomeSubtotalWon).toBe(517089145);
    expect(result.finalWon).toBe(517089100);
  });

  it("case-comp-003 path: 영구 30% + 가동 65세 480개월 → 240 cap → 272,555,700원", () => {
    const input = baseInput();
    input.base.birthDate = "2001-01-01";
    input.base.retirementAge = 65;
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.endMonth).toBe(480);
    expect(result.segments[0]!.appliedHoffman).toBe(240);
    expect(result.hoffman240Cap.cappedAtIndex).toBe(0);
    expect(result.lostIncomeSubtotalWon).toBe(272555712);
    expect(result.finalWon).toBe(272555700);
  });

  it("case-comp-005 path: 한시 5y×30% 단독 + 영구 0% → segment split (cut at 60m) → 30,352,800원", () => {
    const input = baseInput();
    input.lossRate.permanent = [];
    input.lossRate.temporary = [{ department: "정형외과", ratio: 0.3, years: 5 }];
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.startMonth).toBe(0);
    expect(result.segments[0]!.endMonth).toBe(60);
    expect(result.segments[0]!.lossRate).toBeCloseTo(0.15, 6);
    expect(result.segments[1]!.startMonth).toBe(60);
    expect(result.segments[1]!.endMonth).toBe(360);
    expect(result.segments[1]!.lossRate).toBe(0);
    expect(result.segments[0]!.amountFloorWon).toBe(30352813);
    expect(result.segments[1]!.amountFloorWon).toBe(0);
    expect(result.lostIncomeSubtotalWon).toBe(30352813);
    expect(result.finalWon).toBe(30352800);
  });

  it("case-comp-007 path: case-001 + 과실 30% + 전액공제 8M → 166,579,900원", () => {
    const input = baseInput();
    input.faultRatio = 0.3;
    input.deductions = {
      ratio: [],
      absolute: [
        { label: "기지급 치료비", amount: 5_000_000 },
        { label: "선급금", amount: 3_000_000 },
      ],
    };
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.lostIncomeSubtotalWon).toBe(249399909);
    expect(result.faultOffset.ratio).toBe(0.3);
    expect(result.faultOffset.afterWon).toBe(174579936);
    expect(result.deductions.absoluteSubtotalWon).toBe(8_000_000);
    expect(result.deductions.ratioSubtotalWon).toBe(0);
    expect(result.deductions.afterWon).toBe(166579936);
    expect(result.finalWon).toBe(166579900);
  });

  it("directWageWon override path: occupation lookup 없이도 계산", () => {
    const input = baseInput();
    input.lostIncome = { directWageWon: 200_000 };
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments[0]!.dailyWageWon).toBe(200_000);
    expect(result.segments[0]!.monthlyWageWon).toBe(200_000 * 22);
    expect(result.lostIncomeSubtotalWon).toBeGreaterThan(0);
  });

  it("occupation lookup miss + no directWageWon → RangeError", () => {
    const input = baseInput();
    input.lostIncome = { occupation: "존재하지않는직종" };
    expect(() => computeCompensation(input, { now: FIXED_NOW })).toThrow(/존재하지않는직종/);
  });

  it("retirementAge ≤ accident age → RangeError (가동연한 종료가 사고일 이전)", () => {
    const input = baseInput();
    input.base.birthDate = "1990-01-01";
    input.base.accidentDate = "2026-01-01";
    input.base.retirementAge = 30;
    expect(() => computeCompensation(input, { now: FIXED_NOW })).toThrow(/가동연한 종료일/);
  });

  it("dataVersions emits 4 dataset tags", () => {
    const result = computeCompensation(baseInput(), { now: FIXED_NOW });
    expect(result.dataVersions.laborRates).toBe("labor-rates/v1.0.0");
    expect(result.dataVersions.lifeExpectancy).toBe("life-expectancy/v1.0.0");
    expect(result.dataVersions.hoffman).toBe("hoffman/v1.0.0");
    expect(result.dataVersions.leibniz).toBe("leibniz/v1.0.0");
  });

  it("disclaimer is the STANDARD_DISCLAIMER single source", () => {
    const result = computeCompensation(baseInput(), { now: FIXED_NOW });
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
  });

  it("computedAt reflects injected now()", () => {
    const result = computeCompensation(baseInput(), { now: FIXED_NOW });
    expect(result.computedAt).toBe("2026-05-18T00:00:00.000Z");
  });

  it("workingDaysPerMonth override changes monthly wage scaling", () => {
    const input = baseInput();
    input.lostIncome.workingDaysPerMonth = 30;
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments[0]!.monthlyWageWon).toBe(172068 * 30);
  });

  it("multiple permanent ratios combine via 1 - Π(1 - r_i)", () => {
    const input = baseInput();
    input.lossRate.permanent = [{ ratio: 0.5 }, { ratio: 0.3 }];
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.combinedLossRate).toBeCloseTo(1 - 0.5 * 0.7, 6);
  });
});

describe("computeCompensation — 산재(산×부상) 장해급여 공제 (v0.7.0)", () => {
  it("case-comp-010 path: 과실 20% 후 장해급여 5천만 공제 → 149,519,900원", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    input.faultRatio = 0.2;
    input.industrialInsurance = { disabilityBenefitWon: 50_000_000 };
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.accidentType).toBe("industrial");
    expect(result.faultOffset.afterWon).toBe(199519927);
    expect(result.deductions.industrialBenefitWon).toBe(50_000_000);
    expect(result.deductions.afterWon).toBe(149519927);
    expect(result.finalWon).toBe(149519900);
  });

  it("장해급여가 과실상계 후 손해를 초과하면 최종 0원 (음수 floor)", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    input.industrialInsurance = { disabilityBenefitWon: 999_999_999_999 };
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.finalWon).toBe(0);
    expect(result.deductions.industrialBenefitWon).toBe(999_999_999_999);
  });

  it("산재인데 장해급여 미지정 → 0원 공제 (default), 자동차 최종액과 동일", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.accidentType).toBe("industrial");
    expect(result.deductions.industrialBenefitWon).toBe(0);
    expect(result.finalWon).toBe(249399900);
  });

  it("accidentType 미지정(자동차) → 결과에 accidentType·industrialBenefitWon 키 생략 (회귀 0)", () => {
    const result = computeCompensation(baseInput(), { now: FIXED_NOW });
    expect(result.accidentType).toBeUndefined();
    expect(result.deductions.industrialBenefitWon).toBeUndefined();
    expect(result.finalWon).toBe(249399900);
  });
});
