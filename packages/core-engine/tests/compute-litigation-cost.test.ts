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

    expect(result.stampDuty.amount).toBe(95_000);
    expect(result.deliveryFee.amount).toBe(165_000);
    expect(result.lawyerFee.amount).toBe(2_800_000);
    expect(result.totalAmount).toBe(3_060_000);
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
    expect(result.dataVersions).toEqual({
      "stamp-duty": "stamp-duty/v1.0.0",
      delivery: "delivery/v1.1.0",
      "lawyer-fee": "lawyer-fee/v1.0.0",
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
      totalWon: 3_060_000,
      perParty: [1_530_000, 1_530_000],
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

    expect(result.distribution?.perParty).toEqual([1_530_000, 1_530_000]);
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
      totalWon: 3_060_000,
      perParty: [1_020_000, 2_040_000],
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
    expect(result.lawyerFee.klacWarnings).toEqual([]);
    expect(result.lawyerFee.formulaText).toContain("변호사보수 산입 외 사건구분");
    expect(result.lawyerFee.dataVersion).toBe("lawyer-fee/v1.0.0");
    expect(result.lawyerFee.computedAt).toBe(computedAt);

    // 송달료: 재일 87-4 별표 1 — 독촉사건 6회 × 채권자·채무자 2명 × 5,500원
    expect(result.deliveryFee.deliveryCount).toBe(12);
    expect(result.deliveryFee.amount).toBe(66_000);

    // 인지대: 30,000,000 × 0.0045 + 5,000 = 140,000 정도, ×0.1 (지급명령) ≈ 14,000원대 (100원 절사)
    expect(result.stampDuty.amount).toBeGreaterThan(0);
    expect(result.totalAmount).toBe(result.stampDuty.amount + result.deliveryFee.amount);
    expect(result.dataVersions).toEqual({
      "stamp-duty": "stamp-duty/v1.0.0",
      delivery: "delivery/v1.1.0",
      "lawyer-fee": "lawyer-fee/v1.0.0",
    });
  });
});
