import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { computeCompensation } from "../../src/auto-injury/compute";
import type { CompensationInput } from "../../src/auto-injury/types";
import { findCoverageViolations, type GoldenCoverage } from "@golden-coverage";

const GOLDEN_FIXTURE_SCHEMA = "2";
const FIXED_NOW = () => new Date("2026-05-18T00:00:00.000Z");

interface ExpectedSegment {
  startMonth: number;
  endMonth: number;
  lossRate: number;
  dailyWageWon: number;
  monthlyWageWon: number;
  rawHoffman: number;
  appliedHoffman: number;
  amountFloorWon: number;
}

interface ExpectedAttendantCare {
  pastWon: number;
  futureWon: number;
  subtotalWon: number;
  hoffman240CappedAtIndex: number | null;
}

interface ExpectedTreatment {
  pastWon: number;
  futureWon: number;
  subtotalWon: number;
  valueSum20Capped: boolean;
}

interface ExpectedShape {
  accidentType?: "auto" | "industrial";
  /** 구간 전체를 고정한다. 소계만 맞고 구간 내부가 어긋나는 회귀를 잡기 위해서다. */
  segments: ExpectedSegment[];
  combinedLossRate: number;
  hoffman240CapAppliedHoffman: number[];
  lostIncomeSubtotalWon: number;
  solatiumWon: number;
  industrialBenefit?: { benefitWon: number; deductedWon: number; lostIncomeAfterWon: number };
  pecuniaryDamagesSubtotalWon: number;
  faultOffset: { ratio: number; beforeWon: number; afterWon: number };
  deductions: {
    ratioSubtotalWon: number;
    absoluteSubtotalWon: number;
    industrialBenefitWon?: number;
    afterWon: number;
  };
  finalWon: number;
  hoffman240CapCappedAtIndex: number | null;
  otherDamagesSubtotalWon?: number;
  otherDamages?: {
    attendantCareWon: number;
    treatmentWon: number;
    applianceWon: number;
    subtotalWon: number;
    /** 항목이 입력에 없으면 null. 키 생략과 의도적 부재를 구분한다. */
    attendantCare: ExpectedAttendantCare | null;
    treatment: ExpectedTreatment | null;
    appliance: ExpectedTreatment | null;
  };
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
const COVERAGE: GoldenCoverage = {
  pinned: [
    "accidentType",
    "combinedLossRate",
    "lostIncomeSubtotalWon",
    "solatiumWon",
    "pecuniaryDamagesSubtotalWon",
    "otherDamagesSubtotalWon",
    "finalWon",
    "disclaimer",
    "segments[].startMonth",
    "segments[].endMonth",
    "segments[].lossRate",
    "segments[].dailyWageWon",
    "segments[].monthlyWageWon",
    "segments[].rawHoffman",
    "segments[].appliedHoffman",
    "segments[].amountFloorWon",
    "hoffman240Cap.appliedHoffman[]",
    "hoffman240Cap.cappedAtIndex",
    "faultOffset.ratio",
    "faultOffset.beforeWon",
    "faultOffset.afterWon",
    "deductions.ratioSubtotalWon",
    "deductions.absoluteSubtotalWon",
    "deductions.afterWon",
    "industrialBenefit.benefitWon",
    "industrialBenefit.deductedWon",
    "industrialBenefit.lostIncomeAfterWon",
    "otherDamages.attendantCareWon",
    "otherDamages.treatmentWon",
    "otherDamages.applianceWon",
    "otherDamages.subtotalWon",
    "otherDamages.attendantCare.pastWon",
    "otherDamages.attendantCare.futureWon",
    "otherDamages.attendantCare.subtotalWon",
    "otherDamages.attendantCare.hoffman240CappedAtIndex",
    "otherDamages.treatment.pastWon",
    "otherDamages.treatment.futureWon",
    "otherDamages.treatment.subtotalWon",
    "otherDamages.treatment.valueSum20Capped",
    "otherDamages.appliance.pastWon",
    "otherDamages.appliance.futureWon",
    "otherDamages.appliance.subtotalWon",
    "otherDamages.appliance.valueSum20Capped",
    "dataVersions.laborRates",
    "dataVersions.lifeExpectancy",
    "dataVersions.hoffman",
    "dataVersions.leibniz",
  ],
  unpinned: {
    computedAt: "실행 시각이라 비결정이다.",
  },
};

describe("compensation golden cases (v0.5.0-A 코어 + v0.7.0 산재 — 매뉴얼 derivation)", () => {
  it("loads exactly 9 cases", () => {
    expect(cases).toHaveLength(9);
  });

  it("all fixtures match GOLDEN_FIXTURE_SCHEMA and use manual-derivation oracle", () => {
    for (const c of cases) {
      expect(c.schemaVersion, `${c.id} schemaVersion`).toBe(GOLDEN_FIXTURE_SCHEMA);
      expect(c.metadata.oracle, `${c.id} oracle`).toBe("manual-derivation");
    }
  });

  it("결과의 모든 필드가 골든 선언에 잡힌다 (미검사 필드 0)", () => {
    const results = cases.map((c) => computeCompensation(c.input, { now: FIXED_NOW }));
    expect(findCoverageViolations(results, COVERAGE)).toEqual([]);
  });

  for (const c of cases) {
    it(`${c.id}: ${c.title}`, () => {
      const result = computeCompensation(c.input, { now: FIXED_NOW });
      expect(result.segments, `${c.id} segments`).toEqual(c.expected.segments);
      expect(result.combinedLossRate, `${c.id} combinedLossRate`).toBe(c.expected.combinedLossRate);
      expect(result.lostIncomeSubtotalWon, `${c.id} lostIncomeSubtotal`).toBe(
        c.expected.lostIncomeSubtotalWon,
      );
      expect(result.solatiumWon, `${c.id} solatium`).toBe(c.expected.solatiumWon);
      expect(result.pecuniaryDamagesSubtotalWon, `${c.id} pecuniarySubtotal`).toBe(
        c.expected.pecuniaryDamagesSubtotalWon,
      );
      expect(result.faultOffset.ratio, `${c.id} faultRatio`).toBe(c.expected.faultOffset.ratio);
      expect(result.faultOffset.beforeWon, `${c.id} faultBefore`).toBe(
        c.expected.faultOffset.beforeWon,
      );
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
      expect(result.industrialBenefit, `${c.id} industrialBenefit`).toEqual(
        c.expected.industrialBenefit,
      );
      expect(result.deductions.industrialBenefitWon, `${c.id} legacy industrialBenefitWon`).toBe(
        c.expected.deductions.industrialBenefitWon,
      );
      expect(result.deductions.afterWon, `${c.id} deductionsAfter`).toBe(
        c.expected.deductions.afterWon,
      );
      expect(result.finalWon, `${c.id} finalWon`).toBe(c.expected.finalWon);
      expect(result.hoffman240Cap.cappedAtIndex, `${c.id} cappedAtIndex`).toBe(
        c.expected.hoffman240CapCappedAtIndex,
      );
      expect(result.hoffman240Cap.appliedHoffman, `${c.id} appliedHoffman`).toEqual(
        c.expected.hoffman240CapAppliedHoffman,
      );
      expect(result.otherDamagesSubtotalWon, `${c.id} otherDamagesSubtotal`).toBe(
        c.expected.otherDamagesSubtotalWon,
      );
      if (c.expected.otherDamages) {
        const expectedOther = c.expected.otherDamages;
        expect(result.otherDamages?.attendantCareWon, `${c.id} attendantCareWon`).toBe(
          expectedOther.attendantCareWon,
        );
        expect(result.otherDamages?.treatmentWon, `${c.id} treatmentWon`).toBe(
          expectedOther.treatmentWon,
        );
        expect(result.otherDamages?.applianceWon, `${c.id} applianceWon`).toBe(
          expectedOther.applianceWon,
        );
        expect(result.otherDamages?.subtotalWon, `${c.id} otherDamages.subtotalWon`).toBe(
          expectedOther.subtotalWon,
        );
        expect(result.otherDamages?.attendantCare, `${c.id} attendantCare`).toEqual(
          expectedOther.attendantCare ?? undefined,
        );
        expect(result.otherDamages?.treatment, `${c.id} treatment`).toEqual(
          expectedOther.treatment ?? undefined,
        );
        expect(result.otherDamages?.appliance, `${c.id} appliance`).toEqual(
          expectedOther.appliance ?? undefined,
        );
      } else {
        expect(result.otherDamages, `${c.id} otherDamages 부재`).toBeUndefined();
      }
      expect(result.dataVersions, `${c.id} dataVersions`).toEqual(c.expected.dataVersions);
      expect(result.disclaimer, `${c.id} disclaimer`).toBe(STANDARD_DISCLAIMER);
    });
  }
});
