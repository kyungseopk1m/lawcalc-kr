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
      delivery: "delivery/v1.0.0",
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
});
