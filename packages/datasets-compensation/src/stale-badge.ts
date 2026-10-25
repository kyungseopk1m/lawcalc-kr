import type { IsoDate } from "./types";
import { isRealIsoDate } from "./iso-date";

/**
 * 데이터셋 기준일 경과 상태 안내. 화면 문구는 호출부가 데이터셋에 맞게 붙인다.
 *
 * `level`:
 * - `neutral` 다음 판 예상 시점 + 6개월 전
 * - `amber` 다음 판 예상 시점 + 6개월 이후 (판 갱신이 밀렸을 수 있음)
 */
export type StaleBadgeLevel = "neutral" | "amber";

export interface StaleBadgeResult {
  level: StaleBadgeLevel;
  monthsElapsed: number;
  nextEditionDate: IsoDate;
}

/** 공표 월 목록(각 월 1일). 연 1회면 `[12]`, 반기면 `[1, 9]`. */
export type PublicationCadence = readonly number[];

/** 시중노임: 상반기 1월 1일, 하반기 9월 1일 적용분. */
export const LABOR_RATES_CADENCE: PublicationCadence = [1, 9];
/** 생명표: 매년 12월 공표. */
export const LIFE_EXPECTANCY_CADENCE: PublicationCadence = [12];

const GRACE_MONTHS = 6;

function parseIsoDate(label: string, value: IsoDate): Date {
  if (!isRealIsoDate(value)) {
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

function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** `edition` 다음에 오는 첫 공표 예정일. */
function nextEdition(edition: Date, cadence: PublicationCadence): Date {
  const months = [...cadence].sort((a, b) => a - b);
  if (months.length === 0 || months.some((m) => !Number.isInteger(m) || m < 1 || m > 12)) {
    throw new RangeError(`computeStaleBadge: invalid cadence [${cadence.join(", ")}]`);
  }
  const year = edition.getUTCFullYear();
  for (const y of [year, year + 1]) {
    for (const m of months) {
      const candidate = new Date(Date.UTC(y, m - 1, 1));
      if (candidate > edition) return candidate;
    }
  }
  throw new RangeError("computeStaleBadge: unreachable");
}

/**
 * 현재 판 기준일 `currentEditionDate` 와 공표 주기로 다음 판 예상 시점을 구하고,
 * 그 시점에서 6개월이 지났으면 `amber`, 아니면 `neutral` 이다.
 * `monthsElapsed` 는 현재 판 기준일부터 `currentDate` 까지의 경과 개월 수(표시용).
 */
export function computeStaleBadge(
  currentEditionDate: IsoDate,
  currentDate: IsoDate,
  cadence: PublicationCadence,
): StaleBadgeResult {
  const edition = parseIsoDate("currentEditionDate", currentEditionDate);
  const current = parseIsoDate("currentDate", currentDate);
  const next = nextEdition(edition, cadence);
  const amberFrom = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + GRACE_MONTHS, next.getUTCDate()),
  );
  return {
    level: current >= amberFrom ? "amber" : "neutral",
    monthsElapsed: Math.max(0, monthsBetween(edition, current)),
    nextEditionDate: toIso(next),
  };
}
