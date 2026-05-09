import { describe, expect, it } from "vitest";

import { STANDARD_DISCLAIMER, calculateInterest } from "@lawcalc-kr/core-engine";

import type { LcalcFile, LoadableLcalcFile } from "./ipc";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "./lcalc-migrations";
import {
  parseLoadedInheritanceLcalcInput,
  parseLoadedLcalcInput,
  validateLcalcEnvelope,
} from "./lcalc-validation";

const sampleV1: LoadableLcalcFile = {
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

const sampleV2: LcalcFile = {
  schemaVersion: CURRENT_LCALC_SCHEMA_VERSION,
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

describe("migrateLcalcFile", () => {
  it("wraps legacy v1 interest files in the v2 interest envelope", () => {
    expect(migrateLcalcFile(sampleV1)).toEqual(sampleV2);
  });

  it("preserves v1 input, options, and note fields exactly during migration", () => {
    const migrated = migrateLcalcFile(sampleV1);

    expect(migrated.kind).toBe("interest");
    if (migrated.kind !== "interest") {
      throw new Error("unexpected kind");
    }
    expect(migrated.payload.input).toEqual(sampleV1.input);
    expect(migrated.payload.options).toEqual(sampleV1.options);
    expect(migrated.payload.note).toBe(sampleV1.note);
  });

  it("rejects unsupported versions with a Korean user-facing message", () => {
    expect(() => migrateLcalcFile({ ...sampleV1, schemaVersion: "9" })).toThrow(
      "지원하지 않는 .lcalc 버전입니다: 9",
    );
  });

  it.each(["3", "99"])("rejects future schemaVersion %s", (schemaVersion) => {
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
  it("rejects unknown v2 kinds with a Korean user-facing message", () => {
    expect(() =>
      validateLcalcEnvelope({
        ...sampleV2,
        kind: "compensation",
      }),
    ).toThrow("현재 버전에서 지원하지 않습니다");
  });

  it("rejects interest kind with inheritance-shaped payload", () => {
    expect(() =>
      validateLcalcEnvelope({
        schemaVersion: "2",
        kind: "interest",
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
        schemaVersion: "2",
        kind: "inheritance",
        payload: sampleV2.payload,
      }),
    ).toThrow("payload.input.decedent");
  });

  it("round-trips a v2 interest file through JSON and parser without changing the result", () => {
    const back = JSON.parse(JSON.stringify(sampleV2)) as LcalcFile;
    validateLcalcEnvelope(back);
    const loaded = parseLoadedLcalcInput(back);

    expect(loaded.input).toEqual(sampleV1.input);
    expect(loaded.result).toEqual(sampleV1.result);
    expect(loaded.note).toBe("legacy note");
  });

  it("loads a migrated v1 golden input with the same calculated result as a v2 save", () => {
    const input = {
      ...sampleV1.input,
      principal: 10_000_000,
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    };
    const result = calculateInterest(input);
    const v1: LoadableLcalcFile = { ...sampleV1, input, result };
    const v2: LcalcFile = {
      schemaVersion: "2",
      kind: "interest",
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
    validateLcalcEnvelope(v2);

    expect(parseLoadedLcalcInput(migrated).result.totalInterest).toBe(
      parseLoadedLcalcInput(v2).result.totalInterest,
    );
  });

  it("parses a v2 inheritance file for the inheritance tab", () => {
    const inheritanceFile: LcalcFile = {
      schemaVersion: "2",
      kind: "inheritance",
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
});
