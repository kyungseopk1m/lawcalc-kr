import { describe, expect, it } from "vitest";
import {
  getLifeExpectancyAt,
  lifeExpectancyDatasetVersionTag,
  loadLifeExpectancyTable,
} from "../src/life-expectancy";
import type { LifeExpectancyDataset } from "../src/life-expectancy";

const BASE_DATASET: LifeExpectancyDataset = {
  version: "1.0.0",
  updatedAt: "2026-05-17",
  source: "KOSIS 생명표",
  sourceUrl: "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B42",
  license: "KOSIS 자유 사용·재사용·재배포·상업적 활용 허용 (출처표시 + 왜곡 금지)",
  snapshotDate: "2024-12-04",
  publicationYear: 2024,
  mortalityBaseYear: 2023,
  tables: {
    male: [
      { age: 0, remainingYears: 80.6 },
      { age: 40, remainingYears: 41.6 },
      { age: 60, remainingYears: 23.4 },
    ],
    female: [
      { age: 0, remainingYears: 86.4 },
      { age: 40, remainingYears: 47.2 },
      { age: 60, remainingYears: 28.2 },
    ],
  },
};

describe("life-expectancy dataset (loader + version tag)", () => {
  it("loads the default dataset with version 1.0.0 and KOSIS 2023 anchors", () => {
    const ds = loadLifeExpectancyTable();
    expect(ds.version).toBe("1.0.0");
    expect(ds.publicationYear).toBe(2024);
    expect(ds.mortalityBaseYear).toBe(2023);
    expect(ds.tables.male.length).toBeGreaterThanOrEqual(1);
    expect(ds.tables.female.length).toBeGreaterThanOrEqual(1);
  });

  it("emits life-expectancy/v1.0.0 version tag", () => {
    expect(lifeExpectancyDatasetVersionTag(loadLifeExpectancyTable())).toBe(
      "life-expectancy/v1.0.0",
    );
  });

  it("bundles the canonical 0세 / 60세 / 80세 anchors per sex", () => {
    const ds = loadLifeExpectancyTable();
    expect(getLifeExpectancyAt(ds, "male", 0)).toBe(80.6);
    expect(getLifeExpectancyAt(ds, "female", 0)).toBe(86.4);
    expect(getLifeExpectancyAt(ds, "male", 60)).toBe(23.4);
    expect(getLifeExpectancyAt(ds, "female", 60)).toBe(28.2);
    expect(getLifeExpectancyAt(ds, "male", 80)).toBe(8.3);
    expect(getLifeExpectancyAt(ds, "female", 80)).toBe(10.7);
  });
});

describe("life-expectancy dataset (validator)", () => {
  it("rejects an empty male or female table", () => {
    const noMale: LifeExpectancyDataset = {
      ...BASE_DATASET,
      tables: { male: [], female: BASE_DATASET.tables.female },
    };
    expect(() => loadLifeExpectancyTable(noMale)).toThrow(RangeError);
  });

  it("rejects out-of-range or non-integer ages", () => {
    const tooBig: LifeExpectancyDataset = {
      ...BASE_DATASET,
      tables: {
        male: [{ age: 121, remainingYears: 1 }],
        female: BASE_DATASET.tables.female,
      },
    };
    expect(() => loadLifeExpectancyTable(tooBig)).toThrow(RangeError);
    const fractional: LifeExpectancyDataset = {
      ...BASE_DATASET,
      tables: {
        male: [{ age: 60.5, remainingYears: 23.4 }],
        female: BASE_DATASET.tables.female,
      },
    };
    expect(() => loadLifeExpectancyTable(fractional)).toThrow(RangeError);
  });

  it("rejects duplicate or non-ascending ages in the same sex table", () => {
    const dup: LifeExpectancyDataset = {
      ...BASE_DATASET,
      tables: {
        male: [
          { age: 60, remainingYears: 23.4 },
          { age: 60, remainingYears: 24.0 },
        ],
        female: BASE_DATASET.tables.female,
      },
    };
    expect(() => loadLifeExpectancyTable(dup)).toThrow(RangeError);
    const descending: LifeExpectancyDataset = {
      ...BASE_DATASET,
      tables: {
        male: [
          { age: 60, remainingYears: 23.4 },
          { age: 40, remainingYears: 41.6 },
        ],
        female: BASE_DATASET.tables.female,
      },
    };
    expect(() => loadLifeExpectancyTable(descending)).toThrow(RangeError);
  });

  it("rejects non-positive remainingYears", () => {
    const zero: LifeExpectancyDataset = {
      ...BASE_DATASET,
      tables: {
        male: [{ age: 60, remainingYears: 0 }],
        female: BASE_DATASET.tables.female,
      },
    };
    expect(() => loadLifeExpectancyTable(zero)).toThrow(RangeError);
  });

  it("rejects mortalityBaseYear after publicationYear", () => {
    const broken: LifeExpectancyDataset = {
      ...BASE_DATASET,
      publicationYear: 2024,
      mortalityBaseYear: 2025,
    };
    expect(() => loadLifeExpectancyTable(broken)).toThrow(RangeError);
  });
});

describe("life-expectancy dataset (getLifeExpectancyAt)", () => {
  it("returns undefined for an age that is not an anchor entry", () => {
    expect(getLifeExpectancyAt(BASE_DATASET, "male", 50)).toBeUndefined();
    expect(getLifeExpectancyAt(BASE_DATASET, "female", 75)).toBeUndefined();
  });

  it("keeps male and female tables independent", () => {
    expect(getLifeExpectancyAt(BASE_DATASET, "male", 40)).toBe(41.6);
    expect(getLifeExpectancyAt(BASE_DATASET, "female", 40)).toBe(47.2);
  });

  it("rejects invalid sex or out-of-range age", () => {
    expect(() =>
      // @ts-expect-error sex enum 검증
      getLifeExpectancyAt(BASE_DATASET, "other", 30),
    ).toThrow(RangeError);
    expect(() => getLifeExpectancyAt(BASE_DATASET, "male", -1)).toThrow(RangeError);
    expect(() => getLifeExpectancyAt(BASE_DATASET, "male", 121)).toThrow(RangeError);
    expect(() => getLifeExpectancyAt(BASE_DATASET, "male", 30.5)).toThrow(RangeError);
  });
});
