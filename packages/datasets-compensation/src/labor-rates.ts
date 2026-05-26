import { DEFAULT_LABOR_RATES_DATASET } from "./labor-rates.dataset.generated";
import type { IsoDate } from "./types";

/**
 * 대한건설협회 시중노임 단가 데이터셋.
 *
 * `slices` 는 대한건설협회 적용일 (`effectiveFrom`) 오름차순 정원. 직종별 일당 (원/일) 은
 * `rates` 객체에 `[직종명]: 단가` 로 박음. v1.0.0 = slice 메타 scaffold 정원이며
 * 본 commit 시점 직종별 raw 단가는 0건 (`rates: {}`). 본문은 별 commit 으로
 * 갱신, UI 측 사용자 raw 일당 override 가 stale/scaffold lag 의 우회 path.
 */
export interface LaborRatesSlice {
  /** 대한건설협회 적용일 (YYYY-MM-DD). slices 안 오름차순 정원. */
  effectiveFrom: IsoDate;
  /** 대한건설협회 발표/공표일 (YYYY-MM-DD). */
  announcementDate: IsoDate;
  /** 대한건설협회 발표 게시판 또는 PDF URL. */
  announcementUrl: string;
  /** 발표 보고서 제목 (예: "2026년 상반기 적용 건설업 임금실태조사 보고서"). */
  title?: string;
  /** 직종명 → 일당 (원/일). 빈 객체 허용 (scaffold). */
  rates: Readonly<Record<string, number>>;
}

export interface LaborRatesDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: IsoDate;
  snapshotMethod?: string;
  slices: LaborRatesSlice[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateIsoDate(label: string, value: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`LaborRatesDataset: invalid ${label} "${value}"`);
  }
}

function validate(dataset: LaborRatesDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("LaborRatesDataset: version/updatedAt are required");
  }
  validateIsoDate("updatedAt", dataset.updatedAt);
  validateIsoDate("snapshotDate", dataset.snapshotDate);
  if (!Array.isArray(dataset.slices) || dataset.slices.length === 0) {
    throw new RangeError("LaborRatesDataset: slices must be a non-empty array");
  }
  let prevEffective = "";
  for (let i = 0; i < dataset.slices.length; i++) {
    const slice = dataset.slices[i] as LaborRatesSlice;
    validateIsoDate(`slices[${i}].effectiveFrom`, slice.effectiveFrom);
    validateIsoDate(`slices[${i}].announcementDate`, slice.announcementDate);
    if (slice.effectiveFrom <= prevEffective) {
      throw new RangeError(
        `LaborRatesDataset: slices must be strictly ascending by effectiveFrom (slices[${i}] "${slice.effectiveFrom}" <= "${prevEffective}")`,
      );
    }
    prevEffective = slice.effectiveFrom;
    if (!slice.rates || typeof slice.rates !== "object") {
      throw new RangeError(`LaborRatesDataset: slices[${i}].rates must be an object`);
    }
    const seenOccupations = new Set<string>();
    for (const [occupation, rate] of Object.entries(slice.rates)) {
      if (!occupation) {
        throw new RangeError(
          `LaborRatesDataset: slices[${i}].rates contains an empty occupation key`,
        );
      }
      if (seenOccupations.has(occupation)) {
        throw new RangeError(
          `LaborRatesDataset: slices[${i}].rates has a duplicate occupation "${occupation}"`,
        );
      }
      seenOccupations.add(occupation);
      if (!Number.isFinite(rate) || rate <= 0) {
        throw new RangeError(
          `LaborRatesDataset: slices[${i}].rates["${occupation}"] must be a positive finite number (got ${rate})`,
        );
      }
    }
  }
}

/**
 * 기본 labor-rates dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 * `data/labor-rates/v1.json` 이 source 이며 `sync-labor-rates.mjs` 가 빌드 타임에 inline 한다.
 */
export function loadLaborRatesTable(override?: LaborRatesDataset): LaborRatesDataset {
  const dataset = override ?? DEFAULT_LABOR_RATES_DATASET;
  validate(dataset);
  return dataset;
}

/** dataset 식별자 (`labor-rates/vX.Y.Z`). 결과 객체 `dataVersions.laborRates` 에 기록된다. */
export function laborRatesDatasetVersionTag(dataset: LaborRatesDataset): string {
  return `labor-rates/v${dataset.version}`;
}

/**
 * `date` 기준 가장 최근 slice (`effectiveFrom <= date`) 에서 직종 단가를 lookup 한다.
 *
 * - `date` 가 모든 slice 의 `effectiveFrom` 보다 빠르면 `undefined` 반환.
 * - 직종이 범위 외이거나 slice 가 scaffold (`rates: {}`) 면 `undefined` 반환.
 *
 * `getLaborRateAt` 가 `undefined` 를 반환할 때 UI 측 (트랙 U 5-1) 은 사용자 raw 일당 override
 * input 으로 fall through.
 */
export function getLaborRateAt(
  dataset: LaborRatesDataset,
  occupation: string,
  date: IsoDate,
): number | undefined {
  validateIsoDate("date", date);
  let selected: LaborRatesSlice | undefined;
  for (const slice of dataset.slices) {
    if (slice.effectiveFrom <= date) {
      selected = slice;
    } else {
      break;
    }
  }
  if (!selected) {
    return undefined;
  }
  const rate = selected.rates[occupation];
  return typeof rate === "number" ? rate : undefined;
}

/** dataset 의 가장 최근 slice `effectiveFrom`. stale UI badge 계산 root. */
export function latestSliceEffectiveFrom(dataset: LaborRatesDataset): IsoDate {
  if (dataset.slices.length === 0) {
    throw new RangeError("latestSliceEffectiveFrom: slices is empty");
  }
  return dataset.slices[dataset.slices.length - 1]!.effectiveFrom;
}
