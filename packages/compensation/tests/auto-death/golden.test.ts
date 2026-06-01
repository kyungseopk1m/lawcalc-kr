import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { computeCompensationDeath } from "../../src/auto-death/compute";
import type { CompensationAutoDeathInput } from "../../src/auto-death/types";

const GOLDEN_FIXTURE_SCHEMA = "1";
const FIXED_NOW = () => new Date("2026-06-02T00:00:00.000Z");

interface ExpectedInheritanceShare {
  name: string;
  numerator: number;
  denominator: number;
  amountWon: number;
}

interface ExpectedShape {
  segmentCount: number;
  segmentEndMonths: number[];
  livingCostDeductionRatio: number;
  lostIncomeSubtotalWon: number;
  solatiumWon: number;
  pecuniaryDamagesSubtotalWon: number;
  faultOffset: { ratio: number; afterWon: number };
  funeralExpenseWon: number;
  deductions: {
    ratioSubtotalWon: number;
    absoluteSubtotalWon: number;
    afterWon: number;
  };
  finalWon: number;
  hoffman240CapCappedAtIndex: number | null;
  inheritanceShares: ExpectedInheritanceShare[] | null;
  dataVersions: {
    laborRates: string;
    lifeExpectancy: string;
    hoffman: string;
    leibniz: string;
  };
}

interface GoldenCase {
  schemaVersion: string;
  id: string;
  title: string;
  source: string;
  notes?: string;
  input: CompensationAutoDeathInput;
  expected: ExpectedShape;
  metadata: { oracle: string; derivedAt: string; derivedBy: string };
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const modules = import.meta.glob<GoldenCase>("../golden/auto-death/*.json", {
  eager: true,
  import: "default",
});

const cases: GoldenCase[] = Object.entries(
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  modules,
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

/**
 * compensation 자×사망 도메인 골든 — v0.6.0 트랙 A 2 fixture.
 * oracle = `"manual-derivation"` 단독 (`compensation-death-golden-derivation-2026-06-02.md`).
 */
describe("compensation death golden cases (v0.6.0-A — 자×사망 엔진 derivation)", () => {
  it("loads exactly 2 cases", () => {
    expect(cases).toHaveLength(2);
  });

  it("all fixtures match GOLDEN_FIXTURE_SCHEMA and use manual-derivation oracle", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
      expect(c.metadata.oracle, `${c.id} oracle`).toBe("manual-derivation");
    }
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = computeCompensationDeath(c.input, { now: FIXED_NOW });
      expect(result.segments, `${c.id} segments length`).toHaveLength(c.expected.segmentCount);
      expect(
        result.segments.map((s) => s.endMonth),
        `${c.id} segmentEndMonths`,
      ).toEqual(c.expected.segmentEndMonths);
      expect(result.livingCostDeductionRatio, `${c.id} livingCostRatio`).toBe(
        c.expected.livingCostDeductionRatio,
      );
      expect(result.lostIncomeSubtotalWon, `${c.id} lostIncomeSubtotal`).toBe(
        c.expected.lostIncomeSubtotalWon,
      );
      expect(result.solatiumWon, `${c.id} solatium`).toBe(c.expected.solatiumWon);
      expect(result.pecuniaryDamagesSubtotalWon, `${c.id} pecuniarySubtotal`).toBe(
        c.expected.pecuniaryDamagesSubtotalWon,
      );
      expect(result.faultOffset.ratio, `${c.id} faultRatio`).toBe(c.expected.faultOffset.ratio);
      expect(result.faultOffset.afterWon, `${c.id} faultAfter`).toBe(
        c.expected.faultOffset.afterWon,
      );
      expect(result.funeralExpenseWon, `${c.id} funeral`).toBe(c.expected.funeralExpenseWon);
      expect(result.deductions.ratioSubtotalWon, `${c.id} ratioSubtotal`).toBe(
        c.expected.deductions.ratioSubtotalWon,
      );
      expect(result.deductions.absoluteSubtotalWon, `${c.id} absoluteSubtotal`).toBe(
        c.expected.deductions.absoluteSubtotalWon,
      );
      expect(result.deductions.afterWon, `${c.id} deductionsAfter`).toBe(
        c.expected.deductions.afterWon,
      );
      expect(result.finalWon, `${c.id} finalWon`).toBe(c.expected.finalWon);
      expect(result.hoffman240Cap.cappedAtIndex, `${c.id} cappedAtIndex`).toBe(
        c.expected.hoffman240CapCappedAtIndex,
      );
      if (c.expected.inheritanceShares === null) {
        expect(result.inheritanceShares, `${c.id} inheritanceShares`).toBeUndefined();
      } else {
        expect(
          result.inheritanceShares?.map((s) => ({
            name: s.name,
            numerator: s.numerator,
            denominator: s.denominator,
            amountWon: s.amountWon,
          })),
          `${c.id} inheritanceShares`,
        ).toEqual(c.expected.inheritanceShares);
        const sum = (result.inheritanceShares ?? []).reduce((acc, s) => acc + s.amountWon, 0);
        expect(sum, `${c.id} inheritance round-trip`).toBe(result.finalWon);
      }
      expect(result.dataVersions, `${c.id} dataVersions`).toEqual(c.expected.dataVersions);
      expect(result.disclaimer, `${c.id} disclaimer`).toBe(STANDARD_DISCLAIMER);
    });
  }
});
