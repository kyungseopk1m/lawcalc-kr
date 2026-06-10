import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import {
  applyCaseCalculations,
  buildCaseLcalcFile,
  collectCaseCalculations,
  markCaseCalculationsSaved,
  registerCaseSlot,
} from "./case-file";
import type { LcalcFile } from "./ipc";
import { migrateLcalcFile } from "./lcalc-migrations";
import {
  parseLoadedCaseLcalcInput,
  parseLoadedLcalcInput,
  validateLcalcEnvelope,
} from "./lcalc-validation";

function buildInterestFile(): LcalcFile {
  const options = {
    mode: "period" as const,
    leapYear: "fixed365" as const,
    includeFirstDay: false,
    rounding: "floor" as const,
  };
  return {
    schemaVersion: "3",
    kind: "interest",
    envelopeFeatures: ["interest@1"],
    dataVersions: { interest: "legal-rates/v1.0.0" },
    payload: {
      appVersion: "0.8.0",
      dataVersion: "legal-rates/v1.0.0",
      createdAt: "2026-06-10T12:00:00.000Z",
      input: {
        principal: 1_000_000,
        startDate: "2026-01-01",
        endDate: "2026-12-31",
        legalRatePreset: "civil",
        options,
      },
      options,
      result: {
        principal: 1_000_000,
        segments: [],
        totalInterest: 0,
        grandTotal: 1_000_000,
        options,
        dataVersion: "legal-rates/v1.0.0",
        computedAt: "2026-06-10T12:00:00.000Z",
        disclaimer: STANDARD_DISCLAIMER,
      },
      disclaimer: STANDARD_DISCLAIMER,
    },
  };
}

function buildInheritanceFile(): LcalcFile {
  return {
    schemaVersion: "3",
    kind: "inheritance",
    envelopeFeatures: ["inheritance@1"],
    dataVersions: { inheritance: "inheritance/v1.0.0" },
    payload: {
      appVersion: "0.8.0",
      dataVersion: "inheritance/v1.0.0",
      createdAt: "2026-06-10T12:00:00.000Z",
      input: { decedent: { deceasedAt: "2026-01-01" } },
      disclaimer: STANDARD_DISCLAIMER,
    },
  };
}

describe("buildCaseLcalcFile", () => {
  it("merges capability ids and dataVersions from nested calculations", () => {
    const file = buildCaseLcalcFile(
      { title: "2026가단12345 대여금" },
      { interest: buildInterestFile(), inheritance: buildInheritanceFile() },
      "0.9.0",
    );

    expect(file.kind).toBe("case");
    expect(file.envelopeFeatures).toContain("case@1");
    expect(file.envelopeFeatures).toContain("interest@1");
    expect(file.envelopeFeatures).toContain("inheritance@1");
    expect(file.dataVersions).toEqual({
      interest: "legal-rates/v1.0.0",
      inheritance: "inheritance/v1.0.0",
    });
    expect(() => validateLcalcEnvelope(file)).not.toThrow();
  });

  it("round-trips caseInfo and calculations through parseLoadedCaseLcalcInput", () => {
    const file = buildCaseLcalcFile(
      { caseNumber: "2026가단12345", title: "대여금" },
      { interest: buildInterestFile() },
      "0.9.0",
    );

    const loaded = parseLoadedCaseLcalcInput(file);
    expect(loaded.caseInfo).toEqual({ caseNumber: "2026가단12345", title: "대여금" });
    expect(Object.keys(loaded.calculations)).toEqual(["interest"]);
    expect(loaded.calculations.interest?.kind).toBe("interest");
  });

  it("passes a v3 case envelope through migrateLcalcFile unchanged", () => {
    const file = buildCaseLcalcFile({}, { interest: buildInterestFile() }, "0.9.0");
    expect(migrateLcalcFile(file)).toEqual(file);
  });
});

describe("case envelope validation", () => {
  it("rejects a case file without calculations", () => {
    const file = buildCaseLcalcFile({}, {}, "0.9.0");
    expect(() => validateLcalcEnvelope(file)).toThrow("저장된 계산이 없습니다");
  });

  it("rejects a nested calculation whose kind mismatches its key", () => {
    const file = buildCaseLcalcFile({}, { interest: buildInheritanceFile() }, "0.9.0");
    expect(() => validateLcalcEnvelope(file)).toThrow('kind 가 "interest" 와 일치해야 합니다');
  });

  it("rejects unknown calculation keys, including nested case files", () => {
    const base = buildCaseLcalcFile({}, { interest: buildInterestFile() }, "0.9.0");
    if (base.kind !== "case") throw new Error("expected case file");
    const nested = {
      ...base,
      payload: {
        ...base.payload,
        calculations: { case: buildCaseLcalcFile({}, { interest: buildInterestFile() }, "0.9.0") },
      },
    } as unknown as LcalcFile;
    expect(() => validateLcalcEnvelope(nested)).toThrow("지원하지 않는 계산 유형");
  });

  it("guides the user to 사건 열기 when a case file is opened in a calculator tab", () => {
    const file = buildCaseLcalcFile({}, { interest: buildInterestFile() }, "0.9.0");
    expect(() => parseLoadedLcalcInput(file)).toThrow("사건 열기");
  });
});

describe("case slot registry", () => {
  it("collects ok/pristine/invalid outcomes, applies and marks saved per slot", () => {
    const interestFile = buildInterestFile();
    const appliedFiles: LcalcFile[] = [];
    let savedCount = 0;

    const unregisterInterest = registerCaseSlot("interest", {
      collect: () => ({ status: "ok", file: interestFile }),
      apply: (file) => {
        appliedFiles.push(file);
      },
      markSaved: () => {
        savedCount += 1;
      },
    });
    const unregisterInheritance = registerCaseSlot("inheritance", {
      collect: () => ({ status: "pristine" }),
      apply: () => undefined,
      markSaved: () => undefined,
    });
    const unregisterAppropriation = registerCaseSlot("appropriation", {
      collect: () => ({ status: "invalid" }),
      apply: () => undefined,
      markSaved: () => undefined,
    });

    try {
      const collected = collectCaseCalculations();
      expect(collected.included).toEqual(["interest"]);
      expect(collected.invalid).toEqual(["appropriation"]);
      expect(collected.calculations.interest).toBe(interestFile);

      const applied = applyCaseCalculations({ interest: interestFile });
      expect(applied).toEqual(["interest"]);
      expect(appliedFiles).toEqual([interestFile]);

      markCaseCalculationsSaved(collected.included);
      expect(savedCount).toBe(1);
    } finally {
      unregisterInterest();
      unregisterInheritance();
      unregisterAppropriation();
    }
  });
});
