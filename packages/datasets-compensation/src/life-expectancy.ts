import { DEFAULT_LIFE_EXPECTANCY_DATASET } from "./life-expectancy.dataset.generated";
import type { IsoDate } from "./types";

/**
 * 통계청 생명표.
 *
 * 두 가지 표현을 함께 담는다.
 *
 *   - `tables`: **현행 표**(최신 사망률 기준연도)의 `(age, remainingYears)` 목록. 0~100세.
 *   - `years`:  사망률 기준연도별 전체 표. 나이가 0..100 으로 연속이라 객체 배열 대신
 *              `male: number[]` / `female: number[]` 압축 배열이다.
 *
 * `years[0]` 은 언제나 현행 연도이고 그 값은 `tables` 와 같다 (validator 가 강제).
 * 두 표현을 함께 두는 이유는 `getLifeExpectancyAt(dataset, sex, age)` 의 기존 시그니처를
 * 유지하기 위해서다 — 여기에 연도 인자를 끼워 넣으면 auto-injury / auto-death 두 엔진과
 * `.lcalc` 까지 파장이 간다. 사고일 기준 과거 표는 `getLifeExpectancyAtYear` 로 조회한다.
 *
 * **보간은 하지 않는다.** 0~100세는 1세 단위로 다 차 있고, 원자료에 없는 101세 이상은
 * `undefined` 를 반환한다.
 */
export type LifeExpectancySex = "male" | "female";

export interface LifeExpectancyEntry {
  /** 연령 (만 나이, 정수). */
  age: number;
  /** 잔여수명 (년 단위, KOSIS e(x)). */
  remainingYears: number;
}

/** 사망률 기준연도 한 해의 전체 표. 나이는 `ageFrom` 부터 배열 길이만큼 1세 단위로 이어진다. */
export interface LifeExpectancyYear {
  mortalityBaseYear: number;
  ageFrom: number;
  male: number[];
  female: number[];
}

export interface LifeExpectancyDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  sourceUrl: string;
  /** 수록 값이 정본과 같은지 대조한 방법과 결과. */
  verification?: string;
  license: string;
  snapshotDate: IsoDate;
  publicationYear: number;
  mortalityBaseYear: number;
  snapshotMethod?: string;
  tables: {
    male: LifeExpectancyEntry[];
    female: LifeExpectancyEntry[];
  };
  years: LifeExpectancyYear[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateIsoDate(label: string, value: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`LifeExpectancyDataset: invalid ${label} "${value}"`);
  }
}

function validateTable(label: string, entries: LifeExpectancyEntry[]): void {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new RangeError(`LifeExpectancyDataset: tables.${label} must be a non-empty array`);
  }
  const seenAges = new Set<number>();
  let prevAge = -1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as LifeExpectancyEntry;
    if (!Number.isInteger(entry.age) || entry.age < 0 || entry.age > 120) {
      throw new RangeError(
        `LifeExpectancyDataset: tables.${label}[${i}].age must be an integer in [0, 120] (got ${entry.age})`,
      );
    }
    if (seenAges.has(entry.age)) {
      throw new RangeError(
        `LifeExpectancyDataset: tables.${label} has a duplicate age ${entry.age}`,
      );
    }
    if (entry.age <= prevAge) {
      throw new RangeError(
        `LifeExpectancyDataset: tables.${label} must be strictly ascending by age (entry ${i} age ${entry.age} <= ${prevAge})`,
      );
    }
    seenAges.add(entry.age);
    prevAge = entry.age;
    if (!Number.isFinite(entry.remainingYears) || entry.remainingYears <= 0) {
      throw new RangeError(
        `LifeExpectancyDataset: tables.${label}[${i}].remainingYears must be a positive finite number (got ${entry.remainingYears})`,
      );
    }
  }
}

