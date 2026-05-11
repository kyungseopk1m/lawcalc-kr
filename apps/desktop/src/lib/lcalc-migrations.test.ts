import { describe, expect, it } from "vitest";

import {
  STANDARD_DISCLAIMER,
  calculateInterest,
  computeLitigationCost,
} from "@lawcalc-kr/core-engine";

import type { LcalcFile, LoadableLcalcFile } from "./ipc";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "./lcalc-migrations";
import {
  MAX_NOTE_LENGTH,
  parseLoadedInheritanceLcalcInput,
  parseLoadedLitigationCostLcalcInput,
  parseLoadedLcalcInput,
  validateLcalcEnvelope,
} from "./lcalc-validation";

const sampleV1: Extract<LoadableLcalcFile, { schemaVersion: "1" }> = {
  schemaVersion: "1",
  appVersion: "0.1.2",
  dataVersion: "legal-rates/v1.0.0",
  createdAt: "2026-05-09T12:00:00.000Z",
  input: {
    principal: 1_000_000,
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    legalRatePreset: "civil",
    options: {
      mode: "period",
      leapYear: "fixed365",
      includeFirstDay: false,
      rounding: "floor",
    },
  },
  options: {
    mode: "period",
    leapYear: "fixed365",
    includeFirstDay: false,
    rounding: "floor",
  },
  note: "legacy note",
  result: {
    principal: 1_000_000,
    segments: [],
    totalInterest: 0,
    grandTotal: 1_000_000,
    options: {
      mode: "period",
      leapYear: "fixed365",
      includeFirstDay: false,
      rounding: "floor",
    },
    dataVersion: "legal-rates/v1.0.0",
    computedAt: "2026-05-09T12:00:00.000Z",
  },
  disclaimer: STANDARD_DISCLAIMER,
};

const sampleV2: Extract<LoadableLcalcFile, { schemaVersion: "2" }> = {
  schemaVersion: "2",
  kind: "interest",
  payload: {
    appVersion: "0.1.2",
    dataVersion: "legal-rates/v1.0.0",
    createdAt: "2026-05-09T12:00:00.000Z",
    input: sampleV1.input,
    options: sampleV1.options,
    result: sampleV1.result,
    note: "legacy note",
    disclaimer: STANDARD_DISCLAIMER,
  },
};

const sampleV3: LcalcFile = {
  schemaVersion: "3",
  kind: "interest",
  envelopeFeatures: ["interest@1"],
  dataVersions: { interest: "legal-rates/v1.0.0" },
  payload: sampleV2.payload,
};

describe("migrateLcalcFile", () => {
  it("wraps legacy v1 interest files into the v3 envelope with capability meta", () => {
    expect(migrateLcalcFile(sampleV1)).toEqual(sampleV3);
  });

  it("preserves v1 input, options, and note fields exactly through the chain", () => {
    const migrated = migrateLcalcFile(sampleV1);

    expect(migrated.schemaVersion).toBe(CURRENT_LCALC_SCHEMA_VERSION);
    expect(migrated.kind).toBe("interest");
    if (migrated.kind !== "interest") {
      throw new Error("unexpected kind");
    }
    expect(migrated.payload.input).toEqual(sampleV1.input);
    expect(migrated.payload.options).toEqual(sampleV1.options);
    expect(migrated.payload.note).toBe(sampleV1.note);
    expect(migrated.envelopeFeatures).toEqual(["interest@1"]);
    expect(migrated.dataVersions).toEqual({ interest: "legal-rates/v1.0.0" });
  });

  it("hoists v2 interest payload.dataVersion into v3 envelope-level dataVersions", () => {
    const migrated = migrateLcalcFile(sampleV2);

    expect(migrated.schemaVersion).toBe("3");
    expect(migrated.envelopeFeatures).toEqual(["interest@1"]);
    expect(migrated.dataVersions).toEqual({ interest: "legal-rates/v1.0.0" });
    expect(migrated.payload).toEqual(sampleV2.payload);
  });

  it("hoists v2 inheritance payload.dataVersion into v3 envelope-level dataVersions", () => {
    const v2Inheritance: Extract<LoadableLcalcFile, { schemaVersion: "2" }> = {
      schemaVersion: "2",
      kind: "inheritance",
      payload: {
        appVersion: "0.1.2",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-05-09T12:00:00.000Z",
        input: { decedent: { deceasedAt: "2026-01-01" } },
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    const migrated = migrateLcalcFile(v2Inheritance);

    expect(migrated.schemaVersion).toBe("3");
    expect(migrated.kind).toBe("inheritance");
    expect(migrated.envelopeFeatures).toEqual(["inheritance@1"]);
    expect(migrated.dataVersions).toEqual({ inheritance: "inheritance/v1.0.0" });
  });

  it("passes a v3 envelope through migrateLcalcFile unchanged", () => {
    expect(migrateLcalcFile(sampleV3)).toEqual(sampleV3);
  });

  it("rejects unsupported versions with a Korean user-facing message", () => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion: "9" })).toThrow(
      "지원하지 않는 .lcalc 버전입니다: 9",
    );
  });

  it.each(["4", "99"])("rejects future schemaVersion %s", (schemaVersion) => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion })).toThrow(
      `지원하지 않는 .lcalc 버전입니다: ${schemaVersion}`,
    );
  });

  it.each(["", null, undefined])("rejects unknown schemaVersion %s", (schemaVersion) => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion })).toThrow(
      ".lcalc 파일 형식을 확인할 수 없습니다.",
    );
  });
});

