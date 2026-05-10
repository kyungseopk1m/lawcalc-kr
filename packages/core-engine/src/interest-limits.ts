import { DEFAULT_INTEREST_LIMITS_DATASET } from "./interest-limits.dataset.generated";
import type { IsoDate } from "./types";

/**
 * 적용 법규 코드. v0.3 appropriation 도메인의 `InterestLimitLaw` superset 의
 * dataset side 부분이다 (input 도메인의 "none" sentinel 은 본 union 에 포함하지 않음).
 *
 * - "interestLimitAct"          → 이자제한법
 * - "loanBusinessRegistered"    → 대부업법 (등록 대부업자)
 * - "loanBusinessUnregistered"  → 대부업법 (미등록)
 */
export type InterestLimitLaw =
  | "interestLimitAct"
  | "loanBusinessRegistered"
  | "loanBusinessUnregistered";

/**
 * `data/interest-limits/v{N}.json` 의 한 slice.
 *
 * 같은 law 의 history 는 from 오름차순 정렬 강제. 인접 slice 의 to 는
 * 다음 slice 의 from - 1 일과 일치 (gap/overlap 0). 마지막 slice 의 to 는 null.
 */
export interface InterestLimitSlice {
  law: InterestLimitLaw;
  from: IsoDate;
  to: IsoDate | null;
  /** 0 < capRate <= 1. 예: 0.20 = 연 20%. */
  capRate: number;
  /** 법령명 + 시행일 + 대통령령/법률 번호. 감사 가능성 보장. */
  source: string;
}

export interface InterestLimitDataset {
  /** Semver. AppropriationResult.dataVersions.interestLimits 에 그대로 반영. */
  version: string;
  /** 데이터셋 갱신일 (YYYY-MM-DD). */
  updatedAt: IsoDate;
  slices: InterestLimitSlice[];
}

const DEFAULT_DATASET: InterestLimitDataset = DEFAULT_INTEREST_LIMITS_DATASET;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, context: string): void {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${context}: invalid ISO date "${value}"`);
  }
}

function addOneDay(iso: IsoDate): IsoDate {
  const ms = Date.UTC(
    Number(iso.slice(0, 4)),
    Number(iso.slice(5, 7)) - 1,
    Number(iso.slice(8, 10)),
  );
  const next = new Date(ms + 86_400_000);
  const yyyy = String(next.getUTCFullYear()).padStart(4, "0");
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 데이터셋 정합성 검증. validate 항목:
 * - version / updatedAt 존재 + ISO 형식.
 * - slices.length >= 1.
 * - 각 slice 의 from/to ISO + capRate 0 < r <= 1.
 * - 같은 law 의 slice 들은 from 오름차순 + 인접 to+1 == 다음 from (gap/overlap 0).
 * - 같은 law 의 마지막 slice 만 to == null 허용.
 */
function validate(dataset: InterestLimitDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("InterestLimitDataset: version/updatedAt are required");
  }
  assertIsoDate(dataset.updatedAt, "updatedAt");
  if (!Array.isArray(dataset.slices) || dataset.slices.length === 0) {
    throw new Error("InterestLimitDataset: slices must be a non-empty array");
  }

  const byLaw = new Map<InterestLimitLaw, InterestLimitSlice[]>();
  for (const s of dataset.slices) {
    assertIsoDate(s.from, `${s.law}.from`);
    if (s.to !== null) assertIsoDate(s.to, `${s.law}.to`);
    if (!(s.capRate > 0 && s.capRate <= 1)) {
      throw new RangeError(`${s.law}: capRate must be in (0, 1] (got ${s.capRate})`);
    }
    if (s.to !== null && s.to < s.from) {
      throw new RangeError(`${s.law}: to (${s.to}) < from (${s.from})`);
    }
    if (!s.source || s.source.trim().length === 0) {
      throw new Error(`${s.law}@${s.from}: source is required`);
    }
    const list = byLaw.get(s.law) ?? [];
    list.push(s);
    byLaw.set(s.law, list);
  }

  for (const [law, list] of byLaw) {
    list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
    for (const [i, cur] of list.entries()) {
      const next = list[i + 1];
      if (!next) continue;
      if (cur.to === null) {
        throw new RangeError(
          `${law}: only the last slice may have to=null (slice@${cur.from} has null but is not last)`,
        );
      }
      const expected = addOneDay(cur.to);
      if (next.from !== expected) {
        throw new RangeError(
          `${law}: gap/overlap between ${cur.from}~${cur.to} and ${next.from} (expected next.from=${expected})`,
        );
      }
    }
  }
}

/**
 * 기본 데이터셋 또는 호출자가 제공한 외부 데이터셋을 검증해 반환한다.
 *
 * @internal core-engine 내부 전용 — appropriation 도메인이 dataset 주입 receiver.
 *           외부 consumer 는 향후 `calculateAppropriation(input, { interestLimits })` 형태로 주입.
 */
export function loadInterestLimits(override?: InterestLimitDataset): InterestLimitDataset {
  const dataset = override ?? DEFAULT_DATASET;
  validate(dataset);
  return dataset;
}

/**
 * 데이터셋 식별자 (`interest-limits/vX.Y.Z`).
 * `AppropriationResult.dataVersions.interestLimits` 에 그대로 기록된다.
 */
export function interestLimitsVersionTag(dataset: InterestLimitDataset): string {
  return `interest-limits/v${dataset.version}`;
}

/**
 * 특정 law + 날짜에 적용되는 cap 이율을 반환한다. 없으면 undefined.
 *
 * 검사 규칙: `from <= date <= to (or null)`. 같은 law 의 slice 가
 * 시간순으로 정렬됐다고 가정 (loadInterestLimits 가 보장).
 */
export function getCapAt(
  dataset: InterestLimitDataset,
  law: InterestLimitLaw,
  date: IsoDate,
): number | undefined {
  assertIsoDate(date, "getCapAt.date");
  for (const s of dataset.slices) {
    if (s.law !== law) continue;
    if (date >= s.from && (s.to === null || date <= s.to)) {
      return s.capRate;
    }
  }
  return undefined;
}

/**
 * 특정 law 의 변경 이력 평면 리스트 (from 오름차순). segments 자동 분할용.
 * dataset 의 source 등 메타는 제거하고 numeric 만 반환한다.
 */
export function capHistoryFor(
  dataset: InterestLimitDataset,
  law: InterestLimitLaw,
): Array<{ from: IsoDate; to: IsoDate | null; capRate: number }> {
  return dataset.slices
    .filter((s) => s.law === law)
    .slice()
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
    .map(({ from, to, capRate }) => ({ from, to, capRate }));
}
