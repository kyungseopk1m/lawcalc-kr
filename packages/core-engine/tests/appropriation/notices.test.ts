import { describe, expect, it } from "vitest";

import { computeAppropriation, type AppropriationInput } from "../../src";

const twoDebts: AppropriationInput = {
  claims: [
    {
      id: "A",
      costBalance: 1_000,
      interestBalance: 5_000,
      principalBalance: 100_000,
      dueAt: "2025-01-01",
    },
    { id: "B", interestBalance: 7_000, principalBalance: 200_000, dueAt: "2025-02-01" },
  ],
  payment: { amount: 50_000, paidAt: "2025-06-30", allocation: { type: "legal" } },
  computedAt: "2026-10-25",
};

describe("해석 안내 (제479조 다수 채무)", () => {
  it("비용·이자가 있는 채무 둘 이상 + 법정충당이면 안내가 붙고 금액은 그대로", () => {
    const r = computeAppropriation(twoDebts);
    expect(r.interpretationNotices).toHaveLength(1);
    expect(r.interpretationNotices![0]).toContain("제479조");
  });

  it("채무 하나이거나 이자·비용이 없으면 필드가 없다", () => {
    expect(computeAppropriation({ ...twoDebts, claims: [twoDebts.claims[0]!] })).not.toHaveProperty(
      "interpretationNotices",
    );
    const plain = computeAppropriation({
      ...twoDebts,
      claims: [
        { id: "A", principalBalance: 100_000, dueAt: "2025-01-01" },
        { id: "B", principalBalance: 200_000, dueAt: "2025-02-01" },
      ],
    });
    expect(plain).not.toHaveProperty("interpretationNotices");
  });

  it("전액 지정이면 법정충당이 쓰이지 않아 안내가 없다", () => {
    const r = computeAppropriation({
      ...twoDebts,
      payment: {
        amount: 6_000,
        paidAt: "2025-06-30",
        allocation: { type: "debtorDesignation", targets: [{ claimId: "A", amount: 6_000 }] },
      },
    });
    expect(r).not.toHaveProperty("interpretationNotices");
  });
});

describe("해석 안내 (최고이자율 시행일 당일 약정)", () => {
  const limited = (agreedAt: string): AppropriationInput => ({
    claims: [
      {
        id: "L",
        principalBalance: 1_000_000,
        dueAt: "2025-01-01",
        interestRate: 0.4,
        interestFrom: "2024-01-01",
        interestLimitAct: { agreedAt },
      },
    ],
    payment: { amount: 100_000, paidAt: "2025-06-30", allocation: { type: "legal" } },
    computedAt: "2026-10-25",
  });

  it("2014-07-15 약정은 25% 를 쓰고 해석 안내가 붙는다", () => {
    const r = computeAppropriation(limited("2014-07-15"));
    expect(r.interestLimits![0]!.capRate).toBe(0.25);
    expect(r.interestLimits![0]!.notice).toContain("시행일");
  });

  it("전날과 다음날에는 안내가 없다", () => {
    expect(computeAppropriation(limited("2014-07-14")).interestLimits![0]!.notice).not.toContain(
      "시행일",
    );
    expect(computeAppropriation(limited("2014-07-16")).interestLimits![0]!.notice).not.toContain(
      "시행일",
    );
  });
});
