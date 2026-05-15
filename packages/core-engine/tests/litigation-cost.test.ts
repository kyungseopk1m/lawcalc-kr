import { describe, expect, it } from "vitest";

import {
  applyLawyerFeeDiscounts,
  appliedDomains,
  CASE_TYPE_META,
  caseCode,
  caseNameKo,
  isCaseType,
  isCivilOrFamily,
  KOREA_LEGAL_AID_DEFAULT_RATE,
  LAWYER_FEE_MULTIPLIER_MAX,
  LAWYER_FEE_MULTIPLIER_MIN,
  lawyerFeeDiscountMultiplier,
  listCaseTypes,
  validateDeliveryFeeInput,
  validateKoreaLegalAidDiscountScope,
  validateLawyerFeeInput,
  validateStampDutyInput,
  type CaseType,
  type LawyerFeeDiscount,
} from "../src";

describe("litigation-cost / CaseType meta", () => {
  it("CASE_TYPE_META covers exactly 13 variants (옵션 C)", () => {
    expect(Object.keys(CASE_TYPE_META)).toHaveLength(13);
  });

  it("caseCode returns 정본 부호 for each variant", () => {
    expect(caseCode("civilFirstInstanceCollegial")).toBe("가합");
    expect(caseCode("civilFirstInstanceSingle")).toBe("가단");
    expect(caseCode("civilSmallClaims")).toBe("가소");
    expect(caseCode("civilAppeal")).toBe("나");
    expect(caseCode("civilSupremeAppeal")).toBe("다");
    expect(caseCode("civilInterlocutoryAppeal")).toBe("라/마");
    expect(caseCode("civilMediation")).toBe("머");
    expect(caseCode("familyFirstInstanceCollegial")).toBe("드합");
    expect(caseCode("familyFirstInstanceSingle")).toBe("드단");
    expect(caseCode("administrativeFirstInstance")).toBe("구");
    expect(caseCode("provisionalMeasureCollegial")).toBe("카합");
    expect(caseCode("provisionalMeasureSingle")).toBe("카단");
    expect(caseCode("paymentOrder")).toBe("차");
  });

  it("caseNameKo returns 정본 사건명 for each variant", () => {
    expect(caseNameKo("civilFirstInstanceCollegial")).toBe("민사1심합의사건");
    expect(caseNameKo("paymentOrder")).toBe("독촉사건 (지급명령)");
    expect(caseNameKo("administrativeFirstInstance")).toBe("행정1심사건");
  });

  it("appliedDomains: paymentOrder skips lawyerFee", () => {
    expect(appliedDomains("paymentOrder")).toEqual(["stampDuty", "deliveryFee"]);
  });

  it("appliedDomains: 본안 사건은 3 도메인 모두", () => {
    expect(appliedDomains("civilFirstInstanceCollegial")).toEqual([
      "stampDuty",
      "deliveryFee",
      "lawyerFee",
    ]);
    expect(appliedDomains("familyFirstInstanceSingle")).toEqual([
      "stampDuty",
      "deliveryFee",
      "lawyerFee",
    ]);
  });

  it("isCivilOrFamily: 민사·가사 only true (행정·보전·지급명령은 false)", () => {
    expect(isCivilOrFamily("civilFirstInstanceCollegial")).toBe(true);
    expect(isCivilOrFamily("familyFirstInstanceSingle")).toBe(true);
    expect(isCivilOrFamily("administrativeFirstInstance")).toBe(false);
    expect(isCivilOrFamily("provisionalMeasureCollegial")).toBe(false);
    expect(isCivilOrFamily("paymentOrder")).toBe(false);
  });

  it("isCaseType type guard", () => {
    expect(isCaseType("civilFirstInstanceCollegial")).toBe(true);
    expect(isCaseType("unknown")).toBe(false);
    expect(isCaseType(123)).toBe(false);
    expect(isCaseType(null)).toBe(false);
    expect(isCaseType(undefined)).toBe(false);
  });

  it("listCaseTypes returns all 13 entries with meta", () => {
    const list = listCaseTypes();
    expect(list).toHaveLength(13);
    const head = list[0]!;
    expect(head).toHaveProperty("caseType");
    expect(head).toHaveProperty("meta");
    expect(head.meta).toHaveProperty("code");
    expect(head.meta).toHaveProperty("nameKo");
  });
});

