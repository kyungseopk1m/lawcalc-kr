import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER, computeLitigationCost, type LitigationCostInput } from "../src";

const computedAt = "2026-05-11T12:00:00.000Z";

const baseInput: LitigationCostInput = {
  stampDuty: {
    caseValue: 30_000_000,
    caseType: "civilFirstInstanceSingle",
    appealsLevel: "firstInstance",
  },
  deliveryFee: {
    caseType: "civilFirstInstanceSingle",
    partyCount: 2,
  },
  lawyerFee: {
    caseValue: 30_000_000,
    caseType: "civilFirstInstanceSingle",
    discounts: [],
  },
};

describe("litigation-cost / computeLitigationCost", () => {
  it("combines stamp-duty, delivery, lawyer-fee, disclaimer, and dataVersions", () => {
    const result = computeLitigationCost(baseInput, { computedAt });

    expect(result.stampDuty.amount).toBe(140_000);
    expect(result.deliveryFee.amount).toBe(165_000);
    expect(result.lawyerFee.amount).toBe(2_800_000);
    expect(result.totalAmount).toBe(3_105_000);
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(result.dataVersions).toEqual({
      "stamp-duty": "stamp-duty/v1.1.0",
      delivery: "delivery/v1.1.0",
      "lawyer-fee": "lawyer-fee/v1.2.0",
    });
    expect(result.computedAt).toBe(computedAt);
    expect(result.stampDuty.computedAt).toBe(computedAt);
    expect(result.deliveryFee.computedAt).toBe(computedAt);
    expect(result.lawyerFee.computedAt).toBe(computedAt);
  });

  it("adds equal distribution when requested", () => {
    const result = computeLitigationCost(
      {
        ...baseInput,
        distribution: { mode: "equal", partyCount: 2 },
      },
      { computedAt },
    );

    expect(result.distribution).toEqual({
      mode: "equal",
      totalWon: 3_105_000,
      perParty: [1_552_500, 1_552_500],
      remainder: 0,
      basis: "partyCount",
    });
  });

  it("uses deliveryFee.partyCount for equal distribution when partyCount is omitted", () => {
    const result = computeLitigationCost(
      {
        ...baseInput,
        distribution: { mode: "equal" },
      },
      { computedAt },
    );

    expect(result.distribution?.perParty).toEqual([1_552_500, 1_552_500]);
  });

  it("adds proportional distribution when requested", () => {
    const result = computeLitigationCost(
      {
        ...baseInput,
        distribution: { mode: "proportional", partyValuesWon: [10_000_000, 20_000_000] },
      },
      { computedAt },
    );

    expect(result.distribution).toEqual({
      mode: "proportional",
      totalWon: 3_105_000,
      perParty: [1_035_000, 2_070_000],
      remainder: 0,
      basis: "partyValuesWon",
    });
  });

  it("requires proportional partyValuesWon", () => {
    expect(() =>
      computeLitigationCost(
        {
          ...baseInput,
          distribution: { mode: "proportional" },
        },
        { computedAt },
      ),
    ).toThrow("안분에는 partyValuesWon 이 필요합니다");
  });

  it("paymentOrder: 인지대(×0.1) + 송달료(2 × 6 × 5,500) 정상 계산, 변호사보수 산입 외", () => {
    const input: LitigationCostInput = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "paymentOrder",
        appealsLevel: "firstInstance",
        isPaymentOrder: true,
      },
      deliveryFee: {
        caseType: "paymentOrder",
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "paymentOrder",
        discounts: [],
      },
    };

    const result = computeLitigationCost(input, { computedAt });

    // 변호사보수 zero-fill (산입 외 사건구분)
    expect(result.lawyerFee.amount).toBe(0);
    expect(result.lawyerFee.baseAmount).toBe(0);
    expect(result.lawyerFee.multiplier).toBe(0);
    expect(result.lawyerFee.appliedDiscounts).toEqual([]);
    expect(result.lawyerFee.koreaLegalAidWarnings).toEqual([]);
    expect(result.lawyerFee.formulaText).toContain("변호사보수 산입 외 사건구분");
    expect(result.lawyerFee.dataVersion).toBe("lawyer-fee/v1.2.0");
    expect(result.lawyerFee.computedAt).toBe(computedAt);

    // 송달료: 재일 87-4 별표 1 — 독촉사건 6회 × 채권자·채무자 2명 × 5,500원
    expect(result.deliveryFee.deliveryCount).toBe(12);
    expect(result.deliveryFee.amount).toBe(66_000);

    // 인지대: 30,000,000 × 0.0045 + 5,000 = 140,000 정도, ×0.1 (지급명령) ≈ 14,000원대 (100원 절사)
    expect(result.stampDuty.amount).toBeGreaterThan(0);
    expect(result.totalAmount).toBe(result.stampDuty.amount + result.deliveryFee.amount);
    expect(result.dataVersions).toEqual({
      "stamp-duty": "stamp-duty/v1.1.0",
      delivery: "delivery/v1.1.0",
      "lawyer-fee": "lawyer-fee/v1.2.0",
    });
  });
});

describe("computeLitigationCost / 감사 F1·F3 통합 회귀 가드", () => {
  it("caseType=paymentOrder 는 flag 없이 인지 1/10 자동 적용 (F3)", () => {
    const input: LitigationCostInput = {
      stampDuty: { caseValue: 50_000_000, caseType: "paymentOrder", appealsLevel: "firstInstance" },
      deliveryFee: { caseType: "paymentOrder", partyCount: 2 },
      lawyerFee: { caseValue: 50_000_000, caseType: "paymentOrder", discounts: [] },
    };
    const r = computeLitigationCost(input, { computedAt });
    expect(r.stampDuty.amount).toBe(23_000); // 230,000 × 0.1, 소장식(230,000) 아님
  });

  it("임시지위 가처분 인지는 본안 1/2 + 변호사보수 정상 계산 (F1)", () => {
    const input: LitigationCostInput = {
      stampDuty: {
        caseValue: 50_000_000,
        caseType: "provisionalMeasureCollegial",
        appealsLevel: "firstInstance",
        provisionalMeasureType: "provisionalStatus",
      },
      deliveryFee: { caseType: "provisionalMeasureCollegial", partyCount: 2 },
      lawyerFee: {
        caseValue: 50_000_000,
        caseType: "provisionalMeasureCollegial",
        discounts: [],
      },
    };
    const r = computeLitigationCost(input, { computedAt });
    expect(r.stampDuty.amount).toBe(115_000); // 230,000 × 0.5
    expect(r.lawyerFee.amount).toBeGreaterThan(0); // 보전은 lawyerFee 산입 대상
  });

  it("일반 가압류·가처분 인지는 정액 1만원 (F1)", () => {
    const input: LitigationCostInput = {
      stampDuty: {
        caseValue: 50_000_000,
        caseType: "provisionalMeasureSingle",
        appealsLevel: "firstInstance",
      },
      deliveryFee: { caseType: "provisionalMeasureSingle", partyCount: 2 },
      lawyerFee: { caseValue: 50_000_000, caseType: "provisionalMeasureSingle", discounts: [] },
    };
    const r = computeLitigationCost(input, { computedAt });
    expect(r.stampDuty.amount).toBe(10_000);
  });
});
