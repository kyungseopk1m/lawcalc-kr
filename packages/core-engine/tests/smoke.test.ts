import { describe, expect, it } from "vitest";

import {
  calculateInterest,
  countDays,
  loadLegalRates,
  resolveSegments,
  type CalcOptions,
  type InterestInput,
} from "../src";

describe("@lawcalc-kr/core-engine package surface", () => {
  it("exposes the public functions as functions", () => {
    expect(typeof calculateInterest).toBe("function");
    expect(typeof countDays).toBe("function");
    expect(typeof resolveSegments).toBe("function");
    expect(typeof loadLegalRates).toBe("function");
  });

  it("computes a basic civil-rate result end-to-end (W2 sanity)", () => {
    const options: CalcOptions = {
      mode: "totalDays",
      leapYear: "fixed365",
      includeFirstDay: false,
    };
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      legalRatePreset: "civil",
      options,
    };
    const result = calculateInterest(input);
    expect(result.principal).toBe(1_000_000);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.grandTotal).toBe(result.principal + result.totalInterest);
    expect(result.dataVersion).toMatch(/^legal-rates\/v\d+\.\d+\.\d+$/);
    expect(result.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
