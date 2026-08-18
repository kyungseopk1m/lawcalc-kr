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

  it("case-comp-002 path: 한시 5y×20% + 영구 58% → 기간식 [0,60) 0.664 + [60,360) 0.58 → 499,170,700원", () => {
    const input = baseInput();
    input.lossRate.permanent = [{ department: "신장내과", ratio: 0.58 }];
    input.lossRate.temporary = [{ department: "정형외과", ratio: 0.2, years: 5 }];
    const result = computeCompensation(input, { now: FIXED_NOW });
    // combinedLossRate = 첫 segment(한시기간) 최고율 = 1-(1-0.58)(1-0.20) = 0.664
    expect(result.combinedLossRate).toBeCloseTo(0.664, 6);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.startMonth).toBe(0);
    expect(result.segments[0]!.endMonth).toBe(60);
    expect(result.segments[0]!.lossRate).toBeCloseTo(0.664, 6);
    expect(result.segments[1]!.startMonth).toBe(60);
    expect(result.segments[1]!.endMonth).toBe(360);
    expect(result.segments[1]!.lossRate).toBeCloseTo(0.58, 6);
    expect(result.lostIncomeSubtotalWon).toBe(499170732);
    expect(result.finalWon).toBe(499170700);
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

  it("case-comp-005 path: 한시 5y×30% 단독 + 영구 0% → 기간식 [0,60) raw 0.30 + [60,360) 0 → 60,705,600원", () => {
    const input = baseInput();
    input.lossRate.permanent = [];
    input.lossRate.temporary = [{ department: "정형외과", ratio: 0.3, years: 5 }];
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]!.startMonth).toBe(0);
    expect(result.segments[0]!.endMonth).toBe(60);
    // 환산 없이 raw 0.30 적용 (종전 /10 환산 0.15 는 50% 과소)
    expect(result.segments[0]!.lossRate).toBeCloseTo(0.3, 6);
    expect(result.segments[1]!.startMonth).toBe(60);
    expect(result.segments[1]!.endMonth).toBe(360);
    expect(result.segments[1]!.lossRate).toBe(0);
    expect(result.segments[0]!.amountFloorWon).toBe(60705626);
    expect(result.segments[1]!.amountFloorWon).toBe(0);
    expect(result.lostIncomeSubtotalWon).toBe(60705626);
    expect(result.finalWon).toBe(60705600);
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

  /**
   * 기왕증 기여도.
   *
   * UI 입력란과 validator 는 있는데 compute 가 이 값을 읽지 않아, 값을 넣어도 결과가
   * 그대로였다. 같은 앱의 기타손해는 `× (1 - priorRatio)` 로 반영하고 있었으므로
   * 사용자는 "기왕증은 반영된다"고 학습한 상태에서 조용히 과대한 금액을 받았다.
   */
  describe("기왕증 기여도", () => {
    const withPrior = (ratio: number) => {
      const input = baseInput();
      input.lossRate.priorImpairmentRatio = ratio;
      return computeCompensation(input, { now: FIXED_NOW });
    };

    it("기여도만큼 상실률에서 공제된다", () => {
      const base = withPrior(0);
      const prior40 = withPrior(0.4);
      expect(prior40.combinedLossRate).toBeCloseTo(0.3 * 0.6, 6);
      expect(prior40.finalWon).toBeLessThan(base.finalWon);
    });

    it("일실수입이 (1 - 기여도) 에 비례한다", () => {
      // 영구 30% 단일 segment 라 일실수입은 상실률에 정비례한다.
      const base = withPrior(0).lostIncomeSubtotalWon;
      const prior40 = withPrior(0.4).lostIncomeSubtotalWon;
      expect(prior40).toBeCloseTo(base * 0.6, -1);
    });

    it("미입력·0 이면 결과가 완전히 동일하다 (회귀 0)", () => {
      const omitted = computeCompensation(baseInput(), { now: FIXED_NOW });
      expect(withPrior(0).finalWon).toBe(omitted.finalWon);
      expect(withPrior(0).combinedLossRate).toBe(omitted.combinedLossRate);
    });

    it("기여도 100% 면 일실수입이 0 이 된다", () => {
      expect(withPrior(1).lostIncomeSubtotalWon).toBe(0);
    });
  });

  /**
   * 호프만표 coverage(480개월) 초과.
   *
   * 사고 당시 만 25세 미만이거나 가동연한을 65세보다 높게 잡으면 조회 월수가 480 을
   * 넘어 `getHoffmanAt` 이 RangeError 를 던졌다. 미성년자·영유아 사건이 전부 계산
   * 불능이었다. 단리 현가율은 414개월에서 이미 240 한도에 걸리므로(대법원 1992. 7. 10.
   * 선고 92다15871) coverage clamp 는 금액을 바꾸지 않는다.
   */
  describe("호프만표 coverage 초과 (만 25세 미만)", () => {
    const cases: Array<[string, string, number]> = [
      ["만 25세 정확 — 480개월 경계", "2001-01-01", 65],
      ["만 24세 — 492개월", "2002-01-01", 65],
      ["만 10세 — 660개월", "2016-01-01", 65],
      ["사고일 출생 — 780개월", "2026-01-01", 65],
      ["만 40세 + 가동연한 85세 — 540개월", "1986-01-01", 85],
    ];

    for (const [label, birthDate, retirementAge] of cases) {
      it(`${label} → 계산되고 적용 현가율은 240 한도`, () => {
        const input = baseInput();
        input.base.birthDate = birthDate;
        input.base.retirementAge = retirementAge;
        input.lossRate.permanent = [{ department: "정형외과", ratio: 1 }];
        const result = computeCompensation(input, { now: FIXED_NOW });
        const applied = result.hoffman240Cap.appliedHoffman.reduce((a, v) => a + v, 0);
        expect(applied).toBeLessThanOrEqual(240);
        expect(result.finalWon).toBeGreaterThan(0);
      });
    }

    it("480개월 초과 사건의 금액은 240 한도에서 수렴한다 (24세와 10세가 같은 금액)", () => {
      const at = (birthDate: string) => {
        const input = baseInput();
        input.base.birthDate = birthDate;
        input.base.retirementAge = 65;
        input.lossRate.permanent = [{ department: "정형외과", ratio: 1 }];
        return computeCompensation(input, { now: FIXED_NOW }).finalWon;
      };
      // 둘 다 240 한도에 걸리므로 월급여가 같으면 일실수입도 같다.
      expect(at("2002-01-01")).toBe(at("2016-01-01"));
    });
  });

  // 사고일에 가동연한이 이미 지난 사건도 위자료·치료비·개호비는 인정되므로 계산을
  // 거부하지 않는다. 일실수입만 0 이 된다 (이전에는 전체가 RangeError 였다).
  it("가동연한 경과 → 일실수입 0, 나머지 항목은 정상 계산", () => {
    const input = baseInput();
    input.base.birthDate = "1990-01-01";
    input.base.accidentDate = "2026-01-01";
    input.base.retirementAge = 30;
    input.solatiumWon = 50_000_000;
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments).toHaveLength(0);
    expect(result.lostIncomeSubtotalWon).toBe(0);
    // 영구장해 30% 는 일실수입이 없어도 상실률 자체로는 유지된다.
    expect(result.combinedLossRate).toBeCloseTo(0.3, 6);
    expect(result.finalWon).toBe(50_000_000);
  });

  // 일실수입 기간이 없으면 단가는 결과에 쓰이지 않으므로, 노임단가 dataset 이 덮지 않는
  // 과거 사고일이어도 위자료만으로 계산이 진행되어야 한다.
  it("가동연한 경과 + 노임단가 조회 불가 사고일이어도 위자료만으로 계산된다", () => {
    const input = baseInput();
    input.base.birthDate = "1900-01-01";
    input.base.accidentDate = "1990-01-01";
    input.solatiumWon = 30_000_000;
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.segments).toHaveLength(0);
    expect(result.lostIncomeSubtotalWon).toBe(0);
    expect(result.finalWon).toBe(30_000_000);
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

  // 외부 대조 (oracle: manual-worked-example) — 공개 계산프로그램 매뉴얼의 기본 예시 수치.
  // 매뉴얼: 신장내과 개별수치 58% + 기왕증 50% (사전 반영 58→29) + 안과 13% + 치과 1.06%
  // → 중복장해 38.88% 자동 표시. combinedLossRate = 1 - Π(1 - r_i) 가 이 표시값을 재현한다.
  // (기왕증 기여도 39.09%·지급치료비 공제 2,553,120원은 본 엔진이 산출하지 않는 개념이라 대조 범위 밖.)
  it("combinedLossRate matches manual worked example (신장내과 29% + 안과 13% + 치과 1.06% → 38.88%)", () => {
    const input = baseInput();
    input.lossRate.permanent = [
      { department: "신장내과", ratio: 0.29 },
      { department: "안과", ratio: 0.13 },
      { department: "치과", ratio: 0.0106 },
    ];
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.combinedLossRate).toBeCloseTo(1 - 0.71 * 0.87 * 0.9894, 10);
    // 매뉴얼 표시 소수 둘째자리 = 38.88%
    expect(Math.round(result.combinedLossRate * 10000) / 100).toBe(38.88);
  });
});

