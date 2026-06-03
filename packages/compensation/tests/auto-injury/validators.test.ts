import { describe, expect, it } from "vitest";
import { validateCompensationInput } from "../../src/auto-injury/validators";
import type { CompensationInput } from "../../src/auto-injury/types";

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

describe("validateCompensationInput — boundary 거부", () => {
  it("accepts the baseline case-comp-001 input", () => {
    expect(() => validateCompensationInput(baseInput())).not.toThrow();
  });

  it("rejects non-ISO birthDate / accidentDate / treatmentEndDate", () => {
    const cases = [
      { ...baseInput(), base: { ...baseInput().base, birthDate: "1996/01/01" } },
      { ...baseInput(), base: { ...baseInput().base, accidentDate: "20260101" } },
      {
        ...baseInput(),
        base: { ...baseInput().base, treatmentEndDate: "2026-13-40" },
      },
    ];
    for (const input of cases) {
      expect(() => validateCompensationInput(input)).toThrow(/YYYY-MM-DD/);
    }
  });

  it("rejects accidentDate before birthDate", () => {
    const input = baseInput();
    input.base.accidentDate = "1990-01-01";
    expect(() => validateCompensationInput(input)).toThrow(/birthDate/);
  });

  it("rejects treatmentEndDate before accidentDate", () => {
    const input = baseInput();
    input.base.treatmentEndDate = "2025-12-31";
    expect(() => validateCompensationInput(input)).toThrow(/accidentDate/);
  });

  it("rejects invalid sex enum", () => {
    const input = baseInput();
    (input.base as { sex: string }).sex = "other";
    expect(() => validateCompensationInput(input)).toThrow(/male.*female/);
  });

  it("rejects retirementAge outside [1, 120] or non-integer", () => {
    for (const value of [0, 121, 1.5, -5]) {
      const input = baseInput();
      input.base.retirementAge = value;
      expect(() => validateCompensationInput(input)).toThrow(/retirementAge/);
    }
  });

  it("rejects permanent.ratio outside (0, 1]", () => {
    for (const ratio of [-0.1, 0, 1.5, Number.NaN]) {
      const input = baseInput();
      input.lossRate.permanent = [{ ratio }];
      expect(() => validateCompensationInput(input)).toThrow();
    }
  });

  it("rejects temporary entries with non-positive years", () => {
    const input = baseInput();
    input.lossRate.temporary = [{ ratio: 0.3, years: 0 }];
    expect(() => validateCompensationInput(input)).toThrow(/years/);
    input.lossRate.temporary = [{ ratio: 0.3, years: -1 }];
    expect(() => validateCompensationInput(input)).toThrow(/years/);
  });

  it("rejects missing occupation and directWageWon both", () => {
    const input = baseInput();
    input.lostIncome = { discountMethod: "hoffman" };
    expect(() => validateCompensationInput(input)).toThrow(/occupation.*directWageWon/);
  });

  it("accepts directWageWon override without occupation", () => {
    const input = baseInput();
    input.lostIncome = { directWageWon: 200000 };
    expect(() => validateCompensationInput(input)).not.toThrow();
  });

  it("rejects discountMethod other than hoffman in v0.5.0", () => {
    const input = baseInput();
    (input.lostIncome as { discountMethod: string }).discountMethod = "leibniz";
    expect(() => validateCompensationInput(input)).toThrow(/hoffman/);
  });

  it("rejects faultRatio outside [0, 1]", () => {
    for (const value of [-0.1, 1.5, Number.NaN]) {
      const input = baseInput();
      input.faultRatio = value;
      expect(() => validateCompensationInput(input)).toThrow(/faultRatio/);
    }
  });

  it("rejects negative or non-integer solatiumWon", () => {
    const input = baseInput();
    input.solatiumWon = -100;
    expect(() => validateCompensationInput(input)).toThrow(/solatiumWon/);
    input.solatiumWon = 1.5;
    expect(() => validateCompensationInput(input)).toThrow(/solatiumWon/);
  });

  it("rejects deductions.ratio[i].ratio outside [0, 1] and negative absolute.amount", () => {
    const a = baseInput();
    a.deductions = { ratio: [{ ratio: 1.5 }], absolute: [] };
    expect(() => validateCompensationInput(a)).toThrow();
    const b = baseInput();
    b.deductions = { ratio: [], absolute: [{ amount: -1 }] };
    expect(() => validateCompensationInput(b)).toThrow();
  });

  it("rejects workingDaysPerMonth outside [1, 31]", () => {
    const input = baseInput();
    input.lostIncome.workingDaysPerMonth = 0;
    expect(() => validateCompensationInput(input)).toThrow(/workingDaysPerMonth/);
    input.lostIncome.workingDaysPerMonth = 32;
    expect(() => validateCompensationInput(input)).toThrow(/workingDaysPerMonth/);
  });

  it("accepts 산재 입력 (industrial + 장해급여)", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    input.industrialInsurance = { disabilityBenefitWon: 50_000_000 };
    expect(() => validateCompensationInput(input)).not.toThrow();
  });

  it("rejects 알 수 없는 accidentType", () => {
    const input = { ...baseInput(), accidentType: "boat" } as unknown as CompensationInput;
    expect(() => validateCompensationInput(input)).toThrow(/accidentType/);
  });

  it("rejects industrialInsurance 가 자동차 모드에 지정된 경우", () => {
    const input = baseInput();
    input.industrialInsurance = { disabilityBenefitWon: 10_000_000 };
    expect(() => validateCompensationInput(input)).toThrow(/industrialInsurance/);
  });

  it("rejects 음수 장해급여", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    input.industrialInsurance = { disabilityBenefitWon: -1 };
    expect(() => validateCompensationInput(input)).toThrow(/disabilityBenefitWon/);
  });
});
