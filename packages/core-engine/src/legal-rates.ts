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
 * core-engine 안에 인라인된 기본 데이터셋. 워크스페이스 루트 `data/legal-rates/v1.json`과
 * 동기화한다 (수동). 패키지를 npm 단독 배포해도 동작하도록 inline.
 *
 * 출처:
 * - 민법 제379조 (1958-02-22 시행, 연 5%)
 * - 상법 제54조 (1962-01-20 시행, 연 6%)
 * - 소송촉진 등에 관한 특례법 제3조 (대통령령 변경 이력 포함)
 */
const DEFAULT_DATASET: LegalRateDataset = {
  version: "1.0.0",
  updatedAt: "2026-05-09",
  rates: [
    {
      code: "civil",
      label_ko: "민법 제379조 (법정이율)",
      annualRate: 0.05,
      validFrom: "1958-02-22",
      validTo: null,
    },
    {
      code: "commercial",
      label_ko: "상법 제54조 (상사법정이율)",
      annualRate: 0.06,
      validFrom: "1962-01-20",
      validTo: null,
    },
    {
      code: "promotion",
      label_ko: "소송촉진 등에 관한 특례법 제3조",
      annualRate: 0.12,
      validFrom: "2019-06-01",
      validTo: null,
      previousVersions: [
        { annualRate: 0.15, validFrom: "2015-10-01", validTo: "2019-05-31" },
        { annualRate: 0.2, validFrom: "2003-06-01", validTo: "2015-09-30" },
      ],
    },
  ],
};

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
 * 특정 날짜에 `code`에 대해 적용되는 연이율을 반환한다. 없으면 undefined.
 *
 * 변경 이력(현재 + previousVersions)을 모두 검사해 `validFrom <= date <= validTo (or null)`
 * 만족하는 항목을 반환한다.
 */
export function getRateAt(
  dataset: LegalRateDataset,
  code: LegalRateCode,
  date: IsoDate,
): number | undefined {
  assertIsoDate(date, "getRateAt.date");
  const record = dataset.rates.find((r) => r.code === code);
  if (!record) return undefined;
  if (date >= record.validFrom && (record.validTo === null || date <= record.validTo)) {
    return record.annualRate;
  }
  for (const prev of record.previousVersions ?? []) {
    if (date >= prev.validFrom && date <= prev.validTo) {
      return prev.annualRate;
    }
  }
  return undefined;
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