function validate(dataset: LifeExpectancyDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("LifeExpectancyDataset: version/updatedAt are required");
  }
  validateIsoDate("updatedAt", dataset.updatedAt);
  validateIsoDate("snapshotDate", dataset.snapshotDate);
  if (!Number.isInteger(dataset.publicationYear) || dataset.publicationYear < 1900) {
    throw new RangeError(
      `LifeExpectancyDataset: invalid publicationYear ${dataset.publicationYear}`,
    );
  }
  if (
    !Number.isInteger(dataset.mortalityBaseYear) ||
    dataset.mortalityBaseYear < 1900 ||
    dataset.mortalityBaseYear > dataset.publicationYear
  ) {
    throw new RangeError(
      `LifeExpectancyDataset: invalid mortalityBaseYear ${dataset.mortalityBaseYear} (publicationYear ${dataset.publicationYear})`,
    );
  }
  if (!dataset.tables || typeof dataset.tables !== "object") {
    throw new RangeError("LifeExpectancyDataset: tables must be an object");
  }
  validateTable("male", dataset.tables.male);
  validateTable("female", dataset.tables.female);
  validateYears(dataset);
}

function validateYearSeries(label: string, values: number[], context: string): void {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError(`LifeExpectancyDataset: ${context}.${label} must be a non-empty array`);
  }
  for (let i = 0; i < values.length; i++) {
    const value = values[i] as number;
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `LifeExpectancyDataset: ${context}.${label}[${i}] must be a positive finite number (got ${value})`,
      );
    }
    // 잔여수명은 나이가 오를수록 줄어든다. 뒤집혀 있으면 열이 밀렸다는 뜻이다.
    const prev = values[i - 1];
    if (prev !== undefined && value > prev) {
      throw new RangeError(
        `LifeExpectancyDataset: ${context}.${label} must be non-increasing by age ` +
          `(index ${i} value ${value} > ${prev})`,
      );
    }
  }
}

/**
 * 연도별 표 검증.
 *
 * 핵심은 마지막 항목이다. `years[0]` 과 `tables` 는 같은 표를 다른 모양으로 담고 있어서,
 * 한쪽만 갱신되면 조회 경로에 따라 다른 값이 나온다. 그 어긋남을 여기서 막는다.
 */
function validateYears(dataset: LifeExpectancyDataset): void {
  const { years } = dataset;
  if (!Array.isArray(years) || years.length === 0) {
    throw new RangeError("LifeExpectancyDataset: years must be a non-empty array");
  }
  const seen = new Set<number>();
  let prevYear: number | null = null;
  for (const [i, entry] of years.entries()) {
    const context = `years[${i}]`;
    if (!Number.isInteger(entry.mortalityBaseYear) || entry.mortalityBaseYear < 1900) {
      throw new RangeError(
        `LifeExpectancyDataset: ${context}.mortalityBaseYear is invalid (${entry.mortalityBaseYear})`,
      );
    }
    if (seen.has(entry.mortalityBaseYear)) {
      throw new RangeError(
        `LifeExpectancyDataset: years has a duplicate mortalityBaseYear ${entry.mortalityBaseYear}`,
      );
    }
    seen.add(entry.mortalityBaseYear);
    if (prevYear !== null && entry.mortalityBaseYear >= prevYear) {
      throw new RangeError(
        `LifeExpectancyDataset: years must be sorted by mortalityBaseYear DESC ` +
          `(${context} ${entry.mortalityBaseYear} >= previous ${prevYear})`,
      );
    }
    prevYear = entry.mortalityBaseYear;
    if (!Number.isInteger(entry.ageFrom) || entry.ageFrom < 0) {
      throw new RangeError(
        `LifeExpectancyDataset: ${context}.ageFrom is invalid (${entry.ageFrom})`,
      );
    }
    validateYearSeries("male", entry.male, context);
    validateYearSeries("female", entry.female, context);
    if (entry.male.length !== entry.female.length) {
      throw new RangeError(
        `LifeExpectancyDataset: ${context} male/female length mismatch ` +
          `(${entry.male.length} vs ${entry.female.length})`,
      );
    }
  }

  const current = years[0] as LifeExpectancyYear;
  if (current.mortalityBaseYear !== dataset.mortalityBaseYear) {
    throw new RangeError(
      `LifeExpectancyDataset: years[0].mortalityBaseYear (${current.mortalityBaseYear}) must equal ` +
        `dataset.mortalityBaseYear (${dataset.mortalityBaseYear})`,
    );
  }
  for (const sex of ["male", "female"] as const) {
    const entries = dataset.tables[sex];
    if (entries.length !== current[sex].length) {
      throw new RangeError(
        `LifeExpectancyDataset: tables.${sex} (${entries.length}) and years[0].${sex} ` +
          `(${current[sex].length}) must cover the same ages`,
      );
    }
    for (const [i, entry] of entries.entries()) {
      if (entry.age !== current.ageFrom + i) {
        throw new RangeError(
          `LifeExpectancyDataset: tables.${sex}[${i}].age (${entry.age}) does not line up with ` +
            `years[0] (ageFrom ${current.ageFrom})`,
        );
      }
      if (entry.remainingYears !== current[sex][i]) {
        throw new RangeError(
          `LifeExpectancyDataset: tables.${sex} and years[0].${sex} disagree at age ${entry.age} ` +
            `(${entry.remainingYears} vs ${String(current[sex][i])})`,
        );
      }
    }
  }
}

