import { describe, expect, it } from "vitest";
import { getLeibnizAt, leibnizDatasetVersionTag, loadLeibnizTable } from "../src/leibniz";
import type { LeibnizDataset } from "../src/leibniz";

describe("leibniz dataset (loader + version tag)", () => {
  it("loads the default dataset with version 1.0.0 and 480 months", () => {
    const ds = loadLeibnizTable();
    expect(ds.version).toBe("1.0.0");
    expect(ds.monthsCovered).toBe(480);
    expect(ds.values).toHaveLength(480);
    expect(ds.formula).toContain("0.05");
  });

  it("emits leibniz/v1.0.0 version tag", () => {
    expect(leibnizDatasetVersionTag(loadLeibnizTable())).toBe("leibniz/v1.0.0");
  });

  it("matches the compound-discount formula at month boundaries", () => {
    const ds = loadLeibnizTable();
    const monthly = 1 + 0.05 / 12;
    expect(getLeibnizAt(ds, 1)).toBeCloseTo(1 / monthly, 8);
    expect(getLeibnizAt(ds, 12)).toBeCloseTo(1 / Math.pow(monthly, 12), 8);
    expect(getLeibnizAt(ds, 480)).toBeCloseTo(1 / Math.pow(monthly, 480), 8);
  });

  it("is strictly decreasing across the full table and bounded in (0, 1)", () => {
    const ds = loadLeibnizTable();
    for (const v of ds.values) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
    for (let i = 1; i < ds.values.length; i++) {
      expect(ds.values[i]).toBeLessThan(ds.values[i - 1] as number);
    }
  });

  it("rejects out-of-range or non-integer month indices via getLeibnizAt", () => {
    const ds = loadLeibnizTable();
    expect(() => getLeibnizAt(ds, 0)).toThrow(RangeError);
    expect(() => getLeibnizAt(ds, -1)).toThrow(RangeError);
    expect(() => getLeibnizAt(ds, 1.5)).toThrow(RangeError);
    expect(() => getLeibnizAt(ds, Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => getLeibnizAt(ds, Number.NaN)).toThrow(RangeError);
    expect(() => getLeibnizAt(ds, 481)).toThrow(RangeError);
  });

  it("rejects malformed overrides (length mismatch, out-of-range values, bad date)", () => {
    const base = loadLeibnizTable();
    const tooShort: LeibnizDataset = { ...base, values: base.values.slice(0, 100) };
    expect(() => loadLeibnizTable(tooShort)).toThrow(RangeError);
    const wrongRange: LeibnizDataset = {
      ...base,
      values: [...base.values.slice(0, -1), 1.5],
    };
    expect(() => loadLeibnizTable(wrongRange)).toThrow(RangeError);
    const badDate: LeibnizDataset = { ...base, updatedAt: "2026/05/16" };
    expect(() => loadLeibnizTable(badDate)).toThrow(RangeError);
  });
});
