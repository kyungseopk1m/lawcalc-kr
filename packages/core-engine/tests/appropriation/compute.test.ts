import { describe, expect, it } from "vitest";

import {
  APPROPRIATION_DATA_VERSION,
  computeAppropriation,
  STANDARD_DISCLAIMER,
  type AppropriationInput,
} from "../../src";

describe("computeAppropriation — 단일 채권 + 명시 directive", () => {
  it("debtorDesignation (476조 채무자 지정) — cost→interest→principal 순으로 차감 (478조)", () => {
    const input: AppropriationInput = {
      claims: [
        {
          id: "c1",
          costBalance: 1000,
          interestBalance: 2000,
          principalBalance: 10000,
          dueAt: "2025-01-01",
        },
      ],
      payment: {
        amount: 5000,
        allocation: {
          type: "debtorDesignation",
          targets: [{ claimId: "c1", amount: 5000 }],
        },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const claim = result.claims[0]!;
    expect(claim.costApplied).toBe(1000);
    expect(claim.interestApplied).toBe(2000);
    expect(claim.principalApplied).toBe(2000);
    expect(claim.costBalanceAfter).toBe(0);
    expect(claim.interestBalanceAfter).toBe(0);
    expect(claim.principalBalanceAfter).toBe(8000);
    expect(claim.totalApplied).toBe(5000);
    expect(result.payment.unappliedAmount).toBe(0);
    expect(result.payment.appliedAmount).toBe(5000);
  });

  it("agreement (1순위 합의) — payment 가 잔액보다 큰 경우 unapplied 반환", () => {
    const input: AppropriationInput = {
      claims: [
        {
          id: "c1",
          principalBalance: 1000,
          dueAt: "2025-01-01",
        },
      ],
      payment: {
        amount: 5000,
        allocation: {
          type: "agreement",
          targets: [{ claimId: "c1", amount: 5000 }],
        },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]!.principalApplied).toBe(1000);
    expect(result.claims[0]!.principalBalanceAfter).toBe(0);
    expect(result.payment.unappliedAmount).toBe(4000);
    expect(result.payment.appliedAmount).toBe(1000);
  });

  it("creditorDesignation (3순위 채권자 지정) — sum(targets) < payment.amount 시 잉여는 unapplied", () => {
    const input: AppropriationInput = {
      claims: [
        {
          id: "c1",
          principalBalance: 10000,
          dueAt: "2025-01-01",
        },
      ],
      payment: {
        amount: 5000,
        allocation: {
          type: "creditorDesignation",
          targets: [{ claimId: "c1", amount: 3000 }],
        },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]!.principalApplied).toBe(3000);
    expect(result.payment.unappliedAmount).toBe(2000);
    expect(result.payment.appliedAmount).toBe(3000);
  });
});

describe("computeAppropriation — 다수 채권 + 법정충당 (477조)", () => {
  it("변제기 도래 우선 — 미도래 채권은 0 차감", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", principalBalance: 5000, dueAt: "2025-01-01" },
        { id: "c2", principalBalance: 5000, dueAt: "2026-12-31" },
      ],
      payment: { amount: 3000, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const c1 = result.claims.find((c) => c.claimId === "c1")!;
    const c2 = result.claims.find((c) => c.claimId === "c2")!;
    expect(c1.principalApplied).toBe(3000);
    expect(c1.principalBalanceAfter).toBe(2000);
    expect(c1.statutoryRank?.dueReached).toBe(true);
    expect(c2.principalApplied).toBe(0);
    expect(c2.statutoryRank).toBeUndefined();
  });

  it("변제기 동시 도래 + debtorBenefitRank 낮은 채권 우선", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", principalBalance: 1000, dueAt: "2025-01-01", debtorBenefitRank: 1 },
        { id: "c2", principalBalance: 1000, dueAt: "2025-01-01", debtorBenefitRank: 0 },
      ],
      payment: { amount: 800, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const c1 = result.claims.find((c) => c.claimId === "c1")!;
    const c2 = result.claims.find((c) => c.claimId === "c2")!;
    expect(c2.principalApplied).toBe(800);
    expect(c1.principalApplied).toBe(0);
    expect(c2.statutoryRank?.debtorBenefitRank).toBe(0);
  });

  it("rank 동순위 + dueAt 빠른 채권 우선", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", principalBalance: 1000, dueAt: "2025-06-01" },
        { id: "c2", principalBalance: 1000, dueAt: "2025-01-01" },
      ],
      payment: { amount: 500, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const c2 = result.claims.find((c) => c.claimId === "c2")!;
    const c1 = result.claims.find((c) => c.claimId === "c1")!;
    expect(c2.principalApplied).toBe(500);
    expect(c1.principalApplied).toBe(0);
  });

  it("완전 동순위 (rank·dueAt 동일) — 잔액 비례 안분", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", principalBalance: 1000, dueAt: "2025-01-01" },
        { id: "c2", principalBalance: 3000, dueAt: "2025-01-01" },
      ],
      payment: { amount: 2000, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const c1 = result.claims.find((c) => c.claimId === "c1")!;
    const c2 = result.claims.find((c) => c.claimId === "c2")!;
    expect(c1.principalApplied).toBe(500);
    expect(c2.principalApplied).toBe(1500);
    expect(c1.statutoryRank?.proportionalShare).toEqual({ numerator: 1000, denominator: 4000 });
    expect(c2.statutoryRank?.proportionalShare).toEqual({ numerator: 3000, denominator: 4000 });
  });

  it("모든 채권 변제기 미도래 — 미도래 tier 안에서 정렬 후 분배", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", principalBalance: 1000, dueAt: "2027-01-01" },
        { id: "c2", principalBalance: 1000, dueAt: "2026-12-01" },
      ],
      payment: { amount: 500, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const c2 = result.claims.find((c) => c.claimId === "c2")!;
    expect(c2.principalApplied).toBe(500);
    expect(c2.statutoryRank?.dueReached).toBe(false);
  });

  it("payment 가 모든 잔액 초과 — unapplied 반환", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", principalBalance: 500, dueAt: "2025-01-01" },
        { id: "c2", principalBalance: 500, dueAt: "2025-01-01", debtorBenefitRank: 1 },
      ],
      payment: { amount: 5000, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.totals.remainingGrandTotal).toBe(0);
    expect(result.payment.unappliedAmount).toBe(4000);
  });
});

