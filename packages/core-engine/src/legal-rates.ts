import type { IsoDate, LegalRateCode } from "./types";

/**
 * `data/legal-rates/v{N}.json`의 한 항목.
 * `previousVersions`는 동일 code의 과거 이율 (현재 → 과거 순서 무관, validFrom 기준 정렬은 로더 책임).
 */
export interface LegalRateRecord {
  code: LegalRateCode;
  label_ko: string;
  annualRate: number;
  validFrom: IsoDate;
  validTo: IsoDate | null;
  previousVersions?: Array<{
    annualRate: number;
    validFrom: IsoDate;
    validTo: IsoDate;
  }>;
}

export interface LegalRateDataset {
  /** Semver. .lcalc 파일과 InterestResult.dataVersion에 그대로 반영된다. */
  version: string;
  /** 데이터셋 갱신일 (YYYY-MM-DD). */
  updatedAt: IsoDate;
  rates: LegalRateRecord[];
}

/**
 * data/legal-rates/v1.json을 로드한다.
 *
 * 구현 예정 (W2):
 * - 패키지 내 fixture 또는 워크스페이스 루트 data/ 디렉토리에서 읽기
 * - 스키마 검증 (validFrom <= validTo, code unique, etc.)
 */
export function loadLegalRates(): LegalRateDataset {
  throw new Error("loadLegalRates is not implemented yet (W2)");
}
