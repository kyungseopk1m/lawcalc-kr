import { DEFAULT_LEIBNIZ_DATASET } from "./leibniz.dataset.generated";
import type { IsoDate } from "../../types";

/**
 * 라이프니츠 복리현가율 표 (월 단위, 할인율 5%/년).
 *
 * `values[n-1]` 가 n 개월 후 1원의 현가, `L[n] = 1 / (1 + 0.05/12)^n`.
 * 매뉴얼 §5-가 L253 "중간이자 공제 방식은 호프만식과 라이프니츠식 중에서 선택 가능" 정원의
 * 라이프니츠식 라이트사이드.
 */
export interface LeibnizDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  formula: string;
  license: string;
  monthsCovered: number;
  values: number[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validate(dataset: LeibnizDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("LeibnizDataset: version/updatedAt are required");
  }
  if (!ISO_DATE_PATTERN.test(dataset.updatedAt)) {
    throw new RangeError(`LeibnizDataset: invalid updatedAt "${dataset.updatedAt}"`);
  }
  if (dataset.values.length !== dataset.monthsCovered) {
    throw new RangeError(
      `LeibnizDataset: values.length (${dataset.values.length}) != monthsCovered (${dataset.monthsCovered})`,
    );
  }
  let prev = Number.POSITIVE_INFINITY;
  for (let i = 0; i < dataset.values.length; i++) {
    const v = dataset.values[i] as number;
    if (!Number.isFinite(v) || v <= 0 || v >= 1) {
      throw new RangeError(`LeibnizDataset: values[${i}] must be in (0, 1) (got ${v})`);
    }
    if (v >= prev) {
      throw new RangeError(`LeibnizDataset: values must be strictly decreasing at index ${i}`);
    }
    prev = v;
  }
}

/**
 * 기본 라이프니츠 dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 * `data/leibniz/v1.json` 이 source 이며 `sync-leibniz.mjs` 가 빌드 타임에 inline 한다.
 */
export function loadLeibnizTable(override?: LeibnizDataset): LeibnizDataset {
  const dataset = override ?? DEFAULT_LEIBNIZ_DATASET;
  validate(dataset);
  return dataset;
}

/** dataset 식별자 (`leibniz/vX.Y.Z`). 결과 객체 `dataVersions.leibniz` 에 기록된다. */
export function leibnizDatasetVersionTag(dataset: LeibnizDataset): string {
  return `leibniz/v${dataset.version}`;
}

/**
 * 1-based month index 의 복리현가율을 반환한다.
 * `month` 가 dataset 의 `monthsCovered` 를 초과하면 RangeError 를 던진다.
 */
export function getLeibnizAt(dataset: LeibnizDataset, month: number): number {
  if (!Number.isFinite(month) || !Number.isInteger(month) || month < 1) {
    throw new RangeError(`getLeibnizAt: month must be a positive integer (got ${month})`);
  }
  if (month > dataset.monthsCovered) {
    throw new RangeError(
      `getLeibnizAt: month ${month} exceeds dataset monthsCovered ${dataset.monthsCovered}`,
    );
  }
  return dataset.values[month - 1] as number;
}
