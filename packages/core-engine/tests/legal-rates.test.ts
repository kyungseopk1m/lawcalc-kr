import { describe, expect, it } from "vitest";

import {
  datasetVersionTag,
  getRateAt,
  loadLegalRates,
  rateHistoryFor,
  type LegalRateDataset,
} from "../src";

describe("loadLegalRates default dataset", () => {
  it("loads inline default and validates", () => {
    const ds = loadLegalRates();
    expect(ds.version).toBe("1.0.0");
    expect(ds.rates).toHaveLength(3);
    const codes = ds.rates.map((r) => r.code).sort();
    expect(codes).toEqual(["civil", "commercial", "promotion"]);
  });

  it("emits dataset version tag for InterestResult.dataVersion", () => {
    const ds = loadLegalRates();
    expect(datasetVersionTag(ds)).toBe("legal-rates/v1.0.0");
  });

  it("returns the same shape for an override (validation only)", () => {
    const override: LegalRateDataset = {
      version: "9.9.9-test",
      updatedAt: "2030-01-01",
      rates: [
        {
          code: "civil",
          label_ko: "test",
          annualRate: 0.04,
          validFrom: "2000-01-01",
          validTo: null,
        },
      ],
    };
    expect(loadLegalRates(override).version).toBe("9.9.9-test");
  });

  it("rejects duplicate codes", () => {
    const bad: LegalRateDataset = {
      version: "x",
      updatedAt: "2026-05-09",
      rates: [
        {
          code: "civil",
          label_ko: "a",
          annualRate: 0.05,
          validFrom: "1958-02-22",
          validTo: null,
        },
        {
          code: "civil",
          label_ko: "b",
          annualRate: 0.05,
          validFrom: "1958-02-22",
          validTo: null,
        },
      ],
    };
    expect(() => loadLegalRates(bad)).toThrow(/duplicate/i);
  });

  it("rejects validTo < validFrom", () => {
    const bad: LegalRateDataset = {
      version: "x",
      updatedAt: "2026-05-09",
      rates: [
        {
          code: "civil",
          label_ko: "a",
          annualRate: 0.05,
          validFrom: "2020-01-01",
          validTo: "2019-01-01",
        },
      ],
    };
    expect(() => loadLegalRates(bad)).toThrow(/validTo/);
  });

  it("rejects negative rate", () => {
    const bad: LegalRateDataset = {
      version: "x",
      updatedAt: "2026-05-09",
      rates: [
        {
          code: "civil",
          label_ko: "a",
          annualRate: -0.01,
          validFrom: "2020-01-01",
          validTo: null,
        },
      ],
    };
    expect(() => loadLegalRates(bad)).toThrow(/>= 0/);
  });
});

describe("getRateAt (소촉법 변경 이력)", () => {
  const ds = loadLegalRates();

  it("returns 0.05 for civil at any in-effect date", () => {
    expect(getRateAt(ds, "civil", "2026-05-09")).toBe(0.05);
    expect(getRateAt(ds, "civil", "1990-01-01")).toBe(0.05);
  });

  it("returns 0.06 for commercial", () => {
    expect(getRateAt(ds, "commercial", "2026-05-09")).toBe(0.06);
  });

  it("promotion: 0.20 (2003-06-01 ~ 2015-09-30)", () => {
    expect(getRateAt(ds, "promotion", "2010-01-01")).toBe(0.2);
    expect(getRateAt(ds, "promotion", "2015-09-30")).toBe(0.2);
  });

  it("promotion: 0.15 (2015-10-01 ~ 2019-05-31)", () => {
    expect(getRateAt(ds, "promotion", "2015-10-01")).toBe(0.15);
    expect(getRateAt(ds, "promotion", "2019-05-31")).toBe(0.15);
  });

  it("promotion: 0.12 (2019-06-01 ~ )", () => {
    expect(getRateAt(ds, "promotion", "2019-06-01")).toBe(0.12);
    expect(getRateAt(ds, "promotion", "2026-05-09")).toBe(0.12);
  });

  it("returns undefined for date before any record", () => {
    expect(getRateAt(ds, "promotion", "2000-01-01")).toBeUndefined();
  });
});

describe("rateHistoryFor (오름차순 정렬)", () => {
  const ds = loadLegalRates();

  it("flattens promotion history with previousVersions, ascending validFrom", () => {
    const h = rateHistoryFor(ds, "promotion");
    expect(h).toEqual([
      { from: "2003-06-01", to: "2015-09-30", rate: 0.2 },
      { from: "2015-10-01", to: "2019-05-31", rate: 0.15 },
      { from: "2019-06-01", to: null, rate: 0.12 },
    ]);
  });

  it("returns single record for civil/commercial", () => {
    expect(rateHistoryFor(ds, "civil")).toHaveLength(1);
    expect(rateHistoryFor(ds, "commercial")).toHaveLength(1);
  });
});
