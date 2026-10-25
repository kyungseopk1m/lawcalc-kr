import { describe, expect, it } from "vitest";
import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";

const FIXED_NOW = () => new Date("2026-10-22T00:00:00.000Z");

/**
 * 사고 2017-03-29, 1993-01-01 남(24세), 영구 30%, 월급여 2,000,000, 가동 65세(2058-01-01, 489개월).
 * 여명 14년(remainingYears) → 여명종료일 2017-03-29 + floor(14 × 365)일 = 2031-03-26
 * (서울고법 2022. 2. 18. 선고 2020나2039267 과 같은 날짜), 경계 = 2031-03-27, 167개월.
 */
function input(): CompensationInput {
  return {
    base: {
      birthDate: "1993-01-01",
      accidentDate: "2017-03-29",
      treatmentEndDate: "2017-03-29",
      sex: "male",
      retirementAge: 65,
      courtTruncation: true,
    },
    lossRate: { permanent: [{ ratio: 0.3 }] },
    lostIncome: { directWageWon: 100_000, workingDaysPerMonth: 20 },
    lifeExpectancy: { shortening: { method: "remainingYears", years: 14 } },
  };
}

describe("부상 기대여명 (lifeExpectancy)", () => {
  it("여명 이후 구간은 생계비 1/3 공제 (절사 경로)", () => {
    const r = computeCompensation(input(), { now: FIXED_NOW });
    expect(r.lifeExpectancy?.endDate).toBe("2031-03-26");
    expect(r.segments.map((s) => [s.startMonth, s.endMonth])).toEqual([
      [0, 167],
      [167, 489],
    ]);
    // H4[167] = 126.5568: floor(2,000,000 × 0.3 × 126.5568) = 75,934,080.
    expect(r.segments[0]!.amountFloorWon).toBe(75_934_080);
    expect(r.segments[0]).not.toHaveProperty("livingCostDeducted");
    // 240 한도 잔여 113.4432: floor(600,000 × 113.4432 × 2/3) = 45,377,280.
    expect(r.segments[1]!.appliedHoffman).toBeCloseTo(113.4432, 10);
    expect(r.segments[1]!.amountFloorWon).toBe(45_377_280);
    expect(r.segments[1]!.livingCostDeducted).toBe(true);
    expect(r.lostIncomeSubtotalWon).toBe(121_311_360);
  });

  it("절사 없음 경로도 × 2/3 은 정확한 분수: floor(600,000 × 113.44311032 × 2/3) = 45,377,244", () => {
    const i = input();
    delete i.base.courtTruncation;
    const r = computeCompensation(i, { now: FIXED_NOW });
    expect(r.segments[1]!.amountFloorWon).toBe(45_377_244);
    expect(r.segments[1]!.livingCostDeducted).toBe(true);
  });

  it("같은 월수의 한시장해 종료 경계와 합쳐져도 그 뒤 구간은 공제", () => {
    const i = input();
    i.lossRate.temporary = [{ ratio: 0.1, years: 167 / 12 }];
    const r = computeCompensation(i, { now: FIXED_NOW });
    expect(r.segments.map((s) => [s.startMonth, s.livingCostDeducted ?? false])).toEqual([
      [0, false],
      [167, true],
    ]);
  });

  it("여명종료일이 가동종료 이후면 금액 불변, 결과만 싣는다", () => {
    const i = input();
    i.lifeExpectancy = {};
    const r = computeCompensation(i, { now: FIXED_NOW });
    delete i.lifeExpectancy;
    const plain = computeCompensation(i, { now: FIXED_NOW });
    expect(r.lifeExpectancy?.tableYear).toBe(2017);
    expect(r.segments).toEqual(plain.segments);
    expect(plain).not.toHaveProperty("lifeExpectancy");
  });

  it("생명표 연도 직접 선택, 없는 연도는 거부", () => {
    const i = input();
    i.lifeExpectancy = { tableYear: 2020 };
    expect(computeCompensation(i, { now: FIXED_NOW }).lifeExpectancy?.tableYear).toBe(2020);
    i.lifeExpectancy = { tableYear: 1900 };
    expect(() => computeCompensation(i, { now: FIXED_NOW })).toThrow(/1900년 생명표/);
    i.lifeExpectancy = { tableYear: 2020.5 };
    expect(() => computeCompensation(i, { now: FIXED_NOW })).toThrow(RangeError);
  });

  it("일실퇴직금은 과실상계 전 재산상 손해에 합산", () => {
    const i = input();
    delete i.lifeExpectancy;
    i.faultRatio = 0.2;
    i.lostRetirement = { method: "direct", amountWon: 10_000_000 };
    const r = computeCompensation(i, { now: FIXED_NOW });
    expect(r.lostRetirementSubtotalWon).toBe(10_000_000);
    expect(r.pecuniaryDamagesSubtotalWon).toBe(r.lostIncomeSubtotalWon + 10_000_000);
    expect(r.faultOffset.afterWon).toBe(((r.lostIncomeSubtotalWon + 10_000_000) * 8) / 10);
  });

  it("퍼징: 여명 경계 구간 금액 = 독립 BigInt (상실률·4자리 계수·2/3)", () => {
    for (let k = 0; k < 200; k++) {
      const i = input();
      const wage = 10_000 * (5 + ((k * 37) % 25));
      const ratio100 = 100 + ((k * 7919) % 9800); // 1.00%~98.99%
      i.lostIncome = { directWageWon: wage, workingDaysPerMonth: 20 };
      i.lossRate = { permanent: [{ ratio: ratio100 / 10000 }] };
      i.lifeExpectancy = { shortening: { method: "remainingYears", years: 2 + (k % 30) } };
      const r = computeCompensation(i, { now: FIXED_NOW });
      for (const s of r.segments) {
        const ref =
          (BigInt(wage * 20) *
            BigInt(ratio100) *
            BigInt(Math.round(s.appliedHoffman * 1e4)) *
            (s.livingCostDeducted ? 2n : 1n)) /
          (100_000_000n * (s.livingCostDeducted ? 3n : 1n));
        expect(BigInt(s.amountFloorWon), `${k}`).toBe(ref);
      }
      expect(r.segments.at(-1)!.livingCostDeducted, `${k}`).toBe(true);
    }
  });

  it("퍼징: 절사 없음 경로의 공제 구간 = 독립 BigInt (상실률 12자리·8자리 계수·2/3)", () => {
    for (let k = 0; k < 200; k++) {
      const i = input();
      delete i.base.courtTruncation;
      const wage = 10_000 * (5 + ((k * 37) % 25));
      const ratio100 = 100 + ((k * 7919) % 9800);
      i.lostIncome = { directWageWon: wage, workingDaysPerMonth: 20 };
      i.lossRate = { permanent: [{ ratio: ratio100 / 10000 }] };
      i.lifeExpectancy = { shortening: { method: "remainingYears", years: 2 + (k % 30) } };
      const s = computeCompensation(i, { now: FIXED_NOW }).segments.at(-1)!;
      expect(s.livingCostDeducted).toBe(true);
      const ref =
        (BigInt(wage * 20) * BigInt(ratio100) * BigInt(Math.round(s.appliedHoffman * 1e8)) * 2n) /
        (10_000n * 100_000_000n * 3n);
      expect(BigInt(s.amountFloorWon), `${k}`).toBe(ref);
    }
  });
});
