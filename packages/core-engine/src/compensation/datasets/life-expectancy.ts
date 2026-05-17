import { DEFAULT_LIFE_EXPECTANCY_DATASET } from "./life-expectancy.dataset.generated";
import type { IsoDate } from "../../types";

/**
 * 통계청 KOSIS 생명표 snapshot.
 *
 * `tables.male` / `tables.female` 각각 `(age, remainingYears)` 의 anchor list.
 * v1.0.0 = KOSIS 2023년 사망률 기준 보도자료 본문 anchor (0 / 60 / 80) only.
 * 0~120세 1세 단위 full table 은 별 commit 갱신 정원이며 그 사이 trail
 * `getLifeExpectancyAt` 는 anchor 미일치 시 `undefined` 반환 (보간 0 정원).
 */
export type LifeExpectancySex = "male" | "female";

export interface LifeExpectancyEntry {
  /** 연령 (만 나이, 정수). */
  age: number;
  /** 잔여수명 (년 단위, KOSIS e(x)). */
  remainingYears: number;
}

export interface LifeExpectancyDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: IsoDate;
  publicationYear: number;
  mortalityBaseYear: number;
  snapshotMethod?: string;
  tables: {
    male: LifeExpectancyEntry[];
    female: LifeExpectancyEntry[];
  };
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
    throw new RangeError(`getLifeExpectancyAt: sex must be "male" | "female" (got "${sex}")`);
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
