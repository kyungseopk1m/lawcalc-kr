import { describe, expect, it } from "vitest";
import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";

const FIXED_NOW = () => new Date("2026-06-02T00:00:00.000Z");

/** 30세男 사망, 가동연한 65세(420개월 → 240 cap), 보통인부 자동입력. */
function baseInput(): CompensationAutoDeathInput {
  return {
    mode: "death",
    base: {
      birthDate: "1996-01-01",
      accidentDate: "2026-01-01",
      sex: "male",
      retirementAge: 65,
    },
    lostIncome: { occupation: "보통인부", discountMethod: "hoffman" },
    solatiumWon: 0,
    faultRatio: 0,
  };
}

describe("computeCompensationDeath — 자×사망 엔진", () => {
  it("기본 사망: 생계비 1/3 + 장례비 default 500만, 240 cap 적용", () => {
    const result = computeCompensationDeath(baseInput(), { now: FIXED_NOW });
    expect(result.mode).toBe("death");
    expect(result.livingCostDeductionRatio).toBeCloseTo(1 / 3, 12);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]!.startMonth).toBe(0);
    expect(result.segments[0]!.endMonth).toBe(420);
    expect(result.segments[0]!.lossRate).toBe(1);
    expect(result.segments[0]!.dailyWageWon).toBe(172068);
    expect(result.segments[0]!.monthlyWageWon).toBe(3785496);
    expect(result.lostIncomeSubtotalWon).toBe(605679360);
    expect(result.funeralExpenseWon).toBe(5000000);
    expect(result.finalWon).toBe(610679300);
    expect(result.hoffman240Cap.cappedAtIndex).toBe(0);
    expect(result.inheritanceShares).toBeUndefined();
  });

  it("가동연한 짧아 240 cap 미적용 (60세 사망, 60개월)", () => {
    const input = baseInput();
    input.base.birthDate = "1966-01-01"; // 60세
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.segments[0]!.endMonth).toBe(60);
    expect(result.hoffman240Cap.cappedAtIndex).toBeNull();
    expect(result.lostIncomeSubtotalWon).toBe(134901392);
    expect(result.finalWon).toBe(139901300);
  });

  it("생계비 비율 override (0.5)", () => {
    const input = baseInput();
    input.livingCostDeductionRatio = 0.5;
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.livingCostDeductionRatio).toBe(0.5);
    expect(result.lostIncomeSubtotalWon).toBe(454259520);
    expect(result.finalWon).toBe(459259500);
  });

  it("장례비 override (0원)", () => {
    const input = baseInput();
    input.funeralExpenseWon = 0;
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.funeralExpenseWon).toBe(0);
    expect(result.finalWon).toBe(605679300);
  });

  it("위자료 가산 (유족 위자료 8천만)", () => {
    const input = baseInput();
    input.solatiumWon = 80000000;
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.solatiumWon).toBe(80000000);
    expect(result.pecuniaryDamagesSubtotalWon).toBe(605679360 + 80000000);
    expect(result.finalWon).toBe(Math.floor((605679360 + 80000000 + 5000000) / 100) * 100);
  });

  it("과실상계 50% — 장례비는 과실상계 후 전액 가산", () => {
    const input = baseInput();
    input.faultRatio = 0.5;
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.faultOffset.ratio).toBe(0.5);
    expect(result.faultOffset.afterWon).toBe(302839680);
    expect(result.finalWon).toBe(307839600);
  });

  it("경계: 과실 100% → 일실수입 0, 장례비만 잔존", () => {
    const input = baseInput();
    input.faultRatio = 1;
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.faultOffset.afterWon).toBe(0);
    expect(result.finalWon).toBe(5000000);
  });

  it("공제 (전액공제 + 비율공제) 조합", () => {
    const input = baseInput();
    input.deductions = {
      ratio: [{ label: "기여도", ratio: 0.1 }],
      absolute: [{ label: "선급금", amount: 10000000 }],
    };
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    const afterFuneral = 605679360 + 5000000;
    const ratioSub = Math.floor(afterFuneral * 0.1);
    expect(result.deductions.ratioSubtotalWon).toBe(ratioSub);
    expect(result.deductions.absoluteSubtotalWon).toBe(10000000);
    const expectedFinal = Math.floor((afterFuneral - ratioSub - 10000000) / 100) * 100;
    expect(result.finalWon).toBe(expectedFinal);
  });

  it("directWageWon override (200,000원/일)", () => {
    const input = baseInput();
    input.lostIncome = { directWageWon: 200000 };
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.segments[0]!.dailyWageWon).toBe(200000);
    expect(result.finalWon).toBe(709000000);
  });

  it("상속분배: 배우자 단독 → 전액 배우자", () => {
    const input = baseInput();
    input.heirs = {
      decedent: { deceasedAt: "2026-01-01" },
      spouse: { name: "배우자", alive: true },
    };
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.inheritanceShares).toHaveLength(1);
    expect(result.inheritanceShares![0]!.name).toBe("배우자");
    expect(result.inheritanceShares![0]!.amountWon).toBe(610679300);
  });

  it("상속분배: 배우자 + 자녀 2 (3:2:2), 합계 = finalWon round-trip", () => {
    const input = baseInput();
    input.heirs = {
      decedent: { deceasedAt: "2026-01-01" },
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        { name: "자녀1", deceasedBeforeOpening: false },
        { name: "자녀2", deceasedBeforeOpening: false },
      ],
    };
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    const shares = result.inheritanceShares!;
    expect(shares).toHaveLength(3);
    expect(shares.map((s) => s.name)).toEqual(["배우자", "자녀1", "자녀2"]);
    expect(shares[0]!.numerator).toBe(3);
    expect(shares[0]!.denominator).toBe(7);
    const sum = shares.reduce((acc, s) => acc + s.amountWon, 0);
    expect(sum).toBe(result.finalWon);
  });

  it("상속분배: 형제자매 2 균분, 합계 = finalWon round-trip", () => {
    const input = baseInput();
    input.heirs = {
      decedent: { deceasedAt: "2026-01-01" },
      siblings: [
        { name: "형제1", deceasedBeforeOpening: false },
        { name: "형제2", deceasedBeforeOpening: false },
      ],
    };
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    const shares = result.inheritanceShares!;
    expect(shares).toHaveLength(2);
    const sum = shares.reduce((acc, s) => acc + s.amountWon, 0);
    expect(sum).toBe(result.finalWon);
    expect(shares[0]!.amountWon).toBe(305339650);
    expect(shares[1]!.amountWon).toBe(305339650);
  });

  it("분배 round-trip: 잔여원 선순위(배우자) 배정 (remainder=1)", () => {
    const input = baseInput();
    input.base.birthDate = "1986-01-01"; // 40세
    input.solatiumWon = 80000000;
    input.faultRatio = 0.2;
    input.deductions = { absolute: [{ label: "보험금", amount: 12345678 }] };
    input.heirs = {
      decedent: { deceasedAt: "2026-01-01" },
      spouse: { name: "배우자", alive: true },
      linealDescendants: [
        { name: "자녀1", deceasedBeforeOpening: false },
        { name: "자녀2", deceasedBeforeOpening: false },
      ],
    };
    const result = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(result.finalWon).toBe(449025000);
    const shares = result.inheritanceShares!;
    // floor: 192439285 / 128292857 / 128292857, remainder 1 → 배우자
    expect(shares[0]!.amountWon).toBe(192439286);
    expect(shares[1]!.amountWon).toBe(128292857);
    expect(shares[2]!.amountWon).toBe(128292857);
    expect(shares.reduce((a, s) => a + s.amountWon, 0)).toBe(result.finalWon);
  });

  it("경계: heirs 없음 → inheritanceShares undefined", () => {
    const result = computeCompensationDeath(baseInput(), { now: FIXED_NOW });
    expect(result.inheritanceShares).toBeUndefined();
    expect(result.rawInheritanceShares).toBeUndefined();
  });

  it("dataVersions 4종 + disclaimer 단일 source + computedAt", () => {
    const result = computeCompensationDeath(baseInput(), { now: FIXED_NOW });
    expect(result.dataVersions).toEqual({
      laborRates: "labor-rates/v1.0.0",
      lifeExpectancy: "life-expectancy/v1.0.0",
      hoffman: "hoffman/v1.0.0",
      leibniz: "leibniz/v1.0.0",
    });
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(result.computedAt).toBe("2026-06-02T00:00:00.000Z");
  });

  it("inheritance 검증 전파: 1991-01-01 이전 사망은 RangeError", () => {
    const input = baseInput();
    input.heirs = {
      decedent: { deceasedAt: "1990-12-31" },
      spouse: { name: "배우자", alive: true },
    };
    expect(() => computeCompensationDeath(input, { now: FIXED_NOW })).toThrow(RangeError);
  });
});
