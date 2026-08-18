import { describe, expect, it } from "vitest";

import { calculateInheritance, STANDARD_DISCLAIMER, type InheritanceInput } from "../src";
import { findCoverageViolations, type GoldenCoverage } from "./golden-coverage";

const GOLDEN_FIXTURE_SCHEMA = "2";

interface SuccessExpected {
  kind: "success";
  dataVersion: string;
  shares: Array<{
    name: string;
    numerator: number;
    denominator: number;
    rawNumerator: number;
    rawDenominator: number;
  }>;
}

interface ErrorExpected {
  kind: "error";
  message: string;
}

interface GoldenCase {
  schemaVersion: string;
  id: string;
  title: string;
  source: string;
  notes?: string;
  input: InheritanceInput;
  expected: SuccessExpected | ErrorExpected;
}

const modules = import.meta.glob<GoldenCase>("./golden/inheritance/*.json", {
  eager: true,
  import: "default",
});

const cases: GoldenCase[] = Object.entries(modules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, value]) => value);

/**
 * inheritance 도메인 골든 — v0.2 첫 PR 8 케이스. interest 골든과 schema 다름
 * (success: shares 분수 / error: throw message).
 */
const COVERAGE: GoldenCoverage = {
  pinned: [
    "dataVersion",
    "disclaimer",
    "decedent.name",
    "decedent.deceasedAt",
    "shares[].name",
    "shares[].numerator",
    "shares[].denominator",
    "shares[].rawNumerator",
    "shares[].rawDenominator",
  ],
  unpinned: {
    computedAt: "실행 시각이라 비결정이다.",
  },
};

describe("inheritance golden cases (v0.2 첫 PR — 도메인 코어)", () => {
  it("loads at least 8 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it("all cases match GOLDEN_FIXTURE_SCHEMA", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
    }
  });

  it("결과의 모든 필드가 골든 선언에 잡힌다 (미검사 필드 0)", () => {
    const results = cases
      .filter((c) => c.expected.kind === "success")
      .map((c) => calculateInheritance(c.input));
    expect(findCoverageViolations(results, COVERAGE)).toEqual([]);
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      if (c.expected.kind === "error") {
        expect(() => calculateInheritance(c.input)).toThrow(c.expected.message);
        return;
      }

      const result = calculateInheritance(c.input);
      expect(result.dataVersion).toBe(c.expected.dataVersion);
      expect(result.disclaimer, `${c.id} disclaimer`).toBe(STANDARD_DISCLAIMER);
      expect(result.decedent.name, `${c.id} decedent.name`).toBe(c.input.decedent.name);
      expect(result.decedent.deceasedAt, `${c.id} decedent.deceasedAt`).toBe(
        c.input.decedent.deceasedAt,
      );
      expect(result.shares).toHaveLength(c.expected.shares.length);

      for (let i = 0; i < c.expected.shares.length; i++) {
        const expected = c.expected.shares[i]!;
        const actual = result.shares[i]!;
        expect(actual.name, `${c.id} share[${i}].name`).toBe(expected.name);
        expect(actual.numerator, `${c.id} share[${i}].numerator`).toBe(expected.numerator);
        expect(actual.denominator, `${c.id} share[${i}].denominator`).toBe(expected.denominator);
        expect(actual.rawNumerator, `${c.id} share[${i}].rawNumerator`).toBe(expected.rawNumerator);
        expect(actual.rawDenominator, `${c.id} share[${i}].rawDenominator`).toBe(
          expected.rawDenominator,
        );
      }
    });
  }
});
