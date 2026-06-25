import { DEFAULT_LEGAL_RATES_DATASET } from "./legal-rates.dataset.generated";
import type { IsoDate, LegalRateCode } from "./types";

/**
 * `data/legal-rates/v{N}.json`의 한 항목.
 * `previousVersions`는 동일 code의 과거 이율.
 * 로더가 항상 validFrom 내림차순 정렬을 보장한다.
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
 * 기본 법정이율 데이터셋. 워크스페이스 루트 `data/legal-rates/v1.json`이 single source 이며,
 * `scripts/sync-legal-rates.mjs` 가 빌드 타임에 `legal-rates.dataset.generated.ts` 로 인라인한다.
 * 수동 동기화하지 않는다.
 *
 * 출처:
 * - 민법 제379조 (1958-02-22 시행, 연 5%)
 * - 상법 제54조 (1962-01-20 시행, 연 6%)
 * - 소송촉진 등에 관한 특례법 제3조 (대통령령 변경 이력 포함)
 */
const DEFAULT_DATASET: LegalRateDataset = DEFAULT_LEGAL_RATES_DATASET;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, context: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${context}: invalid ISO date "${value}"`);
  }
}

/**
 * 데이터셋의 최소 정합성을 검증한다 (code unique, validFrom <= validTo, prev 구간 정합).
 */
function validate(dataset: LegalRateDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("LegalRateDataset: version/updatedAt are required");
  }
  assertIsoDate(dataset.updatedAt, "updatedAt");
  const seen = new Set<LegalRateCode>();
  for (const r of dataset.rates) {
    if (seen.has(r.code)) {
      throw new Error(`LegalRateDataset: duplicate code "${r.code}"`);
    }
    seen.add(r.code);
    assertIsoDate(r.validFrom, `${r.code}.validFrom`);
    if (r.validTo !== null) {
      assertIsoDate(r.validTo, `${r.code}.validTo`);
      if (r.validTo < r.validFrom) {
        throw new RangeError(`${r.code}: validTo < validFrom`);
      }
    }
    if (r.annualRate < 0) {
      throw new RangeError(`${r.code}: annualRate must be >= 0`);
    }
    for (const prev of r.previousVersions ?? []) {
      assertIsoDate(prev.validFrom, `${r.code}.previousVersions[].validFrom`);
      assertIsoDate(prev.validTo, `${r.code}.previousVersions[].validTo`);
      if (prev.validTo < prev.validFrom) {
        throw new RangeError(`${r.code}: prev validTo < validFrom`);
      }
      if (prev.validTo >= r.validFrom) {
        throw new RangeError(
          `${r.code}: previous validTo (${prev.validTo}) overlaps current validFrom (${r.validFrom})`,
        );
      }
    }
  }
}

/**
 * 기본 인라인 데이터셋 또는 호출자가 제공한 외부 데이터셋을 검증해 반환한다.
 *
 * @internal core-engine 내부 전용. 외부 consumer 는 `calculateInterest(input, { dataset })`
 * 으로 dataset 을 주입한다 (B9, v0.2). 본 함수는 시그니처 호환을 위해 export 를 유지하지만
 * `index.ts` public surface 에서는 빠진다.
 */
export function loadLegalRates(override?: LegalRateDataset): LegalRateDataset {
  const dataset = override ?? DEFAULT_DATASET;
  validate(dataset);
  return dataset;
}

/**
 * 데이터셋 식별자 (`legal-rates/vX.Y.Z`).
 * `InterestResult.dataVersion`에 그대로 기록된다.
 */
export function datasetVersionTag(dataset: LegalRateDataset): string {
  return `legal-rates/v${dataset.version}`;
}

/**
 * 변경 이력 평면 리스트 (현재 + previousVersions, validFrom 오름차순).
 * `[validFrom, validTo|null, rate]` 튜플로 반환되어 segments에서 자동 분할에 쓰인다.
 */
export function rateHistoryFor(
  dataset: LegalRateDataset,
  code: LegalRateCode,
): Array<{ from: IsoDate; to: IsoDate | null; rate: number }> {
  const record = dataset.rates.find((r) => r.code === code);
  if (!record) return [];
  const all: Array<{ from: IsoDate; to: IsoDate | null; rate: number }> = [];
  for (const prev of record.previousVersions ?? []) {
    all.push({ from: prev.validFrom, to: prev.validTo, rate: prev.annualRate });
  }
  all.push({ from: record.validFrom, to: record.validTo, rate: record.annualRate });
  all.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return all;
}