describe("litigation-cost / lawyerFeeDiscountMultiplier", () => {
  it("noOralHearingOrAdmission → 0.5 (4 reason 모두)", () => {
    const reasons = [
      "admission",
      "defaultAdmission",
      "noOralHearing",
      "orderForPerformance",
    ] as const;
    for (const reason of reasons) {
      expect(
        lawyerFeeDiscountMultiplier({ kind: "noOralHearingOrAdmission", reason }, 1_000_000),
      ).toBe(0.5);
    }
  });

  it("provisionalCase → hasOralHearing 분기 (true=1.0, false=0.5)", () => {
    expect(
      lawyerFeeDiscountMultiplier({ kind: "provisionalCase", hasOralHearing: false }, 1_000_000),
    ).toBe(0.5);
    expect(
      lawyerFeeDiscountMultiplier({ kind: "provisionalCase", hasOralHearing: true }, 1_000_000),
    ).toBe(1.0);
  });

  it("koreaLegalAid → 0.42 default (koreaLegalAidAgreedFeeWon 미지정 시)", () => {
    expect(lawyerFeeDiscountMultiplier({ kind: "koreaLegalAid" }, 1_000_000)).toBe(
      KOREA_LEGAL_AID_DEFAULT_RATE,
    );
    expect(KOREA_LEGAL_AID_DEFAULT_RATE).toBe(0.42);
  });

  it("koreaLegalAid → koreaLegalAidAgreedFeeWon < baseFeeWon 시 비율 사용", () => {
    expect(lawyerFeeDiscountMultiplier({ kind: "koreaLegalAid" }, 1_000_000, 500_000)).toBe(0.5);
    expect(lawyerFeeDiscountMultiplier({ kind: "koreaLegalAid" }, 1_000_000, 200_000)).toBe(0.2);
  });

  it("koreaLegalAid → koreaLegalAidAgreedFeeWon >= baseFeeWon 시 1.0 (cap 미작용)", () => {
    expect(lawyerFeeDiscountMultiplier({ kind: "koreaLegalAid" }, 1_000_000, 2_000_000)).toBe(1.0);
    expect(lawyerFeeDiscountMultiplier({ kind: "koreaLegalAid" }, 1_000_000, 1_000_000)).toBe(1.0);
  });

  it("courtDiscretion → multiplier 그대로", () => {
    expect(
      lawyerFeeDiscountMultiplier({ kind: "courtDiscretion", multiplier: 0.7 }, 1_000_000),
    ).toBe(0.7);
    expect(
      lawyerFeeDiscountMultiplier({ kind: "courtDiscretion", multiplier: 1.5 }, 1_000_000),
    ).toBe(1.5);
  });

  it("customPercent → rate 그대로", () => {
    expect(lawyerFeeDiscountMultiplier({ kind: "customPercent", rate: 0.3 }, 1_000_000)).toBe(0.3);
  });
});

describe("litigation-cost / applyLawyerFeeDiscounts", () => {
  it("빈 discounts → multiplier 1.0", () => {
    const r = applyLawyerFeeDiscounts(10_000_000, []);
    expect(r.multiplier).toBe(1.0);
    expect(r.amountWon).toBe(10_000_000);
    expect(r.clamped).toBe(false);
  });

  it("단일 noOralHearingOrAdmission → 0.5 적용", () => {
    const r = applyLawyerFeeDiscounts(10_000_000, [
      { kind: "noOralHearingOrAdmission", reason: "admission" },
    ]);
    expect(r.multiplier).toBe(0.5);
    expect(r.amountWon).toBe(5_000_000);
  });

  it("가압류 ×0.5 + 무변론 ×0.5 = ×0.25 (compound)", () => {
    const r = applyLawyerFeeDiscounts(10_000_000, [
      { kind: "provisionalCase", hasOralHearing: false },
      { kind: "noOralHearingOrAdmission", reason: "noOralHearing" },
    ]);
    expect(r.multiplier).toBe(0.25);
    expect(r.amountWon).toBe(2_500_000);
    expect(r.clamped).toBe(false);
  });

  it("courtDiscretion 1.3 + customPercent 1.2 = 1.56 → clamp to 1.5", () => {
    const r = applyLawyerFeeDiscounts(10_000_000, [
      { kind: "courtDiscretion", multiplier: 1.3 },
      { kind: "customPercent", rate: 1.2 },
    ]);
    expect(r.rawMultiplier).toBeCloseTo(1.56, 10);
    expect(r.multiplier).toBe(LAWYER_FEE_MULTIPLIER_MAX);
    expect(r.amountWon).toBe(15_000_000);
    expect(r.clamped).toBe(true);
  });

  it("customPercent 0 결과 → clamp to 0 floor (multiplier 0)", () => {
    const r = applyLawyerFeeDiscounts(10_000_000, [{ kind: "customPercent", rate: 0 }]);
    expect(r.multiplier).toBe(LAWYER_FEE_MULTIPLIER_MIN);
    expect(r.amountWon).toBe(0);
    // rate=0 raw multiplier 자체가 0, clamp 경계 = false (감지 X)
    expect(r.clamped).toBe(false);
  });

  it("대한법률구조공단 variant → 0.42 적용 (koreaLegalAidAgreedFeeWon 미지정)", () => {
    const r = applyLawyerFeeDiscounts(10_000_000, [{ kind: "koreaLegalAid" }]);
    expect(r.multiplier).toBeCloseTo(0.42, 10);
    expect(r.amountWon).toBeCloseTo(4_200_000, 5);
  });
});

