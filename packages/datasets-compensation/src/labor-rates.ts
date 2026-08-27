import { DEFAULT_LABOR_RATES_DATASET } from "./labor-rates.dataset.generated";
import type { IsoDate } from "./types";

/**
 * 대한건설협회 시중노임 단가 데이터셋.
 *
 * `slices` 는 적용일(`effectiveFrom`) 오름차순이고 직종별 일당(원/일)을 `rates` 에
 * `[직종명]: 단가` 로 담는다. 적용일은 **상반기 1월 1일, 하반기 9월 1일** 이다 (7월 1일이
 * 아니다). 보고서 첫 장의 "본 조사 보고서는 YYYY. 9. 1부터 적용하시기 바랍니다" 와 본문
 * 평균임금현황 표의 공표일 열이 근거다.
 *
 * 해당 반기에 조사되지 않은 직종은 `rates` 에 넣지 않는다 (보고서 `-` 표기). 조회는
 * `undefined` 를 반환하고, 화면은 사용자 일당 직접 입력으로 넘어간다.
 *
 * `occupationMerges` 는 2010년 1월 1일 공표분의 직종 통합 내역이다. **조회 시 자동 대체는
 * 하지 않는다** — `갱부` 로 2015년 단가를 물으면 `undefined` 다. 조용히 `특별인부` 단가를
 * 주면 사용자가 고르지 않은 직종의 임금으로 일실수입이 계산된다.
 */
/** 2010년 직종 통합 한 건. `mergedFrom` 의 이름들은 그 시점 이후 공표되지 않는다. */
export interface LaborRateOccupationMerge {
  mergedInto: string;
  mergedFrom: string[];
}

export interface LaborRateOccupationMerges {
  effectiveFrom: IsoDate;
  sourceRef: string;
  note: string;
  entries: LaborRateOccupationMerge[];
}

/** 조사 직종수·표본 조정 이력 (보고서 조사연혁). */
export interface LaborRateSurveyChange {
  /** `YYYY-MM`. 조사 시점이며 공표 시점과 다르다. */
  at: string;
  change: string;
}

export interface LaborRatesSlice {
  /** 적용일 (YYYY-MM-DD). 상반기 1월 1일 / 하반기 9월 1일. slices 안 오름차순. */
  effectiveFrom: IsoDate;
  /** 적용 연도. 원자료 키를 그대로 보존한다 (effectiveFrom 은 여기서 파생한 값이다). */
  year: number;
  /** 반기 구분 (1 = 상반기, 2 = 하반기). */
  half: 1 | 2;
  /**
   * 대한건설협회 발표/공표일 (YYYY-MM-DD). 게시판에서 확인한 회차만 있다.
   * 과거 회차는 발표일을 확인하지 못해 비어 있다.
   */
  announcementDate?: IsoDate;
  /** 대한건설협회 발표 게시판 또는 PDF URL. */
  announcementUrl?: string;
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
  surveyHistory?: LaborRateSurveyChange[];
  surveyHistorySourceRef?: string;
  occupationMerges?: LaborRateOccupationMerges;
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
    if (slice.announcementDate !== undefined) {
      validateIsoDate(`slices[${i}].announcementDate`, slice.announcementDate);
    }
    if (!Number.isInteger(slice.year) || slice.year < 1900) {
      throw new RangeError(`LaborRatesDataset: slices[${i}].year is invalid (${slice.year})`);
    }
    if (slice.half !== 1 && slice.half !== 2) {
      throw new RangeError(
        `LaborRatesDataset: slices[${i}].half must be 1 or 2 (got ${String(slice.half)})`,
      );
    }
    // 적용일은 반기에서 파생한다. 상반기 1월 1일 / 하반기 9월 1일. 둘이 어긋나면 어느 쪽이
    // 맞는지 알 수 없게 되므로 로드 시점에 막는다.
    const expected = slice.half === 1 ? `${slice.year}-01-01` : `${slice.year}-09-01`;
    if (slice.effectiveFrom !== expected) {
      throw new RangeError(
        `LaborRatesDataset: slices[${i}].effectiveFrom "${slice.effectiveFrom}" does not match ` +
          `year ${slice.year} half ${slice.half} (expected "${expected}")`,
      );
    }
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
  validateOccupationMerges(dataset);
}