describe("validateLcalcEnvelope", () => {
  it("rejects unknown capability ids with the capability id shown in the message", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "compensation",
        envelopeFeatures: ["compensation@1"],
        dataVersions: { compensation: "compensation/v1.0.0" },
        payload: {},
      }),
    ).toThrow("이 파일에는 compensation@1 기능이 필요합니다.");
  });

  it("rejects malformed capability ids in envelopeFeatures", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "interest",
        envelopeFeatures: ["interest"], // missing @{n}
        dataVersions: { interest: "legal-rates/v1.0.0" },
        payload: sampleV3.payload,
      }),
    ).toThrow(".lcalc 파일의 envelopeFeatures[0] 필드가 올바르지 않습니다.");
  });

  it("rejects an empty envelopeFeatures array", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "interest",
        envelopeFeatures: [],
        dataVersions: { interest: "legal-rates/v1.0.0" },
        payload: sampleV3.payload,
      }),
    ).toThrow(".lcalc 파일의 envelopeFeatures 필드가 올바르지 않습니다.");
  });

  it("rejects a v3 envelope whose dataVersions field is missing", () => {
    expect(() =>
      validateLcalcEnvelope({
        ...sampleV3,
        dataVersions: null as unknown as Record<string, string>,
      }),
    ).toThrow(".lcalc 파일의 dataVersions 필드가 올바르지 않습니다.");
  });

  it("rejects a v3 envelope whose dataVersions entry is a non-string", () => {
    expect(() =>
      validateLcalcEnvelope({
        ...sampleV3,
        dataVersions: { interest: 1 as unknown as string },
      }),
    ).toThrow('.lcalc 파일의 dataVersions["interest"] 필드가 올바르지 않습니다.');
  });

  it("rejects interest kind with inheritance-shaped payload", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "interest",
        envelopeFeatures: ["interest@1"],
        dataVersions: { interest: "inheritance/v1.0.0" },
        payload: {
          appVersion: "0.1.2",
          dataVersion: "inheritance/v1.0.0",
          createdAt: "2026-05-09T12:00:00.000Z",
          input: { decedent: { deceasedAt: "2026-01-01" } },
          disclaimer: STANDARD_DISCLAIMER,
        },
      }),
    ).toThrow("payload.result");
  });

  it("rejects inheritance kind with interest-shaped payload", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "3",
        kind: "inheritance",
        envelopeFeatures: ["inheritance@1"],
        dataVersions: { inheritance: "legal-rates/v1.0.0" },
        payload: sampleV3.payload,
      }),
    ).toThrow("payload.input.decedent");
  });

  it("round-trips a v3 interest file through JSON and parser without changing the result", () => {
    const back = JSON.parse(JSON.stringify(sampleV3)) as LcalcFile;
    validateLcalcEnvelope(back);
    const loaded = parseLoadedLcalcInput(back);

    expect(loaded.input).toEqual(sampleV1.input);
    expect(loaded.result).toEqual(sampleV1.result);
    expect(loaded.note).toBe("legacy note");
  });

  it("loads a migrated v1 golden input with the same calculated result as a v3 save", () => {
    const input = {
      ...sampleV1.input,
      principal: 10_000_000,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    const result = calculateInterest(input);
    const v1: LoadableLcalcFile = { ...sampleV1, input, result };
    const v3: LcalcFile = {
      schemaVersion: "3",
      kind: "interest",
      envelopeFeatures: ["interest@1"],
      dataVersions: { interest: result.dataVersion },
      payload: {
        appVersion: "0.1.2",
        dataVersion: result.dataVersion,
        createdAt: "2026-05-09T12:00:00.000Z",
        input,
        options: input.options,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    const migrated = migrateLcalcFile(v1);
    validateLcalcEnvelope(migrated);
    validateLcalcEnvelope(v3);

    expect(parseLoadedLcalcInput(migrated).result.totalInterest).toBe(
      parseLoadedLcalcInput(v3).result.totalInterest,
    );
  });

  it("parses a v3 inheritance file for the inheritance tab", () => {
    const inheritanceFile: LcalcFile = {
      schemaVersion: "3",
      kind: "inheritance",
      envelopeFeatures: ["inheritance@1"],
      dataVersions: { inheritance: "inheritance/v1.0.0" },
      payload: {
        appVersion: "0.1.2",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-05-09T12:00:00.000Z",
        input: {
          decedent: { deceasedAt: "2026-01-01" },
          spouse: { alive: true, name: "배우자" },
          linealDescendants: [{ name: "자녀1", deceasedBeforeOpening: false }],
        },
        result: {
          decedent: { deceasedAt: "2026-01-01" },
          shares: [
            {
              name: "배우자",
              numerator: 3,
              denominator: 5,
              rawNumerator: 3,
              rawDenominator: 5,
            },
            {
              name: "자녀1",
              numerator: 2,
              denominator: 5,
              rawNumerator: 2,
              rawDenominator: 5,
            },
          ],
          disclaimer: STANDARD_DISCLAIMER,
          dataVersion: "inheritance/v1.0.0",
          computedAt: "2026-05-09T12:00:00.000Z",
        },
        note: "inheritance note",
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    validateLcalcEnvelope(inheritanceFile);
    const loaded = parseLoadedInheritanceLcalcInput(inheritanceFile);
    expect(loaded.input.spouse?.name).toBe("배우자");
    expect(loaded.result?.shares).toHaveLength(2);
    expect(loaded.note).toBe("inheritance note");
  });

  it("rejects an interest file whose note exceeds the bounded length", () => {
    const oversized: LcalcFile = {
      ...sampleV3,
      payload: {
        ...sampleV3.payload,
        note: "가".repeat(MAX_NOTE_LENGTH + 1),
      },
    };
    expect(() => validateLcalcEnvelope(oversized)).toThrow(
      ".lcalc 파일의 payload.note 필드가 너무 깁니다.",
    );
  });

  it("accepts an interest file whose note is exactly the bounded length", () => {
    const onTheLimit: LcalcFile = {
      ...sampleV3,
      payload: {
        ...sampleV3.payload,
        note: "가".repeat(MAX_NOTE_LENGTH),
      },
    };
    expect(() => validateLcalcEnvelope(onTheLimit)).not.toThrow();
    const loaded = parseLoadedLcalcInput(onTheLimit);
    expect(loaded.note?.length).toBe(MAX_NOTE_LENGTH);
  });

  it("rejects an inheritance file whose note exceeds the bounded length", () => {
    const inheritanceFile: LcalcFile = {
      schemaVersion: "3",
      kind: "inheritance",
      envelopeFeatures: ["inheritance@1"],
      dataVersions: { inheritance: "inheritance/v1.0.0" },
      payload: {
        appVersion: "0.1.2",
        dataVersion: "inheritance/v1.0.0",
        createdAt: "2026-05-09T12:00:00.000Z",
        input: { decedent: { deceasedAt: "2026-01-01" } },
        note: "x".repeat(MAX_NOTE_LENGTH + 1),
        disclaimer: STANDARD_DISCLAIMER,
      },
    };
    expect(() => validateLcalcEnvelope(inheritanceFile)).toThrow(
      ".lcalc 파일의 payload.note 필드가 너무 깁니다.",
    );
  });

  it("parses a v3 litigation-cost file with three dataVersions", () => {
    const input = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        appealsLevel: "firstInstance" as const,
      },
      deliveryFee: {
        caseType: "civilFirstInstanceSingle" as const,
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        discounts: [],
      },
      distribution: { mode: "equal" as const, partyCount: 2 },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-05-11T12:00:00.000Z" });
    const litigationFile: LcalcFile = {
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"]!,
        delivery: result.dataVersions.delivery!,
        "lawyer-fee": result.dataVersions["lawyer-fee"]!,
      },
      payload: {
        appVersion: "0.3.0",
        createdAt: "2026-05-11T12:00:00.000Z",
        input,
        result,
        note: "litigation note",
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    validateLcalcEnvelope(litigationFile);
    const loaded = parseLoadedLitigationCostLcalcInput(litigationFile);
    expect(loaded.input.distribution?.mode).toBe("equal");
    expect(loaded.result?.totalAmount).toBe(3_060_000);
    expect(loaded.note).toBe("litigation note");
  });

  it("rejects a litigation-cost file missing a required dataVersion", () => {
    const input = {
      stampDuty: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        appealsLevel: "firstInstance" as const,
      },
      deliveryFee: {
        caseType: "civilFirstInstanceSingle" as const,
        partyCount: 2,
      },
      lawyerFee: {
        caseValue: 30_000_000,
        caseType: "civilFirstInstanceSingle" as const,
        discounts: [],
      },
    };
    const result = computeLitigationCost(input, { computedAt: "2026-05-11T12:00:00.000Z" });
    const litigationFile: LcalcFile = {
      schemaVersion: "3",
      kind: "litigation-cost",
      envelopeFeatures: ["litigation-cost@1"],
      dataVersions: {
        "stamp-duty": result.dataVersions["stamp-duty"]!,
        delivery: result.dataVersions.delivery!,
      },
      payload: {
        appVersion: "0.3.0",
        createdAt: "2026-05-11T12:00:00.000Z",
        input,
        result,
        disclaimer: STANDARD_DISCLAIMER,
      },
    };

    expect(() => validateLcalcEnvelope(litigationFile)).toThrow(
      '.lcalc 파일의 dataVersions["lawyer-fee"] 필드가 올바르지 않습니다.',
    );
  });
});
