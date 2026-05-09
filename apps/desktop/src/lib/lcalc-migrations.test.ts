import { describe, expect, it } from "vitest";

import type { LcalcFile, LoadableLcalcFile } from "./ipc";
import { CURRENT_LCALC_SCHEMA_VERSION, migrateLcalcFile } from "./lcalc-migrations";

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
  disclaimer: "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.",
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
    disclaimer: "본 결과는 검토용 계산이며, 사건별 특수성은 전문가 확인이 필요합니다.",
  },
};

describe("migrateLcalcFile", () => {
  it("wraps legacy v1 interest files in the v2 interest envelope", () => {
    expect(migrateLcalcFile(sampleV1)).toEqual(sampleV2);
  });

  it("rejects unsupported versions with a Korean user-facing message", () => {
    expect(() =>
      migrateLcalcFile({ ...sampleV1, schemaVersion: "9" } as unknown as LoadableLcalcFile),
    ).toThrow("지원하지 않는 .lcalc 버전입니다: 9");
  });
});