/**
 * 기본 life-expectancy dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 * `data/life-expectancy/v1.json` 이 source 이며 `sync-life-expectancy.mjs` 가
 * 빌드 타임에 inline 한다.
 */
export function loadLifeExpectancyTable(override?: LifeExpectancyDataset): LifeExpectancyDataset {
  const dataset = override ?? DEFAULT_LIFE_EXPECTANCY_DATASET;
  validate(dataset);
  return dataset;
}

/** dataset 식별자 (`life-expectancy/vX.Y.Z`). 결과 객체 `dataVersions.lifeExpectancy` 에 기록된다. */
export function lifeExpectancyDatasetVersionTag(dataset: LifeExpectancyDataset): string {
  return `life-expectancy/v${dataset.version}`;
}

/**
 * 성별 + 연령의 잔여수명을 lookup 한다. anchor entries 정확 일치 시만 정확,
 * 미일치 시 `undefined` 반환 (v1.0.0 보간 0 정원).
 */
export function getLifeExpectancyAt(
  dataset: LifeExpectancyDataset,
  sex: LifeExpectancySex,
  age: number,
): number | undefined {
  if (sex !== "male" && sex !== "female") {
    throw new RangeError(
      `getLifeExpectancyAt: sex must be "male" | "female" (got "${String(sex)}")`,
    );
  }
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new RangeError(`getLifeExpectancyAt: age must be an integer in [0, 120] (got ${age})`);
  }
  const entries = dataset.tables[sex];
  for (const entry of entries) {
    if (entry.age === age) {
      return entry.remainingYears;
    }
    if (entry.age > age) {
      break;
    }
  }
  return undefined;
}

/** 수록된 사망률 기준연도 목록 (최신 우선). */
export function listLifeExpectancyYears(dataset: LifeExpectancyDataset): number[] {
  return dataset.years.map((y) => y.mortalityBaseYear);
}

/**
 * 사망률 기준연도를 지정한 잔여수명 lookup. 사고일 기준 과거 표 조회용이다.
 *
 * 해당 연도가 수록돼 있지 않거나 그 연도 표에 그 나이가 없으면 `undefined`. 여기서도 보간은
 * 하지 않는다 — 없는 값을 만들어 내면 판결문에 들어갈 금액이 근거 없이 달라진다.
 */
export function getLifeExpectancyAtYear(
  dataset: LifeExpectancyDataset,
  sex: LifeExpectancySex,
  age: number,
  mortalityBaseYear: number,
): number | undefined {
  if (sex !== "male" && sex !== "female") {
    throw new RangeError(
      `getLifeExpectancyAtYear: sex must be "male" | "female" (got "${String(sex)}")`,
    );
  }
  if (!Number.isInteger(age) || age < 0 || age > 120) {
    throw new RangeError(
      `getLifeExpectancyAtYear: age must be an integer in [0, 120] (got ${age})`,
    );
  }
  const year = dataset.years.find((y) => y.mortalityBaseYear === mortalityBaseYear);
  if (!year) {
    return undefined;
  }
  const index = age - year.ageFrom;
  if (index < 0 || index >= year[sex].length) {
    return undefined;
  }
  return year[sex][index];
}