describe("litigation-cost / validateStampDutyInput", () => {
  const validInput = {
    caseValue: 10_000_000,
    caseType: "civilFirstInstanceCollegial" as CaseType,
    appealsLevel: "firstInstance" as const,
  };

  it("정상 입력은 throw 하지 않음", () => {
    expect(() => validateStampDutyInput(validInput)).not.toThrow();
  });

  it("음수 소가 → RangeError (한국어 prefix)", () => {
    expect(() => validateStampDutyInput({ ...validInput, caseValue: -1 })).toThrow(
      /^인지대 입력 검증 실패:/,
    );
  });

  it("NaN 소가 → RangeError", () => {
    expect(() => validateStampDutyInput({ ...validInput, caseValue: NaN })).toThrow(RangeError);
  });

  it("무효한 caseType → RangeError", () => {
    expect(() =>
      validateStampDutyInput({ ...validInput, caseType: "unknownCaseType" as CaseType }),
    ).toThrow(/사건구분이 유효하지 않습니다/);
  });

  it("무효한 appealsLevel → RangeError", () => {
    expect(() =>
      validateStampDutyInput({
        ...validInput,
        appealsLevel: "fourthInstance" as never,
      }),
    ).toThrow(/심급이 유효하지 않습니다/);
  });

  it("지급명령 + 항소 동시 지정 → RangeError", () => {
    expect(() =>
      validateStampDutyInput({ ...validInput, appealsLevel: "appeal", isPaymentOrder: true }),
    ).toThrow(/지급명령·화해는 1심에서만 적용/);
  });

  it("지급명령 + 화해 동시 지정 → RangeError", () => {
    expect(() =>
      validateStampDutyInput({ ...validInput, isPaymentOrder: true, isSettlement: true }),
    ).toThrow(/동시에 적용할 수 없습니다/);
  });
});

describe("litigation-cost / validateDeliveryFeeInput", () => {
  const validInput = {
    caseType: "civilFirstInstanceCollegial" as CaseType,
    partyCount: 2,
  };

  it("정상 입력은 throw 하지 않음", () => {
    expect(() => validateDeliveryFeeInput(validInput)).not.toThrow();
  });

  it("0 당사자 → RangeError (양의 정수 강제)", () => {
    expect(() => validateDeliveryFeeInput({ ...validInput, partyCount: 0 })).toThrow(
      /^송달료 입력 검증 실패:/,
    );
  });

  it("소수 당사자 → RangeError", () => {
    expect(() => validateDeliveryFeeInput({ ...validInput, partyCount: 2.5 })).toThrow(
      /당사자수가 유효하지 않습니다/,
    );
  });

  it("음수 회당 단가 → RangeError", () => {
    expect(() =>
      validateDeliveryFeeInput({ ...validInput, perDeliveryUnitPriceWon: -100 }),
    ).toThrow(/회당 단가가 유효하지 않습니다/);
  });

  it("0 customCount → RangeError", () => {
    expect(() => validateDeliveryFeeInput({ ...validInput, customCount: 0 })).toThrow(
      /사용자 입력 송달 횟수가 유효하지 않습니다/,
    );
  });

  it("음수 채권자수 → RangeError", () => {
    expect(() => validateDeliveryFeeInput({ ...validInput, creditorCount: -1 })).toThrow(
      /채권자수가 유효하지 않습니다/,
    );
  });
});

