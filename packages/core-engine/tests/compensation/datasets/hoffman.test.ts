import { describe, expect, it } from "vitest";
import {
  applyHoffman240Cap,
  getHoffmanAt,
  hoffmanDatasetVersionTag,
  loadHoffmanTable,
} from "../../../src/compensation/datasets/hoffman";
import type { HoffmanDataset } from "../../../src/compensation/datasets/hoffman";

const EPSILON = 1e-6;

describe("hoffman dataset (loader + version tag)", () => {
  it("loads the default dataset with version 1.0.0 and 480 months", () => {
    const ds = loadHoffmanTable();
    expect(ds.version).toBe("1.0.0");
    expect(ds.monthsCovered).toBe(480);
    expect(ds.values).toHaveLength(480);
    expect(ds.maxIndex).toBe(240);
    expect(ds.formula).toContain("0.05");
  });

  it("emits hoffman/v1.0.0 version tag", () => {
    expect(hoffmanDatasetVersionTag(loadHoffmanTable())).toBe("hoffman/v1.0.0");
  });

  it("matches the known formula at month boundaries", () => {
    const ds = loadHoffmanTable();
    expect(getHoffmanAt(ds, 1)).toBeCloseTo(1 / (1 + 0.05 / 12), 6);
    let expectedH12 = 0;
    for (let k = 1; k <= 12; k++) expectedH12 += 1 / (1 + (0.05 * k) / 12);
    expect(getHoffmanAt(ds, 12)).toBeCloseTo(expectedH12, 6);
    expect(getHoffmanAt(ds, 480)).toBeGreaterThan(getHoffmanAt(ds, 240));
  });

  it("crosses the 240 cumulative threshold around month 414 (Compensation §5-마 정원)", () => {
    const ds = loadHoffmanTable();
    expect(getHoffmanAt(ds, 413)).toBeLessThan(240);
    expect(getHoffmanAt(ds, 414)).toBeGreaterThan(240);
  });

  it("is strictly increasing across the full table", () => {
    const ds = loadHoffmanTable();
    for (let i = 1; i < ds.values.length; i++) {
      expect(ds.values[i]).toBeGreaterThan(ds.values[i - 1] as number);
    }
  });

  it("rejects out-of-range or non-integer month indices via getHoffmanAt", () => {
    const ds = loadHoffmanTable();
    expect(() => getHoffmanAt(ds, 0)).toThrow(RangeError);
    expect(() => getHoffmanAt(ds, -1)).toThrow(RangeError);
    expect(() => getHoffmanAt(ds, 1.5)).toThrow(RangeError);
    expect(() => getHoffmanAt(ds, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => getHoffmanAt(ds, Number.NaN)).toThrow(RangeError);
    expect(() => getHoffmanAt(ds, 481)).toThrow(RangeError);
  });

  it("rejects malformed overrides (length mismatch, non-monotonic)", () => {
    const base = loadHoffmanTable();
    const tooShort: HoffmanDataset = { ...base, values: base.values.slice(0, 100) };
    expect(() => loadHoffmanTable(tooShort)).toThrow(RangeError);
    const nonMonotonic: HoffmanDataset = {
      ...base,
      values: [...base.values.slice(0, -1), 0.001],
    };
    expect(() => loadHoffmanTable(nonMonotonic)).toThrow(RangeError);
    const badDate: HoffmanDataset = { ...base, updatedAt: "20260516" };
    expect(() => loadHoffmanTable(badDate)).toThrow(RangeError);
  });
});

describe("applyHoffman240Cap (cumulative cap)", () => {
  it("passes through when cumulative stays under the cap", () => {
    const result = applyHoffman240Cap([50, 50, 50]);
    expect(result.appliedHoffman).toEqual([50, 50, 50]);
    expect(result.cappedAtIndex).toBeNull();
  });

  it("clips the segment that crosses 240 and zeroes subsequent segments", () => {
    const result = applyHoffman240Cap([100, 100, 100]);
    expect(result.appliedHoffman).toEqual([100, 100, 40]);
    expect(result.cappedAtIndex).toBe(2);
  });

  it("clips at the first segment when its raw value alone exceeds the cap", () => {
    const result = applyHoffman240Cap([300, 10, 5]);
    expect(result.appliedHoffman).toEqual([240, 0, 0]);
    expect(result.cappedAtIndex).toBe(0);
  });

  it("preserves an exact-240 cumulative without flagging cap (cumulative + raw > cap is strict)", () => {
    const result = applyHoffman240Cap([120, 120]);
    expect(result.appliedHoffman).toEqual([120, 120]);
    expect(result.cappedAtIndex).toBeNull();
    const overshoot = applyHoffman240Cap([120, 120.0001]);
    expect(overshoot.cappedAtIndex).toBe(1);
    expect(overshoot.appliedHoffman[1]).toBeCloseTo(120, 4);
  });

  it("treats zero-income segments as zero-raw without advancing cumulative", () => {
    const result = applyHoffman240Cap([0, 0, 50, 200]);
    expect(result.appliedHoffman[0]).toBe(0);
    expect(result.appliedHoffman[1]).toBe(0);
    expect(result.appliedHoffman[2]).toBe(50);
    expect(result.appliedHoffman[3]).toBeCloseTo(190, EPSILON);
    expect(result.cappedAtIndex).toBe(3);
  });

  it("rejects negative or non-finite raw values", () => {
    expect(() => applyHoffman240Cap([-1])).toThrow(RangeError);
    expect(() => applyHoffman240Cap([Number.NaN])).toThrow(RangeError);
    expect(() => applyHoffman240Cap([Number.POSITIVE_INFINITY])).toThrow(RangeError);
  });

  it("rejects non-positive cap parameters", () => {
    expect(() => applyHoffman240Cap([10], 0)).toThrow(RangeError);
    expect(() => applyHoffman240Cap([10], -1)).toThrow(RangeError);
  });

  it("returns an empty result for an empty input", () => {
    const result = applyHoffman240Cap([]);
    expect(result.appliedHoffman).toEqual([]);
    expect(result.cappedAtIndex).toBeNull();
  });
});
