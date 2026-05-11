import { describe, expect, it } from "vitest";

import { parseProportionalValues } from "./LitigationCostCalculator";

describe("parseProportionalValues", () => {
  it("parses comma-separated plain integers", () => {
    expect(parseProportionalValues("10000000, 20000000")).toEqual([10000000, 20000000]);
  });

  it("parses slash-separated thousands-grouped integers (placeholder format)", () => {
    expect(parseProportionalValues("10,000,000 / 20,000,000")).toEqual([10000000, 20000000]);
  });

  it("parses newline-separated thousands-grouped integers", () => {
    expect(parseProportionalValues("10,000,000\n20,000,000")).toEqual([10000000, 20000000]);
  });

  it("parses tab-separated thousands-grouped integers", () => {
    expect(parseProportionalValues("10,000,000\t20,000,000")).toEqual([10000000, 20000000]);
  });

  it("trims leading and trailing whitespace", () => {
    expect(parseProportionalValues("  10000000, 20000000  ")).toEqual([10000000, 20000000]);
  });

  it("accepts a single thousands-grouped value", () => {
    expect(parseProportionalValues("1,234,567,890")).toEqual([1234567890]);
  });

  it("rejects malformed thousands grouping (silent skip)", () => {
    expect(parseProportionalValues("10,000,00")).toEqual([]);
    expect(parseProportionalValues("1,00")).toEqual([]);
    expect(parseProportionalValues("1,234,5")).toEqual([]);
    expect(parseProportionalValues(",000,000")).toEqual([]);
  });

  it("rejects decimal input (silent skip)", () => {
    expect(parseProportionalValues("1,000,000.5")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(parseProportionalValues("")).toEqual([]);
  });

  it("filters out zero and negative values", () => {
    expect(parseProportionalValues("0")).toEqual([]);
    expect(parseProportionalValues("0, 100")).toEqual([100]);
  });
});
