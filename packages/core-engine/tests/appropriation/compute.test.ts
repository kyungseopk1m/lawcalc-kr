import { describe, expect, it } from "vitest";

import {
  APPROPRIATION_DATA_VERSION,
  computeAppropriation,
  STANDARD_DISCLAIMER,
  type AppropriationInput,
} from "../../src";

describe("computeAppropriation — 단일 채권 + 명시 directive", () => {
  it("debtorDesignation (476조 채무자 지정) — cost→interest→principal 순으로 차감 (479조)", () => {
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

  it("creditorDesignation (3순위 채권자 지정) — sum(targets) < payment.amount 시 잉여는 같은 채권 잔액에 477조 cascade", () => {
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
    // 지정 3,000 + 잉여 2,000 cascade (제477조) = 5,000 전액 충당.
    expect(result.claims[0]!.principalApplied).toBe(5000);
    expect(result.claims[0]!.principalBalanceAfter).toBe(5000);
    expect(result.payment.unappliedAmount).toBe(0);
    expect(result.payment.appliedAmount).toBe(5000);
    expect(result.claims[0]!.statutoryRank?.priorityLabel).toContain("잉여 법정충당 1순위");
  });
});

describe("computeAppropriation — 명시충당 잉여 477조 cascade", () => {
  it("잉여가 지정 대상 잔액 → 후순위 채권 순으로 cascade (변제기 도래 우선)", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "a", interestBalance: 1000, principalBalance: 4000, dueAt: "2025-01-01" },
        { id: "b", principalBalance: 3000, dueAt: "2025-02-01" },
      ],
      payment: {
        amount: 10000,
        allocation: {
          type: "debtorDesignation",
          targets: [{ claimId: "a", amount: 2000 }],
        },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const a = result.claims.find((c) => c.claimId === "a")!;
    const b = result.claims.find((c) => c.claimId === "b")!;
    // 지정: a 에 2,000 (이자 1,000 → 원본 1,000). 잉여 8,000 cascade:
    // 1순위 a (변제기 선도래) 잔액 3,000 소진 → 2순위 b 에 3,000 → 잔여 2,000 은 반환.
    expect(a.interestApplied).toBe(1000);
    expect(a.principalApplied).toBe(4000);
    expect(a.principalBalanceAfter).toBe(0);
    expect(b.principalApplied).toBe(3000);
    expect(b.principalBalanceAfter).toBe(0);
    expect(result.payment.appliedAmount).toBe(8000);
    expect(result.payment.unappliedAmount).toBe(2000);
    expect(a.statutoryRank?.priorityLabel).toContain("잉여 법정충당 1순위");
    expect(b.statutoryRank?.priorityLabel).toContain("잉여 법정충당 2순위");
  });

  it("잉여 cascade 도 변제기 미도래 채권은 도래 채권 뒤로 미룬다", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "due", principalBalance: 1000, dueAt: "2025-01-01" },
        { id: "notDue", principalBalance: 5000, dueAt: "2027-01-01" },
      ],
      payment: {
        amount: 4000,
        allocation: {
          type: "debtorDesignation",
          targets: [{ claimId: "due", amount: 500 }],
        },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    const due = result.claims.find((c) => c.claimId === "due")!;
    const notDue = result.claims.find((c) => c.claimId === "notDue")!;
    // 잉여 3,500: 도래 채권 잔액 500 먼저 → 미도래 채권에 3,000.
    expect(due.principalApplied).toBe(1000);
    expect(notDue.principalApplied).toBe(3000);
    expect(result.payment.unappliedAmount).toBe(0);
    expect(due.statutoryRank?.dueReached).toBe(true);
    expect(notDue.statutoryRank?.dueReached).toBe(false);
  });

  it("모든 채권 소진 후 잔여 잉여는 unapplied (반환) 로 남는다", () => {
    const input: AppropriationInput = {
      claims: [{ id: "c1", principalBalance: 1000, dueAt: "2025-01-01" }],
      payment: {
        amount: 5000,
        allocation: { type: "agreement", targets: [{ claimId: "c1", amount: 1000 }] },
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]!.principalBalanceAfter).toBe(0);
    expect(result.payment.appliedAmount).toBe(1000);
    expect(result.payment.unappliedAmount).toBe(4000);
  });

  it("legal 경로의 priorityLabel 은 prefix 없이 유지된다", () => {
    const input: AppropriationInput = {
      claims: [{ id: "c1", principalBalance: 5000, dueAt: "2025-01-01" }],
      payment: { amount: 3000, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]!.statutoryRank?.priorityLabel).toMatch(/^법정충당 1순위/);
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

  /**
   * 민법 제477조 제4호 비례 안분의 불변식.
   *
   * 직전 구현은 마지막 채권에 절사 잔여를 몰아주면서 그 채권이 자기 잔액에 걸리면
   * 차액을 어느 채권에도 충당하지 않고 버렸다. 순위가 이미 매겨진 채권은 다음
   * 라운드의 `open` 필터에서 제외되어 재분배도 되지 않았다.
   */
  describe("동순위 안분 불변식", () => {
    const legal = (balances: Array<[string, number]>, amount: number): AppropriationInput => ({
      claims: balances.map(([id, principalBalance]) => ({
        id,
        principalBalance,
        dueAt: "2025-01-01",
      })),
      payment: { amount, allocation: { type: "legal" } },
      computedAt: "2026-05-15",
    });

    it("변제액이 총채무 이하이면 전액 충당된다 (잔여 0)", () => {
      const cases: Array<[Array<[string, number]>, number]> = [
        [
          [
            ["a", 3],
            ["b", 1],
            ["c", 2],
          ],
          5,
        ],
        [
          [
            ["a", 20],
            ["b", 20],
            ["c", 19],
            ["d", 7],
            ["e", 9],
          ],
          74,
        ],
        [
          [
            ["a", 1000],
            ["b", 1000],
            ["c", 1000],
          ],
          1,
        ],
        [
          [
            ["a", 7],
            ["b", 11],
            ["c", 13],
          ],
          17,
        ],
      ];
      for (const [balances, amount] of cases) {
        const result = computeAppropriation(legal(balances, amount));
        expect(result.payment.appliedAmount).toBe(amount);
        expect(result.payment.unappliedAmount).toBe(0);
        const sum = result.claims.reduce((acc, c) => acc + c.totalApplied, 0);
        expect(sum).toBe(amount);
      }
    });

    it("변제액이 총채무를 넘으면 초과분만 잔여로 남는다", () => {
      const result = computeAppropriation(
        legal(
          [
            ["a", 3],
            ["b", 1],
            ["c", 2],
          ],
          10,
        ),
      );
      expect(result.payment.appliedAmount).toBe(6);
      expect(result.payment.unappliedAmount).toBe(4);
    });

    it("채권 입력 순서를 바꿔도 같은 채권이 같은 금액을 받는다", () => {
      const balances: Array<[string, number]> = [
        ["a", 3],
        ["b", 1],
        ["c", 2],
      ];
      const normalize = (input: AppropriationInput) =>
        computeAppropriation(input)
          .claims.map((c) => [c.claimId, c.totalApplied] as const)
          .sort((x, y) => x[0].localeCompare(y[0]));

      const forward = normalize(legal(balances, 5));
      const reversed = normalize(legal([...balances].reverse(), 5));
      const rotated = normalize(legal([balances[1]!, balances[2]!, balances[0]!], 5));

      expect(reversed).toEqual(forward);
      expect(rotated).toEqual(forward);
    });

    it("배분액이 각 채권 잔액을 넘지 않는다", () => {
      const result = computeAppropriation(
        legal(
          [
            ["a", 1],
            ["b", 100],
          ],
          50,
        ),
      );
      const a = result.claims.find((c) => c.claimId === "a")!;
      const b = result.claims.find((c) => c.claimId === "b")!;
      expect(a.totalApplied).toBeLessThanOrEqual(1);
      expect(b.totalApplied).toBeLessThanOrEqual(100);
      expect(a.totalApplied + b.totalApplied).toBe(50);
    });
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

/**
 * APP-3 — 변제기 도래 판정은 **변제 시점** 기준이다 (민법 제477조 제1호).
 *
 * 종전엔 `computedAt ?? 오늘` 로 판정해서 (1) 과거 변제의 충당 순서를 재현할 수 없었고
 * (2) `.lcalc` 를 저장했다 나중에 열면 그 사이 `dueAt` 이 지나 같은 파일이 다른 결과를 냈다.
 * `payment.paidAt` 미지정 시에는 종전 동작 그대로다 (회귀 0).
 */
describe("computeAppropriation — 변제일 (payment.paidAt) [APP-3]", () => {
  // 변제이익이 높은 `benefit`(rank 0)의 변제기가 `late`(rank 1)보다 늦다. 두 채권이 모두
  // 도래한 시점에서는 변제이익이 앞서지만(제477조 제2호), 아직 도래 전이면 도래한 채권이
  // 먼저 충당된다(1호). 기준일이 바뀌면 결과가 실제로 뒤집히는 조합이다.
  const twoClaims = (paidAt?: string): AppropriationInput => ({
    claims: [
      { id: "benefit", principalBalance: 100_000, dueAt: "2026-01-01", debtorBenefitRank: 0 },
      { id: "late", principalBalance: 100_000, dueAt: "2024-01-01", debtorBenefitRank: 1 },
    ],
    payment: {
      amount: 50_000,
      allocation: { type: "legal" },
      ...(paidAt === undefined ? {} : { paidAt }),
    },
    computedAt: "2026-05-15",
  });

  const appliedTo = (input: AppropriationInput) =>
    Object.fromEntries(computeAppropriation(input).claims.map((c) => [c.claimId, c.totalApplied]));

  it("paidAt 미지정 시 computedAt 기준 — 둘 다 도래해 변제이익이 앞선다 (기존 동작)", () => {
    expect(appliedTo(twoClaims())).toEqual({ benefit: 50_000, late: 0 });
  });

  it("paidAt 을 과거로 주면 그 시점 기준으로 도래를 판정한다 (결과가 뒤집힌다)", () => {
    // 2025-06-01 시점엔 benefit(2026-01-01)이 미도래 → 도래한 late 가 먼저 충당된다.
    expect(appliedTo(twoClaims("2025-06-01"))).toEqual({ benefit: 0, late: 50_000 });
  });

  it("도래 채권이 하나도 없으면 미도래 채권에 충당한다 (제477조 제2호 이하)", () => {
    const input: AppropriationInput = {
      claims: [{ id: "future", principalBalance: 100_000, dueAt: "2026-01-01" }],
      payment: { amount: 50_000, allocation: { type: "legal" }, paidAt: "2020-01-01" },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]?.totalApplied).toBe(50_000);
    expect(result.claims[0]?.statutoryRank?.dueReached).toBe(false);
  });

  it("dueAt === paidAt 경계는 도래로 본다", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "boundary", principalBalance: 100_000, dueAt: "2025-06-01" },
        { id: "later", principalBalance: 100_000, dueAt: "2025-12-01" },
      ],
      payment: { amount: 50_000, allocation: { type: "legal" }, paidAt: "2025-06-01" },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]?.statutoryRank?.dueReached).toBe(true);
    expect(result.claims[0]?.totalApplied).toBe(50_000);
    expect(result.claims[1]?.totalApplied).toBe(0);
  });

  it("dueAt 하루 뒤 paidAt 은 미도래", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "a", principalBalance: 100_000, dueAt: "2025-06-01" },
        { id: "b", principalBalance: 100_000, dueAt: "2025-06-02" },
      ],
      payment: { amount: 200_000, allocation: { type: "legal" }, paidAt: "2025-06-01" },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    expect(result.claims[0]?.statutoryRank?.dueReached).toBe(true);
    expect(result.claims[1]?.statutoryRank?.dueReached).toBe(false);
  });

  it("paidAt 이 computedAt 을 덮어써도 result.computedAt 은 계산 시각 그대로다", () => {
    const result = computeAppropriation(twoClaims("2025-06-01"));
    expect(result.computedAt).toBe("2026-05-15");
  });

  it("지정충당 잉여의 법정충당 cascade 도 paidAt 을 기준으로 한다", () => {
    const input: AppropriationInput = {
      claims: [
        { id: "target", principalBalance: 30_000, dueAt: "2024-01-01" },
        { id: "future", principalBalance: 100_000, dueAt: "2026-01-01" },
        { id: "past", principalBalance: 100_000, dueAt: "2024-06-01" },
      ],
      payment: {
        amount: 80_000,
        allocation: { type: "agreement", targets: [{ claimId: "target", amount: 30_000 }] },
        paidAt: "2025-06-01",
      },
      computedAt: "2026-05-15",
    };
    const result = computeAppropriation(input);
    // 잉여 50,000 은 2025-06-01 기준 도래한 past 로 간다. future 는 아직 미도래.
    expect(Object.fromEntries(result.claims.map((c) => [c.claimId, c.totalApplied]))).toEqual({
      target: 30_000,
      past: 50_000,
      future: 0,
    });
  });

  it("paidAt 형식이 ISO 가 아니면 거부한다", () => {
    expect(() =>
      computeAppropriation({
        claims: [{ id: "c1", principalBalance: 100_000, dueAt: "2025-01-01" }],
        payment: { amount: 1_000, allocation: { type: "legal" }, paidAt: "2025/06/01" },
      }),
    ).toThrow(/paidAt 은 YYYY-MM-DD 형식이어야 합니다/);
  });
});
