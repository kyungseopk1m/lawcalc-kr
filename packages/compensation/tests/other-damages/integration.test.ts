import { describe, expect, it } from "vitest";

import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";

const NOW = () => new Date("2026-06-03T00:00:00.000Z");

const injuryBase: CompensationInput = {
  base: {
    birthDate: "1996-01-01",
    accidentDate: "2026-01-01",
    treatmentEndDate: "2026-01-01",
    sex: "male",
    retirementAge: 60,
  },
  lossRate: { permanent: [{ ratio: 0.3 }] },
  lostIncome: { directWageWon: 100000 },
};

const deathBase: CompensationAutoDeathInput = {
  mode: "death",
  base: { birthDate: "1996-01-01", accidentDate: "2026-01-01", sex: "male", retirementAge: 65 },
  lostIncome: { directWageWon: 100000 },
};

describe("injury × 기타손해 통합", () => {
  it("기타손해 미지정 → 결과에 otherDamages 키 생략 (회귀 0)", () => {
    const r = computeCompensation(injuryBase, { now: NOW });
    expect(r).not.toHaveProperty("otherDamagesSubtotalWon");
    expect(r).not.toHaveProperty("otherDamages");
    // pecuniary = lostIncome + solatium(0)
    expect(r.pecuniaryDamagesSubtotalWon).toBe(r.lostIncomeSubtotalWon);
  });

  it("빈 otherDamages {} 도 엔진이 키 생략 (회귀 0 = 엔진 계약, UI 의존 아님)", () => {
    const r = computeCompensation({ ...injuryBase, otherDamages: {} }, { now: NOW });
    expect(r).not.toHaveProperty("otherDamagesSubtotalWon");
    expect(r).not.toHaveProperty("otherDamages");
    expect(r.pecuniaryDamagesSubtotalWon).toBe(r.lostIncomeSubtotalWon);
  });

  it("기타손해 지정 → 재산상 손해 pool 에 과실상계 전 합산", () => {
    const withOther = computeCompensation(
      {
        ...injuryBase,
        otherDamages: { treatment: { past: [{ costWon: 5000000 }] } },
      },
      { now: NOW },
    );
    expect(withOther.otherDamagesSubtotalWon).toBe(5000000);
    expect(withOther.otherDamages?.treatmentWon).toBe(5000000);
    // pecuniary = 일실수입 + 기타손해 + 위자료(0)
    expect(withOther.pecuniaryDamagesSubtotalWon).toBe(withOther.lostIncomeSubtotalWon + 5000000);
  });

  it("기타손해가 과실상계 대상에 포함된다 (과실상계 전 합산)", () => {
    const r = computeCompensation(
      {
        ...injuryBase,
        faultRatio: 0.5,
        otherDamages: { treatment: { past: [{ costWon: 10000000 }] } },
      },
      { now: NOW },
    );
    // faultAfter = floor((일실수입 + 1천만) × 0.5)
    expect(r.faultOffset.afterWon).toBe(Math.floor((r.lostIncomeSubtotalWon + 10000000) * 0.5));
  });
});

describe("death × 기타손해 통합", () => {
  it("기타손해 미지정 → 키 생략 (회귀 0)", () => {
    const r = computeCompensationDeath(deathBase, { now: NOW });
    expect(r).not.toHaveProperty("otherDamagesSubtotalWon");
    expect(r).not.toHaveProperty("otherDamages");
  });

  it("기타손해는 과실상계 전, 장례비는 과실상계 후 (위치 구분)", () => {
    const r = computeCompensationDeath(
      {
        ...deathBase,
        funeralExpenseWon: 5000000,
        faultRatio: 0.2,
        otherDamages: { treatment: { past: [{ costWon: 10000000 }] } },
      },
      { now: NOW },
    );
    // 기타손해는 pecuniary 에 포함 → 과실상계 적용 대상.
    expect(r.pecuniaryDamagesSubtotalWon).toBe(r.lostIncomeSubtotalWon + 10000000);
    expect(r.faultOffset.afterWon).toBe(Math.floor((r.lostIncomeSubtotalWon + 10000000) * 0.8));
    // 장례비는 과실상계 후 가산.
    expect(r.deductions.afterWon).toBe(r.faultOffset.afterWon + 5000000);
  });

  it("기타손해 포함 finalWon 이 상속분배 합과 일치 (round-trip)", () => {
    const r = computeCompensationDeath(
      {
        ...deathBase,
        otherDamages: { attendantCare: { past: [{ directDailyWageWon: 100000, totalDays: 100 }] } },
        heirs: {
          decedent: { deceasedAt: "2026-01-01" },
          spouse: { name: "배우자", alive: true },
          linealDescendants: [{ name: "자녀", deceasedBeforeOpening: false }],
        },
      },
      { now: NOW },
    );
    const sum = (r.inheritanceShares ?? []).reduce((acc, s) => acc + s.amountWon, 0);
    expect(sum).toBe(r.finalWon);
    expect(r.otherDamages?.attendantCareWon).toBe(10000000);
  });
});
