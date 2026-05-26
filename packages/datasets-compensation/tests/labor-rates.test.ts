import { describe, expect, it } from "vitest";
import {
  getLaborRateAt,
  laborRatesDatasetVersionTag,
  latestSliceEffectiveFrom,
  loadLaborRatesTable,
} from "../src/labor-rates";
import type { LaborRatesDataset, LaborRatesSlice } from "../src/labor-rates";

const BASE_SLICE: LaborRatesSlice = {
  effectiveFrom: "2026-01-01",
  announcementDate: "2025-12-31",
  announcementUrl: "https://www.cak.or.kr/lay1/bbs/S1T41C42/A/14/list.do",
  title: "2026년 상반기 적용 건설업 임금실태조사 보고서",
  rates: { 보통인부: 172068, 특별인부: 226122 },
};

const BASE_DATASET: LaborRatesDataset = {
  version: "1.0.0",
  updatedAt: "2026-05-17",
  source: "대한건설협회 시중노임",
  sourceUrl: "https://www.cak.or.kr/",
  license: "테스트용 라이선스 표기",
  snapshotDate: "2025-12-31",
  slices: [BASE_SLICE],
};

describe("labor-rates dataset (loader + version tag)", () => {
  it("loads the default dataset with version 1.0.0 and at least one slice", () => {
    const ds = loadLaborRatesTable();
    expect(ds.version).toBe("1.0.0");
    expect(ds.slices.length).toBeGreaterThanOrEqual(1);
    expect(ds.sourceUrl).toContain("cak.or.kr");
  });

  it("emits labor-rates/v1.0.0 version tag", () => {
    expect(laborRatesDatasetVersionTag(loadLaborRatesTable())).toBe("labor-rates/v1.0.0");
  });

  it("default dataset bundles the 2026-01-01 대한건설협회 slice with the canonical 보통인부 단가", () => {
    const ds = loadLaborRatesTable();
    const earliest = ds.slices[0]!;
    expect(earliest.effectiveFrom).toBe("2026-01-01");
    expect(earliest.rates["보통인부"]).toBe(172068);
    expect(earliest.rates["특별인부"]).toBe(226122);
  });
});

describe("labor-rates dataset (validator)", () => {
  it("rejects an empty slices array", () => {
    const broken: LaborRatesDataset = { ...BASE_DATASET, slices: [] };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("rejects non-ISO effectiveFrom", () => {
    const broken: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [{ ...BASE_SLICE, effectiveFrom: "20260101" }],
    };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("rejects non-ascending duplicate effectiveFrom", () => {
    const broken: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [BASE_SLICE, { ...BASE_SLICE, effectiveFrom: "2026-01-01" }],
    };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("rejects rates with non-positive or non-finite values", () => {
    const negative: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [{ ...BASE_SLICE, rates: { 보통인부: -1 } }],
    };
    expect(() => loadLaborRatesTable(negative)).toThrow(RangeError);
    const infinite: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [{ ...BASE_SLICE, rates: { 보통인부: Number.POSITIVE_INFINITY } }],
    };
    expect(() => loadLaborRatesTable(infinite)).toThrow(RangeError);
  });
});

describe("labor-rates dataset (getLaborRateAt + latestSliceEffectiveFrom)", () => {
  const multiSlice: LaborRatesDataset = {
    ...BASE_DATASET,
    slices: [
      {
        ...BASE_SLICE,
        effectiveFrom: "2025-01-01",
        announcementDate: "2024-12-31",
        title: "2025년 상반기",
        rates: { 보통인부: 169804 },
      },
      {
        ...BASE_SLICE,
        effectiveFrom: "2025-09-01",
        announcementDate: "2025-09-01",
        title: "2025년 하반기",
        rates: { 보통인부: 171037 },
      },
      {
        ...BASE_SLICE,
        effectiveFrom: "2026-01-01",
        announcementDate: "2025-12-31",
        title: "2026년 상반기",
        rates: { 보통인부: 172068, 보링공: 232562 },
      },
    ],
  };

  it("returns undefined for a date earlier than every slice", () => {
    expect(getLaborRateAt(multiSlice, "보통인부", "2024-01-01")).toBeUndefined();
  });

  it("picks the latest slice whose effectiveFrom <= date", () => {
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-01-01")).toBe(169804);
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-08-31")).toBe(169804);
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-09-01")).toBe(171037);
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-12-31")).toBe(171037);
    expect(getLaborRateAt(multiSlice, "보통인부", "2026-01-01")).toBe(172068);
    expect(getLaborRateAt(multiSlice, "보통인부", "2099-12-31")).toBe(172068);
  });

  it("returns undefined for an unknown occupation even when a slice is selected", () => {
    expect(getLaborRateAt(multiSlice, "공무원", "2026-01-01")).toBeUndefined();
  });

  it("rejects non-ISO date input", () => {
    expect(() => getLaborRateAt(multiSlice, "보통인부", "2026/01/01")).toThrow(RangeError);
  });

  it("reports the latest slice effectiveFrom", () => {
    expect(latestSliceEffectiveFrom(multiSlice)).toBe("2026-01-01");
  });
});
