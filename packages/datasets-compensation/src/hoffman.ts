import { DEFAULT_HOFFMAN_DATASET } from "./hoffman.dataset.generated";
import type { IsoDate } from "./types";

/**
 * 호프만 단리연금현가율 표 (월 단위, 할인율 5%/년).
 *
 * `values[i-1]` 가 i 개월 단리연금현가율. 즉 `values[0]` = H[1] = 1 / (1 + 0.05/12).
 * `maxIndex` 는 매뉴얼 §5-마 L291 "414개월 초과 시 단리연금현가율이 240을 넘게 되면
 * 240 을 적용" 정원의 cumulative 상한.
 */
export interface HoffmanDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  formula: string;
  license: string;
  maxIndex: number;
  monthsCovered: number;
  values: number[];
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validate(dataset: HoffmanDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("HoffmanDataset: version/updatedAt are required");
  }
  if (!ISO_DATE_PATTERN.test(dataset.updatedAt)) {
    throw new RangeError(`HoffmanDataset: invalid updatedAt "${dataset.updatedAt}"`);
  }
  if (dataset.maxIndex <= 0) {
    throw new RangeError(`HoffmanDataset: maxIndex must be > 0`);
  }
  if (dataset.values.length !== dataset.monthsCovered) {
    throw new RangeError(
      `HoffmanDataset: values.length (${dataset.values.length}) != monthsCovered (${dataset.monthsCovered})`,
    );
  }
  let prev = 0;
  for (let i = 0; i < dataset.values.length; i++) {
    const v = dataset.values[i] as number;
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`HoffmanDataset: values[${i}] must be a positive finite number`);
    }
    if (v <= prev) {
      throw new RangeError(`HoffmanDataset: values must be strictly increasing at index ${i}`);
    }
    prev = v;
  }
}

/**
 * 기본 호프만 dataset 또는 호출자가 제공한 외부 dataset 을 검증해 반환한다.
 * `data/hoffman/v1.json` 이 source 이며 `sync-hoffman.mjs` 가 빌드 타임에 inline 한다.
 */
export function loadHoffmanTable(override?: HoffmanDataset): HoffmanDataset {
  const dataset = override ?? DEFAULT_HOFFMAN_DATASET;
  validate(dataset);
  return dataset;
}

/** dataset 식별자 (`hoffman/vX.Y.Z`). 결과 객체 `dataVersions.hoffman` 에 기록된다. */
export function hoffmanDatasetVersionTag(dataset: HoffmanDataset): string {
  return `hoffman/v${dataset.version}`;
}

/**
 * 1-based month index 의 단리연금현가율을 반환한다.
 * `month` 가 dataset 의 `monthsCovered` 를 초과하면 RangeError 를 던진다.
 */
export function getHoffmanAt(dataset: HoffmanDataset, month: number): number {
  if (!Number.isFinite(month) || !Number.isInteger(month) || month < 1) {
    throw new RangeError(`getHoffmanAt: month must be a positive integer (got ${month})`);
  }
  if (month > dataset.monthsCovered) {
    throw new RangeError(
      `getHoffmanAt: month ${month} exceeds dataset monthsCovered ${dataset.monthsCovered}`,
    );
  }
  return dataset.values[month - 1] as number;
}

export interface Hoffman240CapResult {
  /** 각 segment 의 적용 호프만 (cap 적용 후) */
  appliedHoffman: number[];
  /** cap 이 적용된 segment 의 0-based 인덱스, 미적용 시 null */
  cappedAtIndex: number | null;
}

/**
 * 호프만 단리연금현가율 240 cap 을 segment 단위로 적용한다.
 *
 * 매뉴얼 §5-마 L289-301 정원:
 * - 직전 순번까지 적용호프만 누적합 + 현재 segment raw 호프만 > 240 → 240 에서 직전 누적합을
 *   뺀 값으로 clip.
 * - clip 이 한 번 적용되면 이후 segment 의 적용호프만은 모두 0 (cumulative 가 이미 240 도달).
 *
 * @param rawHoffmanPerSegment 각 segment 의 raw 호프만 (`H[end] - H[start]` 또는 단일 H[k]).
 *   모든 값은 비음수(음수면 RangeError).
 */
export function applyHoffman240Cap(
  rawHoffmanPerSegment: readonly number[],
  cap = 240,
): Hoffman240CapResult {
  if (cap <= 0) {
    throw new RangeError(`applyHoffman240Cap: cap must be > 0 (got ${cap})`);
  }
  const applied: number[] = [];
  let cumulative = 0;
  let cappedAtIndex: number | null = null;
  for (let i = 0; i < rawHoffmanPerSegment.length; i++) {
    const raw = rawHoffmanPerSegment[i] as number;
    if (!Number.isFinite(raw) || raw < 0) {
      throw new RangeError(
        `applyHoffman240Cap: raw value at index ${i} must be a non-negative finite number (got ${raw})`,
      );
    }
    if (cappedAtIndex !== null) {
      applied.push(0);
      continue;
    }
    if (cumulative + raw > cap) {
      const clipped = Math.max(0, cap - cumulative);
      applied.push(clipped);
      cumulative = cap;
      cappedAtIndex = i;
    } else {
      applied.push(raw);
      cumulative += raw;
    }
  }
  return { appliedHoffman: applied, cappedAtIndex };
}
