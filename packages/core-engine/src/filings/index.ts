import { DEFAULT_CIVIL_FILING_DATASET } from "./civil.dataset.generated";
import { DEFAULT_CRIMINAL_FILING_DATASET } from "./criminal.dataset.generated";
import type {
  CivilFilingDataset,
  CivilFilingDocument,
  CriminalFilingDataset,
  CriminalFilingDocument,
} from "./types";

export type {
  CivilFilingDataset,
  CivilFilingDocument,
  CivilStamp,
  CivilStampKind,
  CriminalFilingDataset,
  CriminalFilingDocument,
  FilingKind,
  FilingRegulation,
} from "./types";

/**
 * 민사·형사 접수서류 안내. `data/court-filings-{civil,criminal}/v1.json` 이 single source 다.
 * 계산은 없고 예규 별표를 검색해 보여 준다.
 */
export function loadCivilFilings(dataset?: CivilFilingDataset): CivilFilingDataset {
  const ds = dataset ?? DEFAULT_CIVIL_FILING_DATASET;
  validate(ds, "CivilFilingDataset");
  return ds;
}

export function loadCriminalFilings(dataset?: CriminalFilingDataset): CriminalFilingDataset {
  const ds = dataset ?? DEFAULT_CRIMINAL_FILING_DATASET;
  validate(ds, "CriminalFilingDataset");
  return ds;
}

function validate(ds: CivilFilingDataset | CriminalFilingDataset, label: string): void {
  if (!ds.version || !ds.snapshotDate || !ds.regulation?.effectiveFrom) {
    throw new Error(`${label}: version/snapshotDate/regulation.effectiveFrom are required`);
  }
  if (!Array.isArray(ds.documents) || ds.documents.length === 0) {
    throw new Error(`${label}: documents must be a non-empty array`);
  }
}

export const civilFilingsVersionTag = (ds: CivilFilingDataset): string =>
  `court-filings-civil/v${ds.version}`;
export const criminalFilingsVersionTag = (ds: CriminalFilingDataset): string =>
  `court-filings-criminal/v${ds.version}`;

/**
 * 공백과 가운뎃점류를 무시한 비교용 문자열. 원문이 "가  철", "형소법361의3" 처럼 공백을 제멋대로
 * 두고, 같은 "열람·복사" 를 · (U+00B7), ․ (U+2024), ㆍ (U+318D) 로 섞어 쓴다.
 */
export const fold = (s: string): string =>
  s.replace(/[\s\u00B7\u2022\u2024\u2027\u2219\u22C5\u30FB\u318D\uFF65]+/g, "").toLowerCase();

/**
 * 서류 이름 또는 조문 칸의 부분 일치 검색. 검색어 안 공백·가운뎃점은 무시하고, 공백으로 나눈 낱말이
 * 여러 개면 모두 들어 있는 행만 낸다. 빈 검색어는 전체 목록이다. 순서는 별표 순서 그대로.
 */
export function searchFilings<T extends CivilFilingDocument | CriminalFilingDocument>(
  documents: readonly T[],
  query: string,
): T[] {
  const words = query
    .split(/\s+/)
    .filter((w) => w !== "")
    .map(fold);
  if (words.length === 0) return [...documents];
  return documents.filter((d) => {
    const hay = fold(`${d.name} ${d.article}`);
    return words.every((w) => hay.includes(w));
  });
}
