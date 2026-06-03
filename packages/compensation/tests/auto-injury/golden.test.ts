import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";

const GOLDEN_FIXTURE_SCHEMA = "1";
const FIXED_NOW = () => new Date("2026-05-18T00:00:00.000Z");

interface ExpectedShape {
  accidentType?: "auto" | "industrial";
  segmentCount: number;
  segmentEndMonths: number[];
  lostIncomeSubtotalWon: number;
  solatiumWon: number;
  pecuniaryDamagesSubtotalWon: number;
  faultOffset: { ratio: number; afterWon: number };
  deductions: {
    ratioSubtotalWon: number;
    absoluteSubtotalWon: number;
    industrialBenefitWon?: number;
    afterWon: number;
  };
  finalWon: number;
  hoffman240CapCappedAtIndex: number | null;
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
  input: CompensationInput;
  expected: ExpectedShape;
  metadata: { oracle: string; derivedAt: string; derivedBy: string };
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const modules = import.meta.glob<GoldenCase>("../golden/auto-injury/*.json", {
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
 * compensation 도메인 골든 — v0.5.0 트랙 A 5 fixture + v0.7.0 산재 1 fixture(case-010).
 * oracle = `"manual-derivation"` 단독 (`compensation-golden-capture-result-2026-05-18.md` /
 * `compensation-industrial-golden-derivation-2026-06-02.md`).
 */
describe("compensation golden cases (v0.5.0-A 코어 + v0.7.0 산재 — 매뉴얼 derivation)", () => {
  it("loads exactly 6 cases", () => {
    expect(cases).toHaveLength(6);
  });

  it("all fixtures match GOLDEN_FIXTURE_SCHEMA and use manual-derivation oracle", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
      expect(c.metadata.oracle, `${c.id} oracle`).toBe("manual-derivation");
    }
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = computeCompensation(c.input, { now: FIXED_NOW });
      expect(result.segments, `${c.id} segments length`).toHaveLength(c.expected.segmentCount);
      expect(
        result.segments.map((s) => s.endMonth),
        `${c.id} segmentEndMonths`,
      ).toEqual(c.expected.segmentEndMonths);
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
      expect(result.deductions.ratioSubtotalWon, `${c.id} ratioSubtotal`).toBe(
        c.expected.deductions.ratioSubtotalWon,
      );
      expect(result.deductions.absoluteSubtotalWon, `${c.id} absoluteSubtotal`).toBe(
        c.expected.deductions.absoluteSubtotalWon,
      );
      expect(result.accidentType, `${c.id} accidentType`).toBe(c.expected.accidentType);
      expect(result.deductions.industrialBenefitWon, `${c.id} industrialBenefit`).toBe(
        c.expected.deductions.industrialBenefitWon,
      );
      expect(result.deductions.afterWon, `${c.id} deductionsAfter`).toBe(
        c.expected.deductions.afterWon,
      );
      expect(result.finalWon, `${c.id} finalWon`).toBe(c.expected.finalWon);
      expect(result.hoffman240Cap.cappedAtIndex, `${c.id} cappedAtIndex`).toBe(
        c.expected.hoffman240CapCappedAtIndex,
      );
      expect(result.dataVersions, `${c.id} dataVersions`).toEqual(c.expected.dataVersions);
      expect(result.disclaimer, `${c.id} disclaimer`).toBe(STANDARD_DISCLAIMER);
    });
  }
});
