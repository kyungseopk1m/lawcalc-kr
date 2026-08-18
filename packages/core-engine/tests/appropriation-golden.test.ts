import { describe, expect, it } from "vitest";

import { computeAppropriation, STANDARD_DISCLAIMER, type AppropriationInput } from "../src";
import { findCoverageViolations, type GoldenCoverage } from "./golden-coverage";

const GOLDEN_FIXTURE_SCHEMA = "2";

interface ExpectedStatutoryRank {
  dueReached: boolean;
  debtorBenefitRank: number;
  dueAt: string;
  proportionalShare?: { numerator: number; denominator: number };
  priorityLabel: string;
}

interface ClaimExpected {
  claimId: string;
  /** 채권 이름. 입력에 없으면 null. */
  name: string | null;
  /**
   * 제477조 충당 순위. 변제 재원이 바닥나 라운드에 들지 못한 채권은 null 이다.
   * 키를 생략하지 않고 null 을 박아 누락과 의도적 부재를 구분한다.
   */
  statutoryRank: ExpectedStatutoryRank | null;
  costApplied: number;
  interestApplied: number;
  principalApplied: number;
  costBalanceAfter: number;
  interestBalanceAfter: number;
  principalBalanceAfter: number;
  totalApplied: number;
}

interface ExpectedShape {
  dataVersion: string;
  payment: {
    amount: number;
    allocationType: string;
    appliedAmount: number;
    unappliedAmount: number;
  };
  totals: {
    totalCostApplied: number;
    totalInterestApplied: number;
    totalPrincipalApplied: number;
    remainingCost: number;
    remainingInterest: number;
    remainingPrincipal: number;
    remainingGrandTotal: number;
  };
  claims: ClaimExpected[];
}

interface GoldenCase {
  schemaVersion: string;
  id: string;
  title: string;
  source: string;
  notes?: string;
  input: AppropriationInput;
  expected: ExpectedShape;
}

const modules = import.meta.glob<GoldenCase>("./golden/appropriation/*.json", {
  eager: true,
  import: "default",
});

const cases: GoldenCase[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

const COVERAGE: GoldenCoverage = {
  pinned: [
    "dataVersion",
    "disclaimer",
    "payment.amount",
    "payment.allocationType",
    "payment.appliedAmount",
    "payment.unappliedAmount",
    "totals.totalCostApplied",
    "totals.totalInterestApplied",
    "totals.totalPrincipalApplied",
    "totals.remainingCost",
    "totals.remainingInterest",
    "totals.remainingPrincipal",
    "totals.remainingGrandTotal",
    "claims[].claimId",
    "claims[].name",
    "claims[].costApplied",
    "claims[].interestApplied",
    "claims[].principalApplied",
    "claims[].costBalanceAfter",
    "claims[].interestBalanceAfter",
    "claims[].principalBalanceAfter",
    "claims[].totalApplied",
    "claims[].statutoryRank.dueReached",
    "claims[].statutoryRank.debtorBenefitRank",
    "claims[].statutoryRank.dueAt",
    "claims[].statutoryRank.priorityLabel",
    "claims[].statutoryRank.proportionalShare.numerator",
    "claims[].statutoryRank.proportionalShare.denominator",
  ],
  unpinned: {
    computedAt: "실행 시각이라 비결정이다.",
  },
};

describe("appropriation golden cases (v0.4.0-A — engine 코어)", () => {
  it("loads at least 5 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it("all cases match GOLDEN_FIXTURE_SCHEMA", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
    }
  });

  it("결과의 모든 필드가 골든 선언에 잡힌다 (미검사 필드 0)", () => {
    const results = cases.map((c) => computeAppropriation(c.input));
    expect(findCoverageViolations(results, COVERAGE)).toEqual([]);
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = computeAppropriation(c.input);
      expect(result.dataVersion, `${c.id} dataVersion`).toBe(c.expected.dataVersion);
      expect(result.payment.amount, `${c.id} payment.amount`).toBe(c.expected.payment.amount);
      expect(result.payment.allocationType, `${c.id} payment.allocationType`).toBe(
        c.expected.payment.allocationType,
      );
      expect(result.payment.appliedAmount, `${c.id} payment.appliedAmount`).toBe(
        c.expected.payment.appliedAmount,
      );
      expect(result.payment.unappliedAmount, `${c.id} payment.unappliedAmount`).toBe(
        c.expected.payment.unappliedAmount,
      );

      expect(result.disclaimer, `${c.id} disclaimer`).toBe(STANDARD_DISCLAIMER);

      expect(result.totals, `${c.id} totals`).toEqual(c.expected.totals);

      // 충당 순위는 결과 배열의 순서로 드러나므로 claimId 로 찾지 않고 위치까지 대조한다.
      expect(
        result.claims.map((claim) => claim.claimId),
        `${c.id} claims 순서`,
      ).toEqual(c.expected.claims.map((expected) => expected.claimId));

      for (let i = 0; i < c.expected.claims.length; i++) {
        const expected = c.expected.claims[i]!;
        const actual = result.claims[i]!;
        expect(actual.name, `${c.id} ${expected.claimId} name`).toBe(expected.name ?? undefined);
        expect(actual.statutoryRank, `${c.id} ${expected.claimId} statutoryRank`).toEqual(
          expected.statutoryRank ?? undefined,
        );
        expect(actual.costApplied, `${c.id} ${expected.claimId} costApplied`).toBe(
          expected.costApplied,
        );
        expect(actual.interestApplied, `${c.id} ${expected.claimId} interestApplied`).toBe(
          expected.interestApplied,
        );
        expect(actual.principalApplied, `${c.id} ${expected.claimId} principalApplied`).toBe(
          expected.principalApplied,
        );
        expect(actual.costBalanceAfter, `${c.id} ${expected.claimId} costBalanceAfter`).toBe(
          expected.costBalanceAfter,
        );
        expect(
          actual.interestBalanceAfter,
          `${c.id} ${expected.claimId} interestBalanceAfter`,
        ).toBe(expected.interestBalanceAfter);
        expect(
          actual.principalBalanceAfter,
          `${c.id} ${expected.claimId} principalBalanceAfter`,
        ).toBe(expected.principalBalanceAfter);
        expect(actual.totalApplied, `${c.id} ${expected.claimId} totalApplied`).toBe(
          expected.totalApplied,
        );
      }
    });
  }
});
