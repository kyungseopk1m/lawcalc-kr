import { describe, expect, it } from "vitest";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";

/** C5 상속인별 유족급여 공제. 기대값은 r2a-golden-derivation-2026-10-04.md 8절 손계산. */
const FIXED_NOW = () => new Date("2026-10-04T00:00:00.000Z");

function input(
  recipients: { heirName?: string; survivorBenefitWon: number }[],
): CompensationAutoDeathInput {
  return {
    mode: "death",
    accidentType: "industrial",
    base: { birthDate: "1980-05-10", accidentDate: "2025-03-01", sex: "male" },
    lostIncome: { occupation: "보통인부" },
    funeralExpenseWon: 5000000,
    solatiumWon: 100000000,
    faultRatio: 0.3,
    industrialInsurance: { recipients },
    heirs: {
      decedent: { deceasedAt: "2025-03-01" },
      spouse: { name: "배우자", alive: true },
      linealDescendants: [{ name: "자녀", deceasedBeforeOpening: false }],
    },
  };
}

describe("유족급여 수급권자별 공제 (2008다13104 전합)", () => {
  it("수급권자 몫을 넘는 유족급여는 소멸하고 다른 상속인 몫에서 빼지 않는다", () => {
    const result = computeCompensationDeath(
      input([{ heirName: "배우자", survivorBenefitWon: 300000000 }]),
      { now: FIXED_NOW },
    );
    expect(
      result.inheritanceShares?.map((s) => [s.amountWon, s.survivorBenefitDeductedWon]),
    ).toEqual([
      [62100000, 226997341],
      [147332000, 0],
    ]);
    expect(result.finalWon).toBe(209432000);
    expect(result.industrialBenefit).toEqual({
      benefitWon: 300000000,
      deductedWon: 226997341,
      lostIncomeAfterWon: 378328903 - 226997341,
    });
  });

  it("상속인이 아닌 수급권자(이름 없음)는 어느 몫에서도 공제하지 않고, 없는 이름은 거부한다", () => {
    expect(() =>
      computeCompensationDeath(input([{ heirName: "사실혼 배우자", survivorBenefitWon: 1 }])),
    ).toThrow(/상속인 목록에 없는 이름/);
    const result = computeCompensationDeath(input([{ survivorBenefitWon: 150000000 }]), {
      now: FIXED_NOW,
    });
    expect(result.inheritanceShares?.map((s) => s.amountWon)).toEqual([220998100, 147332000]);
    expect(result.industrialBenefit?.deductedWon).toBe(0);
  });

  it("recipients 는 heirs 가 필요하고 survivorBenefitWon 과 함께 쓸 수 없다", () => {
    const noHeirs = input([{ heirName: "배우자", survivorBenefitWon: 1 }]);
    delete noHeirs.heirs;
    expect(() => computeCompensationDeath(noHeirs)).toThrow(/heirs/);
    const both = input([{ heirName: "배우자", survivorBenefitWon: 1 }]);
    both.industrialInsurance!.survivorBenefitWon = 1;
    expect(() => computeCompensationDeath(both)).toThrow(/함께/);
    expect(() =>
      computeCompensationDeath(input([{ heirName: "배우자", survivorBenefitWon: -1 }])),
    ).toThrow(/survivorBenefitWon/);
  });

  it("상속인별 한도로 실제 공제된 지급치료비와 버려진 몫, 절사 차이를 결과에 담는다", () => {
    // r2a-golden-derivation 11절 손계산. 직접 일당 150,000, 유족급여 9억(배우자), 지급치료비 6천만(× 과실 0.3).
    const c = input([{ heirName: "배우자", survivorBenefitWon: 900000000 }]);
    c.lostIncome = { directWageWon: 150000 };
    c.deductions = { paidTreatment: [{ amount: 60000000 }] };
    const result = computeCompensationDeath(c, { now: FIXED_NOW });
    expect(result.inheritanceShares?.map((s) => s.amountWon)).toEqual([60000000, 127777300]);
    expect(result.deductions).toMatchObject({
      paidTreatmentSubtotalWon: 18000000,
      propertyOnlyAppliedWon: 9300000,
      propertyOnlyDiscardedWon: 8700000,
      afterWon: 87777382,
      solatiumReducedWon: 0,
      absoluteExcessDroppedWon: 0,
      roundingWon: 82,
    });
    // 행 합 = 최종액
    const d = result.deductions;
    expect(d.afterWon + result.solatiumWon + d.absoluteExcessDroppedWon! - d.roundingWon!).toBe(
      result.finalWon,
    );
  });

  it("recipients 를 쓰면 상속인 이름이 겹치면 안 된다", () => {
    const c = input([{ heirName: "자녀", survivorBenefitWon: 1 }]);
    c.heirs!.linealDescendants = [
      { name: "자녀", deceasedBeforeOpening: false },
      { name: "자녀", deceasedBeforeOpening: false },
    ];
    expect(() => computeCompensationDeath(c)).toThrow(/이름/);
  });
});
