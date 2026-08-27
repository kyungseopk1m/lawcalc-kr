import { describe, expect, it } from "vitest";
import {
  getLifeExpectancyAt,
  getLifeExpectancyAtYear,
  lifeExpectancyDatasetVersionTag,
  listLifeExpectancyYears,
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
      { age: 1, remainingYears: 79.8 },
      { age: 2, remainingYears: 78.8 },
    ],
    female: [
      { age: 0, remainingYears: 86.4 },
      { age: 1, remainingYears: 85.6 },
      { age: 2, remainingYears: 84.6 },
    ],
  },
  // years[0] 은 현행 연도이고 tables 와 값이 같아야 한다 (validator 강제).
  years: [
    {
      mortalityBaseYear: 2023,
      ageFrom: 0,
      male: [80.6, 79.8, 78.8],
      female: [86.4, 85.6, 84.6],
    },
    {
      mortalityBaseYear: 2022,
      ageFrom: 0,
      male: [79.86, 79.05, 78.07],
      female: [85.62, 84.81, 83.83],
    },
  ],
};

describe("life-expectancy dataset (loader + version tag)", () => {
  it("loads the default dataset with version 1.1.0 and the 2023 mortality base year", () => {
    const ds = loadLifeExpectancyTable();
    expect(ds.version).toBe("1.1.0");
    expect(ds.publicationYear).toBe(2024);
    expect(ds.mortalityBaseYear).toBe(2023);
    // 종전에는 보도자료 기준값 5개만 있었다. 이제 0~100세가 1세 단위로 다 찬다.
    expect(ds.tables.male).toHaveLength(101);
    expect(ds.tables.female).toHaveLength(101);
  });

  it("emits life-expectancy/v1.1.0 version tag", () => {
    expect(lifeExpectancyDatasetVersionTag(loadLifeExpectancyTable())).toBe(
      "life-expectancy/v1.1.0",
    );
  });

  it("bundles the canonical 통계청 보도자료 anchors per sex", () => {
    const ds = loadLifeExpectancyTable();
    expect(getLifeExpectancyAt(ds, "male", 0)).toBe(80.6);
    expect(getLifeExpectancyAt(ds, "female", 0)).toBe(86.4);
    expect(getLifeExpectancyAt(ds, "male", 40)).toBe(41.6);
    expect(getLifeExpectancyAt(ds, "female", 40)).toBe(47.2);
    expect(getLifeExpectancyAt(ds, "male", 60)).toBe(23.4);
    expect(getLifeExpectancyAt(ds, "female", 60)).toBe(28.2);
    expect(getLifeExpectancyAt(ds, "male", 65)).toBe(19.2);
    expect(getLifeExpectancyAt(ds, "female", 65)).toBe(23.6);
    expect(getLifeExpectancyAt(ds, "male", 80)).toBe(8.3);
    expect(getLifeExpectancyAt(ds, "female", 80)).toBe(10.7);
  });

  it("0~100세 전 구간이 값을 돌려주고 101세부터 undefined", () => {
    const ds = loadLifeExpectancyTable();
    for (let age = 0; age <= 100; age++) {
      expect(getLifeExpectancyAt(ds, "male", age), `male ${age}`).toBeTypeOf("number");
      expect(getLifeExpectancyAt(ds, "female", age), `female ${age}`).toBeTypeOf("number");
    }
    // 원자료에 101세 이상이 없다. 보간해서 만들어 내지 않는다.
    expect(getLifeExpectancyAt(ds, "male", 101)).toBeUndefined();
    expect(getLifeExpectancyAt(ds, "female", 120)).toBeUndefined();
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
    expect(getLifeExpectancyAt(BASE_DATASET, "male", 1)).toBe(79.8);
    expect(getLifeExpectancyAt(BASE_DATASET, "female", 1)).toBe(85.6);
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

describe("life-expectancy dataset (연도별 표)", () => {
  it("1991~2023 사망률 기준연도 33개년을 최신 우선으로 담는다", () => {
    const years = listLifeExpectancyYears(loadLifeExpectancyTable());
    expect(years).toHaveLength(33);
    expect(years[0]).toBe(2023);
    expect(years.at(-1)).toBe(1991);
    expect(years).toEqual([...years].sort((a, b) => b - a));
  });

  it("각 연도 표가 0~100세를 남녀 모두 채운다", () => {
    for (const year of loadLifeExpectancyTable().years) {
      expect(year.ageFrom, String(year.mortalityBaseYear)).toBe(0);
      expect(year.male, String(year.mortalityBaseYear)).toHaveLength(101);
      expect(year.female, String(year.mortalityBaseYear)).toHaveLength(101);
    }
  });

  it("2023년표가 통계청 보도자료 기준값 10개와 일치하고 2022년표는 어긋난다", () => {
    const ds = loadLifeExpectancyTable();
    const anchors: Array<[number, number, number]> = [
      [0, 80.6, 86.4],
      [40, 41.6, 47.2],
      [60, 23.4, 28.2],
      [65, 19.2, 23.6],
      [80, 8.3, 10.7],
    ];
    for (const [age, male, female] of anchors) {
      expect(getLifeExpectancyAtYear(ds, "male", age, 2023), `male ${age}`).toBe(male);
      expect(getLifeExpectancyAtYear(ds, "female", age, 2023), `female ${age}`).toBe(female);
      // 대조군. 연도 키가 실제로 표를 가른다는 증거이며, 여기가 같아지면 연도 lookup 이
      // 죽고 아무 연도나 현행 표를 돌려주고 있다는 뜻이다.
      expect(getLifeExpectancyAtYear(ds, "male", age, 2022), `male ${age} (2022)`).not.toBe(male);
    }
  });

  it("연도별 잔여수명은 나이가 오를수록 줄어든다", () => {
    const ds = loadLifeExpectancyTable();
    for (const year of ds.years) {
      for (const sex of ["male", "female"] as const) {
        for (let age = 1; age <= 100; age++) {
          expect(
            year[sex][age]! <= year[sex][age - 1]!,
            `${year.mortalityBaseYear} ${sex} ${age}`,
          ).toBe(true);
        }
      }
    }
  });

  it("수록되지 않은 연도·나이는 undefined (보간하지 않는다)", () => {
    const ds = loadLifeExpectancyTable();
    expect(getLifeExpectancyAtYear(ds, "male", 40, 1990)).toBeUndefined();
    expect(getLifeExpectancyAtYear(ds, "male", 40, 2024)).toBeUndefined();
    expect(getLifeExpectancyAtYear(ds, "male", 101, 2023)).toBeUndefined();
    expect(() => getLifeExpectancyAtYear(ds, "male", 121, 2023)).toThrow(RangeError);
  });

  it("years[0] 과 tables 는 같은 표다", () => {
    const ds = loadLifeExpectancyTable();
    for (let age = 0; age <= 100; age++) {
      expect(getLifeExpectancyAt(ds, "male", age), `male ${age}`).toBe(
        getLifeExpectancyAtYear(ds, "male", age, ds.mortalityBaseYear),
      );
      expect(getLifeExpectancyAt(ds, "female", age), `female ${age}`).toBe(
        getLifeExpectancyAtYear(ds, "female", age, ds.mortalityBaseYear),
      );
    }
  });

  it("years[0] 이 tables 와 어긋나면 로드를 거부한다", () => {
    const ds = loadLifeExpectancyTable();
    const broken = {
      ...ds,
      years: [
        { ...ds.years[0]!, male: ds.years[0]!.male.map((v, i) => (i === 5 ? v + 1 : v)) },
        ...ds.years.slice(1),
      ],
    };
    expect(() => loadLifeExpectancyTable(broken)).toThrow(RangeError);
  });

  it("연도 정렬이 뒤집히거나 중복이면 거부한다", () => {
    const ds = loadLifeExpectancyTable();
    expect(() => loadLifeExpectancyTable({ ...ds, years: [...ds.years].reverse() })).toThrow(
      RangeError,
    );
    expect(() => loadLifeExpectancyTable({ ...ds, years: [ds.years[0]!, ds.years[0]!] })).toThrow(
      RangeError,
    );
  });
});