describe("computeCompensation — 산재(산×부상) 장해급여 공제 (2021다241618 전합, 공제 후 과실상계)", () => {
  it("case-comp-010 path: 장해급여 5천만 선공제(일실수입 한도) 후 과실 20% → 159,519,900원", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    input.faultRatio = 0.2;
    input.industrialInsurance = { disabilityBenefitWon: 50_000_000 };
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.accidentType).toBe("industrial");
    // (249,399,909 − 50,000,000) × 0.8 = floor(159,519,927.2)
    expect(result.industrialBenefit).toEqual({
      benefitWon: 50_000_000,
      deductedWon: 50_000_000,
      lostIncomeAfterWon: 199_399_909,
    });
    expect(result.pecuniaryDamagesSubtotalWon).toBe(199_399_909);
    expect(result.faultOffset.afterWon).toBe(159519927);
    expect(result.deductions.industrialBenefitWon).toBeUndefined();
    expect(result.deductions.afterWon).toBe(159519927);
    expect(result.finalWon).toBe(159519900);
  });

  it("장해급여가 일실수입을 초과하면 일실수입 한도로만 공제 — 위자료는 잠식하지 않는다", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    input.solatiumWon = 5_000_000;
    input.industrialInsurance = { disabilityBenefitWon: 999_999_999_999 };
    const result = computeCompensation(input, { now: FIXED_NOW });
    // deducted = min(급여, 일실수입 249,399,909). 위자료 5,000,000 은 그대로 (과실 0).
    expect(result.industrialBenefit).toEqual({
      benefitWon: 999_999_999_999,
      deductedWon: 249_399_909,
      lostIncomeAfterWon: 0,
    });
    expect(result.pecuniaryDamagesSubtotalWon).toBe(5_000_000);
    expect(result.finalWon).toBe(5_000_000);
  });

  it("산재인데 장해급여 미지정 → 0원 공제 (default), 자동차 최종액과 동일", () => {
    const input = baseInput();
    input.accidentType = "industrial";
    const result = computeCompensation(input, { now: FIXED_NOW });
    expect(result.accidentType).toBe("industrial");
    expect(result.industrialBenefit).toEqual({
      benefitWon: 0,
      deductedWon: 0,
      lostIncomeAfterWon: 249_399_909,
    });
    expect(result.finalWon).toBe(249399900);
  });

  it("accidentType 미지정(자동차) → 결과에 accidentType·industrialBenefit 키 생략 (회귀 0)", () => {
    const result = computeCompensation(baseInput(), { now: FIXED_NOW });
    expect(result.accidentType).toBeUndefined();
    expect(result.industrialBenefit).toBeUndefined();
    expect(result.deductions.industrialBenefitWon).toBeUndefined();
    expect(result.finalWon).toBe(249399900);
  });
});
