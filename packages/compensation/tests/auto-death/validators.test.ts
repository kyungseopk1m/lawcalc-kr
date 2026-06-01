import { describe, expect, it } from "vitest";
import { validateCompensationDeathInput } from "../../src/auto-death/validators";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";

function valid(): CompensationAutoDeathInput {
  return {
    mode: "death",
    base: {
      birthDate: "1996-01-01",
      accidentDate: "2026-01-01",
      sex: "male",
      retirementAge: 65,
    },
    lostIncome: { occupation: "보통인부" },
  };
}

describe("validateCompensationDeathInput", () => {
  it("정상 입력은 통과", () => {
    expect(() => validateCompensationDeathInput(valid())).not.toThrow();
  });

  it("mode 가 death 아니면 거부", () => {
    const input = { ...valid(), mode: "injury" } as unknown as CompensationAutoDeathInput;
    expect(() => validateCompensationDeathInput(input)).toThrow(/mode/);
  });

  it("사고일 < 생년월일 거부", () => {
    const input = valid();
    input.base.accidentDate = "1990-01-01";
    expect(() => validateCompensationDeathInput(input)).toThrow(/accidentDate/);
  });

  it("occupation/directWageWon 둘 다 없으면 거부", () => {
    const input = valid();
    input.lostIncome = {};
    expect(() => validateCompensationDeathInput(input)).toThrow(/lostIncome/);
  });

  it("livingCostDeductionRatio 범위 밖(>1) 거부", () => {
    const input = valid();
    input.livingCostDeductionRatio = 1.5;
    expect(() => validateCompensationDeathInput(input)).toThrow(/livingCostDeductionRatio/);
  });

  it("funeralExpenseWon 음수 거부", () => {
    const input = valid();
    input.funeralExpenseWon = -1;
    expect(() => validateCompensationDeathInput(input)).toThrow(/funeralExpenseWon/);
  });

  it("heirs 1991 이전 사망은 inheritance 검증 전파(RangeError)", () => {
    const input = valid();
    input.heirs = {
      decedent: { deceasedAt: "1990-12-31" },
      spouse: { name: "배우자", alive: true },
    };
    expect(() => validateCompensationDeathInput(input)).toThrow(RangeError);
  });

  it("heirs 상속인 없음은 inheritance 검증 전파", () => {
    const input = valid();
    input.heirs = { decedent: { deceasedAt: "2026-01-01" } };
    expect(() => validateCompensationDeathInput(input)).toThrow(/상속인/);
  });
});
