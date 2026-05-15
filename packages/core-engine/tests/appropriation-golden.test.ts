import { describe, expect, it } from "vitest";

import { computeAppropriation, type AppropriationInput } from "../src";

const GOLDEN_FIXTURE_SCHEMA = "1";

interface ClaimExpected {
  claimId: string;
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

describe("appropriation golden cases (v0.4.0-A — engine 코어)", () => {
  it("loads at least 5 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(5);
  });

  it("all cases match GOLDEN_FIXTURE_SCHEMA", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
    }
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

      expect(result.totals, `${c.id} totals`).toEqual(c.expected.totals);

      expect(result.claims, `${c.id} claims.length`).toHaveLength(c.expected.claims.length);
      for (let i = 0; i < c.expected.claims.length; i++) {
        const expected = c.expected.claims[i]!;
        const actual = result.claims.find((claim) => claim.claimId === expected.claimId);
        expect(actual, `${c.id} claim ${expected.claimId}`).toBeDefined();
        if (!actual) continue;
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
