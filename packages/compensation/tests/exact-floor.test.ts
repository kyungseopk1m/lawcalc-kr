import { describe, expect, it } from "vitest";
import { computeCompensation } from "../src/auto-injury/compute";
import { computeCompensationDeath } from "../src/auto-death/compute";
import type { CompensationInput } from "../src/auto-injury/types";
import type { CompensationAutoDeathInput } from "../src/auto-death/types";

const FIXED_NOW = () => new Date("2026-10-25T00:00:00.000Z");

/** 1980-01-01 남, 사고 2010-01-01, 가동 65세 = 420개월 (호프만 240 한도). 절사 옵션 없음(기본 경로). */
function death(livingCostDeductionRatio: number): CompensationAutoDeathInput {
  return {
    mode: "death",
    base: { birthDate: "1980-01-01", accidentDate: "2010-01-01", sex: "male", retirementAge: 65 },
    lostIncome: { directWageWon: 68_965, workingDaysPerMonth: 22 },
    livingCostDeductionRatio,
    funeralExpenseWon: 0,
    faultRatio: 0,
  };
}

function injury(ratios: number[], wage: number, priorImpairmentRatio = 0): CompensationInput {
  return {
    base: {
      birthDate: "1980-01-01",
      accidentDate: "2010-01-01",
      treatmentEndDate: "2010-01-01",
      sex: "male",
      retirementAge: 65,
    },
    lossRate: {
      permanent: ratios.map((ratio) => ({ ratio })),
      hospitalizationFullLoss: false,
      priorImpairmentRatio,
    },
    lostIncome: { directWageWon: wage, workingDaysPerMonth: 20 },
  };
}

/** 누적 계수(소수 8자리) → 1e8 배 정수. 엔진의 십진 변환과 독립 경로. */
const hoffman8 = (h: number) => BigInt(Math.round(h * 1e8));

describe("절사 없는 기본 경로의 정확한 원 미만 절사", () => {
  it("사망 생계비 0.3: 1,517,230 × 240 × 7/10 = 254,894,640 (실수 곱은 254,894,639)", () => {
    const r = computeCompensationDeath(death(0.3), { now: FIXED_NOW });
    expect(r.segments[0]!.appliedHoffman).toBe(240);
    expect(r.lostIncomeSubtotalWon).toBe(254_894_640);
  });

  it("부상 영구장해 0.42 하나: 3,128,900 × 0.42 × 240 = 315,393,120 (실수 곱은 315,393,119)", () => {
    const r = computeCompensation(injury([0.42], 156_445), { now: FIXED_NOW });
    expect(r.segments[0]!.monthlyWageWon).toBe(3_128_900);
    expect(r.segments[0]!.appliedHoffman).toBe(240);
    expect(r.lostIncomeSubtotalWon).toBe(315_393_120);
  });

  it("무작위 입력: 구간 금액이 독립 BigInt 기준값과 원 단위로 같다", () => {
    let seed = 20261025;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    for (let i = 0; i < 400; i++) {
      const wage = 10_000 + rand(300_000);
      const age = 31 + rand(40);
      // 부상: 장해율·기왕증은 만분율 정수(소수 4자리)로 뽑는다.
      const bp = Array.from({ length: 1 + rand(3) }, () => 1 + rand(9999));
      const priorBp = rand(5) === 0 ? rand(5000) : 0;
      const input = injury(
        bp.map((b) => b / 10000),
        wage,
        priorBp / 10000,
      );
      input.base.retirementAge = age;
      const r = computeCompensation(input, { now: FIXED_NOW });
      const keep = bp.reduce((acc, b) => acc * BigInt(10000 - b), 1n);
      const den = 10000n ** BigInt(bp.length);
      for (const s of r.segments) {
        const want =
          (BigInt(s.monthlyWageWon) *
            (den - keep) *
            BigInt(10000 - priorBp) *
            hoffman8(s.appliedHoffman)) /
          (den * 10000n * 100000000n);
        expect(s.amountFloorWon, `injury #${i}`).toBe(Number(want));
      }
      // 사망: 생계비 1/3 은 정확히 2/3, 그 밖은 백분율 정수.
      const livingPct = [25, 30, 40, 50][rand(4)]!;
      const third = rand(3) === 0;
      const d = death(third ? 1 / 3 : livingPct / 100);
      d.base.retirementAge = age;
      d.lostIncome = { directWageWon: wage, workingDaysPerMonth: 22 };
      const rd = computeCompensationDeath(d, { now: FIXED_NOW });
      const [kn, kd] = third ? [2n, 3n] : [BigInt(100 - livingPct), 100n];
      for (const s of rd.segments) {
        const want =
          (BigInt(s.monthlyWageWon) * hoffman8(s.appliedHoffman) * kn) / (100000000n * kd);
        expect(s.amountFloorWon, `death #${i}`).toBe(Number(want));
      }
    }
  });
});
