import { describe, expect, it } from "vitest";
import { computeStaleBadge } from "../../../src/compensation/datasets/stale-badge";

describe("computeStaleBadge", () => {
  it("returns neutral when snapshot is exactly at the current date", () => {
    const result = computeStaleBadge("2026-01-01", "2026-01-01");
    expect(result.level).toBe("neutral");
    expect(result.monthsElapsed).toBe(0);
    expect(result.message).toBeNull();
    expect(result.overrideStrongly).toBe(false);
  });

  it("returns neutral for an elapsed gap of exactly 6 months", () => {
    const result = computeStaleBadge("2026-01-01", "2026-07-01");
    expect(result.level).toBe("neutral");
    expect(result.monthsElapsed).toBe(6);
    expect(result.overrideStrongly).toBe(false);
  });

  it("returns amber once the elapsed calendar gap exceeds 6 months", () => {
    const result = computeStaleBadge("2026-01-01", "2026-08-01");
    expect(result.level).toBe("amber");
    expect(result.monthsElapsed).toBe(7);
    expect(result.message).toContain("CAK");
    expect(result.overrideStrongly).toBe(true);
  });

  it("returns amber at exactly 12 months elapsed", () => {
    const result = computeStaleBadge("2026-01-01", "2027-01-01");
    expect(result.level).toBe("amber");
    expect(result.monthsElapsed).toBe(12);
    expect(result.overrideStrongly).toBe(true);
  });

  it("returns red once the elapsed calendar gap exceeds 12 months", () => {
    const result = computeStaleBadge("2026-01-01", "2027-02-01");
    expect(result.level).toBe("red");
    expect(result.monthsElapsed).toBe(13);
    expect(result.message).toContain("갱신 필요");
    expect(result.overrideStrongly).toBe(true);
  });

  it("clamps monthsElapsed to 0 when currentDate is before snapshotDate", () => {
    const result = computeStaleBadge("2026-01-01", "2025-12-01");
    expect(result.level).toBe("neutral");
    expect(result.monthsElapsed).toBe(0);
  });

  it("rejects malformed ISO dates", () => {
    expect(() => computeStaleBadge("2026/01/01", "2026-07-01")).toThrow(RangeError);
    expect(() => computeStaleBadge("2026-01-01", "20260701")).toThrow(RangeError);
    expect(() => computeStaleBadge("2026-13-01", "2026-07-01")).toThrow(RangeError);
  });
});