/**
 * 직종 통합 내역 검증.
 *
 * 핵심은 마지막 검사다. 통합으로 사라진 직종명이 통합 시점 이후 슬라이스의 `rates` 에
 * 남아 있으면 안 된다. 그 값은 대한건설협회가 공표한 그 직종의 단가가 아니라 후속 직종의
 * 단가를 이어 붙인 파생값이고, 공표된 단가와 섞이면 구분할 방법이 없다.
 */
function validateOccupationMerges(dataset: LaborRatesDataset): void {
  const merges = dataset.occupationMerges;
  if (merges === undefined) {
    return;
  }
  validateIsoDate("occupationMerges.effectiveFrom", merges.effectiveFrom);
  if (!Array.isArray(merges.entries) || merges.entries.length === 0) {
    throw new RangeError("LaborRatesDataset: occupationMerges.entries must be a non-empty array");
  }
  const retired = new Set<string>();
  for (const [i, entry] of merges.entries.entries()) {
    if (!entry.mergedInto) {
      throw new RangeError(
        `LaborRatesDataset: occupationMerges.entries[${i}].mergedInto is required`,
      );
    }
    if (!Array.isArray(entry.mergedFrom) || entry.mergedFrom.length === 0) {
      throw new RangeError(
        `LaborRatesDataset: occupationMerges.entries[${i}].mergedFrom must be a non-empty array`,
      );
    }
    for (const from of entry.mergedFrom) {
      if (from === entry.mergedInto) {
        throw new RangeError(
          `LaborRatesDataset: occupationMerges.entries[${i}] merges "${from}" into itself`,
        );
      }
      // 한 직종이 여러 직종으로 갈릴 수 있다. 예: 절단공은 철근공·철공·철판공·철골공
      // 넷에 각각 흡수됐다. 중복 등장을 오류로 보면 안 된다.
      retired.add(from);
    }
  }
  for (const [i, slice] of dataset.slices.entries()) {
    if (slice.effectiveFrom < merges.effectiveFrom) {
      continue;
    }
    for (const occupation of Object.keys(slice.rates)) {
      if (retired.has(occupation)) {
        throw new RangeError(
          `LaborRatesDataset: slices[${i}] ("${slice.effectiveFrom}") still carries the merged-away ` +
            `occupation "${occupation}"`,
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

/**
 * 직종이 2010년 통합으로 사라졌는지, 사라졌다면 어느 직종으로 흡수됐는지 돌려준다.
 *
 * `getLaborRateAt` 이 `undefined` 를 돌려줬을 때 화면이 이유를 설명하기 위한 것이다.
 * 단가를 대신 계산해 주지는 않는다. 한 직종이 여러 직종으로 갈린 경우가 있어 `mergedInto`
 * 는 배열이다.
 */
export function findOccupationMerge(
  dataset: LaborRatesDataset,
  occupation: string,
): { mergedInto: string[]; effectiveFrom: IsoDate } | undefined {
  const merges = dataset.occupationMerges;
  if (!merges) {
    return undefined;
  }
  // 하나가 여럿으로 갈리는 경우가 있어 배열로 돌려준다 (절단공 → 철근공·철공·철판공·철골공).
  const mergedInto = merges.entries
    .filter((entry) => entry.mergedFrom.includes(occupation))
    .map((entry) => entry.mergedInto);
  return mergedInto.length > 0 ? { mergedInto, effectiveFrom: merges.effectiveFrom } : undefined;
}

/** `date` 기준으로 적용되는 슬라이스에서 조회 가능한 직종 목록. UI 선택지용. */
export function listOccupationsAt(dataset: LaborRatesDataset, date: IsoDate): string[] {
  validateIsoDate("date", date);
  let selected: LaborRatesSlice | undefined;
  for (const slice of dataset.slices) {
    if (slice.effectiveFrom <= date) {
      selected = slice;
    } else {
      break;
    }
  }
  return selected ? Object.keys(selected.rates).sort() : [];
}
