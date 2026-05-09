import { describe, expect, it } from "vitest";

import { calculateInheritance, type InheritanceInput } from "../src";

const GOLDEN_FIXTURE_SCHEMA = "1";

interface SuccessExpected {
  kind: "success";
  dataVersion: string;
  shares: Array<{ name: string; numerator: number; denominator: number }>;
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
 * (success: shares 분수 / error: throw message). 출처:
 * `for-claude/personal/lawcalc-kr/docs/plans/inheritance-input-model-spike-2026-05-09.md` §7.
 */
describe("inheritance golden cases (v0.2 첫 PR — 도메인 코어)", () => {
  it("loads at least 8 cases", () => {
    expect(cases.length).toBeGreaterThanOrEqual(8);
  });

  it("all cases match GOLDEN_FIXTURE_SCHEMA", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
    }
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      if (c.expected.kind === "error") {
        expect(() => calculateInheritance(c.input)).toThrow(c.expected.message);
        return;
      }

      const result = calculateInheritance(c.input);
      expect(result.dataVersion).toBe(c.expected.dataVersion);
      expect(result.shares).toHaveLength(c.expected.shares.length);

      for (let i = 0; i < c.expected.shares.length; i++) {
        const expected = c.expected.shares[i]!;
        const actual = result.shares[i]!;
        expect(actual.name, `${c.id} share[${i}].name`).toBe(expected.name);
        expect(actual.numerator, `${c.id} share[${i}].numerator`).toBe(expected.numerator);
        expect(actual.denominator, `${c.id} share[${i}].denominator`).toBe(expected.denominator);
      }
    });
  }
});
