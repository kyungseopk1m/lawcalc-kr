import { describe, expect, it } from "vitest";
import { loadHoffmanTable } from "@lawcalc-kr/datasets-compensation";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";

const FIXED_NOW = () => new Date("2026-10-22T00:00:00.000Z");

/** VK C-1: 1980-01-01 남, 사고 2010-01-01, 가동 65세, 일당 68,965 × 22일 = 1,517,230, 생계비 1/3. */
function c1(): CompensationAutoDeathInput {
  return {
    mode: "death",
    base: {
      birthDate: "1980-01-01",
      accidentDate: "2010-01-01",
      sex: "male",
      retirementAge: 65,
      courtTruncation: true,
    },
    lostIncome: { directWageWon: 68_965, workingDaysPerMonth: 22 },
    livingCostDeductionRatio: 1 / 3,
    funeralExpenseWon: 5_000_000,
    faultRatio: 0.1,
  };
}

describe("자×사망 법원 예시 절사 (courtTruncation)", () => {
  it("VK C-1: 240 한도라 floor(1,517,230 × 240 × 2/3) = 242,756,800 (VK 242,756,640 은 선절사, 미채택)", () => {
    const r = computeCompensationDeath(c1(), { now: FIXED_NOW });
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]!.monthlyWageWon).toBe(1_517_230);
    expect(r.segments[0]!.appliedHoffman).toBe(240);
    expect(r.lostIncomeSubtotalWon).toBe(242_756_800);
    // (242,756,800 + 5,000,000) × 0.9 = 222,981,120 → 100원 미만 절사.
    expect(r.faultOffset.afterWon).toBe(222_981_120);
    expect(r.finalWon).toBe(222_981_100);
  });

  it("240 한도 미적용 (가동 40세, 120개월): 절사표 H[120] = 97.1451", () => {
    const input = c1();
    input.base.retirementAge = 40;
    const r = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(r.segments[0]!.endMonth).toBe(120);
    expect(r.segments[0]!.appliedHoffman).toBe(97.1451);
    // Fraction: floor(1,517,230 × 971451/10000 × 2/3) = floor(1,473,931,437,730 × 2 / 30,000) = 98,260,973.
    expect(r.lostIncomeSubtotalWon).toBe(98_260_973);
    // 절사 없음(종전): 원 표 97.14515218 → 98,261,026 원 근방. 키 없으면 종전 경로.
    delete input.base.courtTruncation;
    expect(computeCompensationDeath(input, { now: FIXED_NOW }).lostIncomeSubtotalWon).not.toBe(
      98_260_973,
    );
  });

  it("생계비 0.3 은 십진 분수 7/10: floor(1,517,230 × 97.1451 × 0.7) = 103,174,022", () => {
    const input = c1();
    input.base.retirementAge = 40;
    input.livingCostDeductionRatio = 0.3;
    expect(computeCompensationDeath(input, { now: FIXED_NOW }).lostIncomeSubtotalWon).toBe(
      103_174_022,
    );
  });

  it("절사에서 생계비가 1/3 도 아니고 소수 6자리를 넘으면 거부", () => {
    const input = c1();
    input.livingCostDeductionRatio = 0.1234567;
    expect(() => computeCompensationDeath(input, { now: FIXED_NOW })).toThrow(RangeError);
    input.base.courtTruncation = "yes" as unknown as boolean;
    input.livingCostDeductionRatio = 1 / 3;
    expect(() => computeCompensationDeath(input, { now: FIXED_NOW })).toThrow(RangeError);
  });

  it("퍼징: 가동 월수·만 원 단위 월급여, 독립 BigInt 계산과 원 단위 일치", () => {
    const hoffman = loadHoffmanTable();
    // 누적 계수 8자리 정수 → 4자리 절사 정수 (엔진과 독립 경로).
    const h4 = (m: number) =>
      m === 0 ? 0n : BigInt(Math.round(hoffman.values[m - 1]! * 1e8)) / 10000n;
    for (let i = 0; i < 300; i++) {
      const age = 31 + (i % 34); // 1~34년 가동 (12~408개월, 240 한도 이전 포함)
      const wage = 10_000 * (3 + ((i * 37) % 30));
      const input = c1();
      input.base.retirementAge = age;
      input.lostIncome = { directWageWon: wage, workingDaysPerMonth: 20 };
      const months = (age - 30) * 12;
      const r = computeCompensationDeath(input, { now: FIXED_NOW });
      const coef = h4(months) > 2_400_000n ? 2_400_000n : h4(months);
      expect(BigInt(r.lostIncomeSubtotalWon), `${age}/${wage}`).toBe(
        (BigInt(wage * 20) * coef * 2n) / 30000n,
      );
    }
  });

  it("퍼징: 계산 기준일 분할 구간(4자리 계수 차) 금액 = 독립 BigInt", () => {
    for (let i = 0; i < 100; i++) {
      const input = c1();
      input.base.retirementAge = 31 + (i % 34);
      input.base.calculationDate = "2026-06-01";
      input.lostIncome = { occupation: "보통인부", workingDaysPerMonth: 20 + (i % 3) };
      input.livingCostDeductionRatio = i % 2 === 0 ? 1 / 3 : 0.3;
      const r = computeCompensationDeath(input, { now: FIXED_NOW });
      expect(r.segments.length).toBeGreaterThan(1);
      for (const s of r.segments) {
        const keep = i % 2 === 0 ? [2n, 3n] : [7n, 10n];
        const ref =
          (BigInt(s.monthlyWageWon) * BigInt(Math.round(s.appliedHoffman * 1e4)) * keep[0]!) /
          (10000n * keep[1]!);
        expect(BigInt(s.amountFloorWon), `${i}`).toBe(ref);
      }
    }
  });

  it("기대여명은 표시만, 금액 불변 / 일실퇴직금은 상실률 100 으로 합산", () => {
    const plain = computeCompensationDeath(c1(), { now: FIXED_NOW });
    const input = c1();
    input.lifeExpectancy = { shortening: { method: "remainingYears", years: 5 } };
    input.lostRetirement = {
      method: "bothDiscounted",
      retirementDate: "2039-12-31",
      payAtRetirementWon: 90_000_000,
      separationDate: "2012-01-01",
      payAtSeparationWon: 15_000_000,
      lossRatePercent: 43.63,
    };
    const r = computeCompensationDeath(input, { now: FIXED_NOW });
    expect(r.lifeExpectancy?.endDate).toBe("2014-12-31");
    expect(r.lostIncomeSubtotalWon).toBe(plain.lostIncomeSubtotalWon);
    expect(r.lostRetirement?.lossRatePercent).toBe(100);
    expect(r.lostRetirementSubtotalWon).toBe(22_365_000);
    expect(r.pecuniaryDamagesSubtotalWon).toBe(242_756_800 + 22_365_000 + 5_000_000);
    expect(plain).not.toHaveProperty("lostRetirementSubtotalWon");
    expect(plain).not.toHaveProperty("lifeExpectancy");
  });
});
