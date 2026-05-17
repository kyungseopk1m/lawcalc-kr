import type { IsoDate } from "../../types";

/**
 * dataset snapshot stale 상태 badge.
 *
 * `level`:
 * - `neutral` ≤ 6 개월
 * - `amber` 6 ~ 12 개월
 * - `red` > 12 개월 — UI 측 트랙 U 5-1 은 사용자 raw 일당 override input 강조.
 *
 * `overrideStrongly` 는 amber/red 시점 트랙 U 5-1 의 raw input 강조 flag.
 */
export type StaleBadgeLevel = "neutral" | "amber" | "red";

export interface StaleBadgeResult {
  level: StaleBadgeLevel;
  monthsElapsed: number;
  message: string | null;
  overrideStrongly: boolean;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const NEUTRAL_MAX_MONTHS = 6;
const AMBER_MAX_MONTHS = 12;

function parseIsoDate(label: string, value: IsoDate): Date {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`computeStaleBadge: invalid ${label} "${value}"`);
  }
  const parts = value.split("-").map((part) => Number.parseInt(part, 10));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new RangeError(`computeStaleBadge: invalid ${label} "${value}"`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function monthsBetween(from: Date, to: Date): number {
  const years = to.getUTCFullYear() - from.getUTCFullYear();
  const months = to.getUTCMonth() - from.getUTCMonth();
  let total = years * 12 + months;
  if (to.getUTCDate() < from.getUTCDate()) {
    total -= 1;
  }
  return total;
}

/**
 * `snapshotDate` 기준일 vs `currentDate` 의 경과 개월 수로 stale badge 를 산출한다.
 *
 * 임계 (plan v2 §6 트랙 3 정원):
 * - ≤ 6 개월: neutral (자동입력 신뢰)
 * - 6 ~ 12 개월: amber (`CAK 사이트 최신 노임 직접 입력 권유`)
 * - > 12 개월: red (`dataset 갱신 필요 — 사용자 직접입력 권장`)
 */
export function computeStaleBadge(snapshotDate: IsoDate, currentDate: IsoDate): StaleBadgeResult {
  const snapshot = parseIsoDate("snapshotDate", snapshotDate);
  const current = parseIsoDate("currentDate", currentDate);
  const monthsElapsed = Math.max(0, monthsBetween(snapshot, current));

  if (monthsElapsed <= NEUTRAL_MAX_MONTHS) {
    return {
      level: "neutral",
      monthsElapsed,
      message: null,
      overrideStrongly: false,
    };
  }
  if (monthsElapsed <= AMBER_MAX_MONTHS) {
    return {
      level: "amber",
      monthsElapsed,
      message: "CAK 사이트 최신 노임 직접 입력 권유",
      overrideStrongly: true,
    };
  }
  return {
    level: "red",
    monthsElapsed,
    message: "dataset 갱신 필요 — 사용자 직접입력 권장",
    overrideStrongly: true,
  };
}