describe("computeAppropriation — 메타 필드", () => {
  it("result.disclaimer 는 STANDARD_DISCLAIMER 와 동일", () => {
    const input: AppropriationInput = {
      claims: [{ id: "c1", principalBalance: 1000, dueAt: "2025-01-01" }],
      payment: { amount: 500, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.disclaimer).toBe(STANDARD_DISCLAIMER);
  });

  it("result.dataVersion 은 'appropriation/policy-v1' 정적 태그", () => {
    const input: AppropriationInput = {
      claims: [{ id: "c1", principalBalance: 1000, dueAt: "2025-01-01" }],
      payment: { amount: 500, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.dataVersion).toBe(APPROPRIATION_DATA_VERSION);
    expect(result.dataVersion).toBe("appropriation/policy-v1");
  });

  it("computedAt 미입력 시 오늘 날짜 (YYYY-MM-DD) 채움", () => {
    const input: AppropriationInput = {
      claims: [{ id: "c1", principalBalance: 1000, dueAt: "2025-01-01" }],
      payment: { amount: 500, allocation: { type: "legal" } },
    };
    const result = computeAppropriation(input);
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("name 입력 시 결과에 보존, 미입력 시 결과에 없음", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "c1", name: "대여금A", principalBalance: 1000, dueAt: "2025-01-01" },
        { id: "c2", principalBalance: 1000, dueAt: "2025-01-01" },
      ],
      payment: { amount: 200, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const c1 = result.claims.find((c) => c.claimId === "c1")!;
    const c2 = result.claims.find((c) => c.claimId === "c2")!;
    expect(c1.name).toBe("대여금A");
    expect(c2.name).toBeUndefined();
  });

  it("totals 는 모든 claim 의 합과 일치", () => {
    const input: AppropriationInput = {
      claims: [
        {
          id: "c1",
          costBalance: 100,
          interestBalance: 200,
          principalBalance: 1000,
          dueAt: "2025-01-01",
        },
        {
          id: "c2",
          principalBalance: 500,
          dueAt: "2026-12-31",
        },
      ],
      payment: { amount: 250, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.totals.totalCostApplied).toBe(100);
    expect(result.totals.totalInterestApplied).toBe(150);
    expect(result.totals.totalPrincipalApplied).toBe(0);
    expect(result.totals.remainingCost).toBe(0);
    expect(result.totals.remainingInterest).toBe(50);
    expect(result.totals.remainingPrincipal).toBe(1500);
    expect(result.totals.remainingGrandTotal).toBe(1550);
  });
});