describe("litigation-cost / validateLawyerFeeInput", () => {
  const validInput = {
    caseValue: 50_000_000,
    caseType: "civilFirstInstanceCollegial" as CaseType,
    discounts: [] as LawyerFeeDiscount[],
  };

  it("정상 입력은 throw 하지 않음", () => {
    expect(() => validateLawyerFeeInput(validInput)).not.toThrow();
  });

  it("paymentOrder 사건구분 → RangeError (lawyerFee 도메인 미적용)", () => {
    expect(() => validateLawyerFeeInput({ ...validInput, caseType: "paymentOrder" })).toThrow(
      /^변호사보수 입력 검증 실패:/,
    );
  });

  it("courtDiscretion multiplier 범위 외 (음수) → RangeError", () => {
    expect(() =>
      validateLawyerFeeInput({
        ...validInput,
        discounts: [{ kind: "courtDiscretion", multiplier: -0.1 }],
      }),
    ).toThrow(/courtDiscretion.multiplier 는/);
  });

  it("courtDiscretion multiplier 범위 외 (1.5 초과) → RangeError", () => {
    expect(() =>
      validateLawyerFeeInput({
        ...validInput,
        discounts: [{ kind: "courtDiscretion", multiplier: 1.6 }],
      }),
    ).toThrow(/courtDiscretion.multiplier 는/);
  });

  it("customPercent rate 범위 외 (음수) → RangeError", () => {
    expect(() =>
      validateLawyerFeeInput({
        ...validInput,
        discounts: [{ kind: "customPercent", rate: -0.1 }],
      }),
    ).toThrow(/customPercent.rate 는/);
  });

  it("음수 대한법률구조공단 약정보수액 → RangeError", () => {
    expect(() => validateLawyerFeeInput({ ...validInput, koreaLegalAidAgreedFeeWon: -1 })).toThrow(
      /대한법률구조공단 약정보수액이 유효하지 않습니다/,
    );
  });

  it("ISO 형식 외 filingDate → RangeError", () => {
    expect(() => validateLawyerFeeInput({ ...validInput, filingDate: "2026/05/11" })).toThrow(
      /접수일이 ISO 형식이 아닙니다/,
    );
  });

  it("noOralHearingOrAdmission 유효 reason 4종 모두 통과", () => {
    const reasons = [
      "admission",
      "defaultAdmission",
      "noOralHearing",
      "orderForPerformance",
    ] as const;
    for (const reason of reasons) {
      expect(() =>
        validateLawyerFeeInput({
          ...validInput,
          discounts: [{ kind: "noOralHearingOrAdmission", reason }],
        }),
      ).not.toThrow();
    }
  });
});

describe("litigation-cost / validateKoreaLegalAidDiscountScope", () => {
  it("대한법률구조공단 미사용 → warnings 빈 배열 (비차단)", () => {
    expect(
      validateKoreaLegalAidDiscountScope("administrativeFirstInstance", [
        { kind: "customPercent", rate: 0.5 },
      ]),
    ).toEqual([]);
  });

  it("민·가사 + 대한법률구조공단 단독 → warnings 빈 배열", () => {
    expect(
      validateKoreaLegalAidDiscountScope("civilFirstInstanceCollegial", [
        { kind: "koreaLegalAid" },
      ]),
    ).toEqual([]);
    expect(
      validateKoreaLegalAidDiscountScope("familyFirstInstanceSingle", [{ kind: "koreaLegalAid" }]),
    ).toEqual([]);
  });

  it("행정 + 대한법률구조공단 → koreaLegalAidScopeNotCivilOrFamily warning", () => {
    const warnings = validateKoreaLegalAidDiscountScope("administrativeFirstInstance", [
      { kind: "koreaLegalAid" },
    ]);
    expect(warnings).toHaveLength(1);
    const first = warnings[0]!;
    expect(first.reason).toBe("koreaLegalAidScopeNotCivilOrFamily");
    expect(first.messageKo).toContain("민·가사");
  });

  it("보전 + 대한법률구조공단 → koreaLegalAidScopeNotCivilOrFamily warning", () => {
    const warnings = validateKoreaLegalAidDiscountScope("provisionalMeasureCollegial", [
      { kind: "koreaLegalAid" },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toBe("koreaLegalAidScopeNotCivilOrFamily");
  });

  it("대한법률구조공단 + 다른 multiplier 누적 → koreaLegalAidScopeOverridden warning", () => {
    const warnings = validateKoreaLegalAidDiscountScope("civilFirstInstanceCollegial", [
      { kind: "koreaLegalAid" },
      { kind: "noOralHearingOrAdmission", reason: "admission" },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.reason).toBe("koreaLegalAidScopeOverridden");
  });

  it("행정 + 대한법률구조공단 + 다른 multiplier → 2 warning 동시", () => {
    const warnings = validateKoreaLegalAidDiscountScope("administrativeFirstInstance", [
      { kind: "koreaLegalAid" },
      { kind: "courtDiscretion", multiplier: 0.7 },
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.reason).sort()).toEqual(
      ["koreaLegalAidScopeNotCivilOrFamily", "koreaLegalAidScopeOverridden"].sort(),
    );
  });
});
