import { describe, expect, it } from "vitest";
import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";
import { floorTimesComplements, sumCourtDeductions } from "../../src/internal";

/**
 * C8 공제 종류. 기대값은 r2a-golden-derivation-2026-10-04.md 9절 손계산.
 * 일실수입이 0 이 되도록 가동연한이 지난 피해자로 두고, 재산상 손해는 기왕치료비로만 만든다.
 */
const FIXED_NOW = () => new Date("2026-10-04T00:00:00.000Z");

function input(treatmentWon: number, faultRatio: number, priorRatio: number): CompensationInput {
  return {
    base: {
      birthDate: "1950-01-01",
      accidentDate: "2026-01-01",
      treatmentEndDate: "2026-01-01",
      sex: "male",
    },
    lossRate: { permanent: [{ ratio: 0.3 }], priorImpairmentRatio: priorRatio },
    lostIncome: { occupation: "보통인부" },
    otherDamages: { treatment: { past: [{ costWon: treatmentWon }] } },
    faultRatio,
  };
}

describe("공제 종류 (지급치료비·비율공제·전액공제)", () => {
  it("법원 프로그램 예시 BIN0065·0066·0070: 공제 5,106,240, 합계 534,289,430", () => {
    const c = input(741993815, 0.3, 0.3616);
    c.solatiumWon = 20000000;
    c.deductions = {
      paidTreatment: [{ label: "지급치료비", amount: 1000000 }],
      absolute: [
        { label: "선급금", amount: 2000000 },
        { label: "기타공제2", amount: 2000000 },
      ],
      ratio: [{ label: "기타공제1", amount: 1000000 }],
    };
    const result = computeCompensation(c, { now: FIXED_NOW });
    expect(result.faultOffset.afterWon).toBe(519395670);
    expect(result.deductions.paidTreatmentSubtotalWon).toBe(553120);
    expect(result.deductions.ratioSubtotalWon).toBe(553120);
    expect(result.deductions.absoluteSubtotalWon).toBe(4000000);
    expect(result.faultOffset.afterWon - result.deductions.afterWon).toBe(5106240);
    expect(result.deductions.afterWon + result.solatiumWon).toBe(534289430);
    expect(result.finalWon).toBe(534289400);
  });

  it("지급치료비는 재산상 손해 한도에서만 빠지고 위자료를 잠식하지 않는다", () => {
    const c = input(1000000, 0.5, 0);
    c.solatiumWon = 10000000;
    c.deductions = { paidTreatment: [{ amount: 2000000 }] };
    const result = computeCompensation(c, { now: FIXED_NOW });
    expect(result.deductions.paidTreatmentSubtotalWon).toBe(1000000);
    expect(result.deductions.afterWon).toBe(0);
    expect(result.finalWon).toBe(10000000);
  });

  it("전액공제(선급금)가 재산상 손해를 넘으면 초과분은 위자료에서 뺀다", () => {
    const c = input(1000000, 0.5, 0);
    c.solatiumWon = 10000000;
    c.deductions = { absolute: [{ amount: 2000000 }] };
    const result = computeCompensation(c, { now: FIXED_NOW });
    expect(result.deductions.afterWon).toBe(-1500000);
    expect(result.finalWon).toBe(8500000);
  });

  it("지급치료비와 전액공제가 함께 재산상 손해를 넘으면: 지급치료비는 한도까지, 전액공제는 위자료까지", () => {
    // 과실상계 후 재산상 손해 500,000. 지급치료비 2,000,000 × 0.5 = 1,000,000 → 한도 500,000 만 공제.
    // 이어서 선급금 400,000 은 그대로 빠져 -400,000, 위자료 10,000,000 에서 차감 → 9,600,000.
    const c = input(1000000, 0.5, 0);
    c.solatiumWon = 10000000;
    c.deductions = { paidTreatment: [{ amount: 2000000 }], absolute: [{ amount: 400000 }] };
    const result = computeCompensation(c, { now: FIXED_NOW });
    expect(result.deductions.paidTreatmentSubtotalWon).toBe(1000000);
    expect(result.deductions.afterWon).toBe(-400000);
    expect(result.finalWon).toBe(9600000);
  });

  it("구 ratio 모양(비율) 입력은 legacyRatio 로 옮기라고 거부한다", () => {
    const c = input(1000000, 0.5, 0);
    (c.deductions as unknown) = { ratio: [{ ratio: 0.1 }] };
    expect(() => computeCompensation(c)).toThrow(/legacyRatio/);
  });
});

describe("비율 곱셈 원 미만 절사는 정수로 정확히", () => {
  for (const fault of [0.1, 0.2, 0.35, 0.45, 0.7]) {
    it(`과실 ${fault * 100}%: 지급치료비 1,000,000 → ${Math.round(fault * 1000000)}`, () => {
      expect(sumCourtDeductions([{ amount: 1000000 }], 0, fault)).toBe(Math.round(fault * 1000000));
      // 과실상계도 같은 규칙: 1,000,000 × (1 - 과실)
      expect(floorTimesComplements(1000000, [fault])).toBe(Math.round((1 - fault) * 1000000));
    });
  }

  it("비율은 유효숫자 15자리 십진값으로 (과실 1/3, 화면의 x/100 비율, 지수 표기)", () => {
    expect(floorTimesComplements(300000000, [1 / 3])).toBe(200000000);
    expect(floorTimesComplements(1000000000, [1 / 3])).toBe(666666666);
    // 화면은 "38.88"·"0.07" 을 Number(x) / 100 으로 넘긴다 (0.38880000000000003, 0.0007000000000000001).
    expect(sumCourtDeductions([{ amount: 1000000 }], 0, Number("38.88") / 100)).toBe(388800);
    expect(floorTimesComplements(1000000, [Number("0.07") / 100])).toBe(999300);
    expect(floorTimesComplements(10000000, [1e-7])).toBe(9999999);

    const fault = input(1000000000, 1 / 3, 0);
    expect(computeCompensation(fault, { now: FIXED_NOW }).faultOffset.afterWon).toBe(666666666);
  });

  it("구 비율공제는 종전 실수식 floor(과실상계 후 × Σ ratio) 그대로 (구 파일 금액 유지)", () => {
    const legacy = input(3000000000, 0, 0);
    legacy.deductions = { legacyRatio: [{ ratio: 1 / 3 }] };
    // 3,000,000,000 × 0.3333333333333333 는 실수 곱에서 1,000,000,000 이 된다.
    expect(computeCompensation(legacy, { now: FIXED_NOW }).deductions.legacyRatioSubtotalWon).toBe(
      1000000000,
    );
  });

  it("엔진 경로: 과실 10% 지급치료비 1,000,000 → 100,000 공제", () => {
    const c = input(10000000, 0.1, 0);
    c.deductions = { paidTreatment: [{ amount: 1000000 }] };
    expect(computeCompensation(c, { now: FIXED_NOW }).deductions.paidTreatmentSubtotalWon).toBe(
      100000,
    );
  });

  it("기왕치료비 기왕증 92%: 1,000,000 → 80,000 (실수 곱셈이면 79,999)", () => {
    const c = input(1000000, 0, 0);
    c.otherDamages = { treatment: { past: [{ costWon: 1000000, priorRatio: 0.92 }] } };
    expect(computeCompensation(c, { now: FIXED_NOW }).otherDamages?.treatment?.pastWon).toBe(80000);
  });
});
