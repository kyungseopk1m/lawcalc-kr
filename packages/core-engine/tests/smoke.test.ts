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

  it("accepts a valid InterestInput shape (type-level smoke test)", () => {
    const options: CalcOptions = {
      mode: "period",
      leapYear: "actual",
      includeFirstDay: false,
    };
    const input: InterestInput = {
      principal: 1_000_000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      legalRatePreset: "civil",
      options,
    };
    expect(() => calculateInterest(input)).toThrow(/not implemented/i);
  });

  it("stub functions throw a stable diagnostic until W2", () => {
    expect(() =>
      countDays("2024-01-01", "2024-01-31", { leapYear: "actual", includeFirstDay: false }),
    ).toThrow(/W2/);
    expect(() =>
      resolveSegments({
        principal: 1,
        startDate: "2024-01-01",
        endDate: "2024-01-02",
        options: { mode: "period", leapYear: "actual", includeFirstDay: false },
      }),
    ).toThrow(/W2/);
    expect(() => loadLegalRates()).toThrow(/W2/);
  });
});
