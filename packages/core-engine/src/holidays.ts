import { addDays, parseIsoDateUtc } from "./days";
import { DEFAULT_HOLIDAY_DATASET } from "./holidays.dataset.generated";
import type { IsoDate } from "./types";

/**
 * 공휴일 판정 dataset. `data/holidays/v1.json` 이 single source.
 *
 * 「관공서의 공휴일에 관한 규정」(대통령령 제36290호) 제2조의 공휴일과 제3조의 대체공휴일을
 * 날짜로 펼친 스냅샷이다. 쓰이는 곳은 민법 제161조(기간의 말일이 토요일 또는 공휴일에 해당한
 * 때에는 그 익일로 기간이 만료한다)의 말일 판정이다. 이자 일할 계산의 달력일수는 이 dataset 을
 * 쓰지 않는다.
 *
 * **일요일은 목록에 없다.** 규정 제2조 제1호가 일요일을 공휴일로 정하고 있지만, 요일은 달력으로
 * 판정하는 편이 정확하고 어차피 토요일 판정이 따로 필요하다(제161조가 토요일을 공휴일과 나란히
 * 적고 있다). `isWeekend` 가 토·일을 함께 본다.
 *
 * **커버리지 밖 날짜에는 답하지 않는다.** `isBusinessDay` 와 `rollToNextBusinessDay` 는
 * RangeError 를 던진다. 스냅샷에 없는 연도를 조용히 평일로 취급하면 만료일이 하루 틀린 채로
 * 화면에 나간다. 호출자가 `isCovered` 로 먼저 판단하고 사유를 표시한다.
 */
export type HolidayKind = "statutory" | "substitute" | "temporary" | "election";

const HOLIDAY_KINDS: readonly HolidayKind[] = ["statutory", "substitute", "temporary", "election"];

export interface HolidayRecord {
  date: IsoDate;
  /** 표시용 이름. 같은 날에 두 공휴일이 겹치는 해는 "어린이날·부처님오신날" 처럼 붙인다. */
  nameKo: string;
  kind: HolidayKind;
  /** 특일정보 API 응답에 없어 따로 보충한 항목의 근거. */
  sourceRef?: string;
}

export interface HolidayDataset {
  version: string;
  updatedAt: IsoDate;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: IsoDate;
  snapshotMethod: string;
  coverage: { from: IsoDate; to: IsoDate };
  note: string;
  holidays: HolidayRecord[];
}

const DEFAULT_DATASET: HolidayDataset = DEFAULT_HOLIDAY_DATASET;

const REQUIRED_META = [
  "source",
  "sourceUrl",
  "license",
  "snapshotDate",
  "snapshotMethod",
  "note",
] as const satisfies ReadonlyArray<keyof HolidayDataset>;

function validate(dataset: HolidayDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("HolidayDataset: version/updatedAt are required");
  }
  parseIsoDateUtc(dataset.updatedAt);
  parseIsoDateUtc(dataset.snapshotDate);
  // 출처 표기가 비면 화면의 근거 표시가 빈칸으로 나간다. 데이터셋 투명성 정원을 여기서 지킨다.
  for (const key of REQUIRED_META) {
    if (typeof dataset[key] !== "string" || dataset[key].trim() === "") {
      throw new Error(`HolidayDataset: ${key} 가 비어 있습니다`);
    }
  }
  const { from, to } = dataset.coverage ?? {};
  if (!from || !to) {
    throw new Error("HolidayDataset: coverage.from/coverage.to are required");
  }
  if (parseIsoDateUtc(to) < parseIsoDateUtc(from)) {
    throw new RangeError(`HolidayDataset: coverage.to (${to}) is before coverage.from (${from})`);
  }
  if (!Array.isArray(dataset.holidays) || dataset.holidays.length === 0) {
    throw new Error("HolidayDataset: holidays must be a non-empty array");
  }
  let previous = "";
  for (const [i, h] of dataset.holidays.entries()) {
    parseIsoDateUtc(h.date);
    if (h.date <= previous) {
      throw new RangeError(
        `holidays[${i}] ("${h.date}"): 날짜가 오름차순이 아니거나 중복입니다 (직전 "${previous}")`,
      );
    }
    previous = h.date;
    if (h.date < from || h.date > to) {
      throw new RangeError(`holidays[${i}] ("${h.date}"): coverage(${from}~${to}) 밖입니다`);
    }
    if (!h.nameKo) {
      throw new Error(`holidays[${i}] ("${h.date}"): nameKo is required`);
    }
    if (!HOLIDAY_KINDS.includes(h.kind)) {
      throw new RangeError(`holidays[${i}] ("${h.date}"): 알 수 없는 kind "${h.kind}"`);
    }
  }
}

export function loadHolidays(dataset?: HolidayDataset): HolidayDataset {
  const loaded = dataset ?? DEFAULT_DATASET;
  validate(loaded);
  return loaded;
}

/**
 * 사용자가 따로 지정한 공휴일을 dataset 에 합친다. 번들 스냅샷 뒤에 지정된 임시공휴일·선거일처럼
 * 아직 dataset 에 없는 날을 말일 연장 판정에 넣는 자리다. 원본 dataset 은 바꾸지 않는다.
 *
 * 이미 dataset 에 있는 날짜는 dataset 레코드를 그대로 둔다 (판정 결과가 같다). 커버리지 밖 날짜는
 * 판정할 수 없는 구간을 넓히지 않도록 RangeError 다.
 */
export function withExtraHolidays(
  ds: HolidayDataset,
  extra: readonly HolidayRecord[],
): HolidayDataset {
  if (extra.length === 0) return ds;
  const byDate = new Map(ds.holidays.map((h) => [h.date, h]));
  for (const h of extra) {
    parseIsoDateUtc(h.date);
    if (!isCovered(h.date, ds)) {
      throw new RangeError(
        `추가 공휴일 "${h.date}" 는 공휴일 데이터 커버리지(${ds.coverage.from}~${ds.coverage.to}) 밖이라 반영할 수 없습니다`,
      );
    }
    if (typeof h.nameKo !== "string" || h.nameKo.trim() === "") {
      throw new RangeError(`추가 공휴일 "${h.date}" 의 이름이 비어 있습니다`);
    }
    if (!byDate.has(h.date)) byDate.set(h.date, h);
  }
  const holidays = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return loadHolidays({ ...ds, holidays });
}

/** dataset 식별자 (`holidays/vX.Y.Z`). */
export function holidaysVersionTag(dataset: HolidayDataset): string {
  return `holidays/v${dataset.version}`;
}

/** 이 dataset 이 답할 수 있는 날짜인지. 커버리지 밖이면 판정 자체를 하지 않는다. */
export function isCovered(date: IsoDate, ds: HolidayDataset): boolean {
  parseIsoDateUtc(date);
  return date >= ds.coverage.from && date <= ds.coverage.to;
}

/** 해당 날짜의 공휴일 레코드. 일요일은 목록에 없으므로 여기서 null 이 나와도 평일은 아니다. */
export function findHoliday(date: IsoDate, ds: HolidayDataset): HolidayRecord | null {
  parseIsoDateUtc(date);
  return ds.holidays.find((h) => h.date === date) ?? null;
}

/** 토요일 또는 일요일. 달력 판정이라 커버리지와 무관하다. */
export function isWeekend(date: IsoDate): boolean {
  const day = new Date(parseIsoDateUtc(date)).getUTCDay();
  return day === 0 || day === 6;
}

function requireCovered(date: IsoDate, ds: HolidayDataset, fnName: string): void {
  if (!isCovered(date, ds)) {
    throw new RangeError(
      `${fnName}: "${date}" 는 공휴일 dataset 커버리지(${ds.coverage.from}~${ds.coverage.to}) 밖입니다`,
    );
  }
}

/**
 * 토요일을 말일 연장 대상으로 보는 시작일. 민법 제161조 개정(법률 제8720호) 부칙 제1조 단서의
 * 시행일이다. 형사소송법 제66조 제3항은 2007-12-21 시행(법률 제8730호)이지만, 시행일별 토요일
 * 규칙을 따로 두지 않고 더 늦은 이 날짜로 함께 묶는다(보수적 처리).
 *
 * 이 날짜 이전에는 토요일이 공휴일이 아니라서 토요일 말일에 연장 판정을 하면 만료일이 틀린다.
 * 그 구간의 토요일은 판정하지 않는다. 공휴일 판정(`isCovered`)은 이 날짜와 무관하다.
 */
export const SATURDAY_RULE_FROM: IsoDate = "2008-03-22";

/** 근무일 판정 옵션. */
export interface BusinessDayOptions {
  /**
   * 2008-03-22 당시 법원에 계속 중인 사건. 민법 법률 제8720호 부칙 제3조 제1항이 그 사건에
   * 개정법(토요일 포함 제161조)을 적용하지 않으므로 토요일을 휴일로 보지 않는다.
   * 일요일·공휴일은 그대로 휴일이다. 기본값 false.
   */
  pendingOn20080322?: boolean;
}

/**
 * 토·일도 공휴일도 아닌 날. 커버리지 밖이면 RangeError.
 * `SATURDAY_RULE_FROM` 이전의 토요일도 판정하지 못해 RangeError 다.
 * `pendingOn20080322` 이면 토요일을 근무일로 보며, 그때는 날짜와 무관하게 판정한다.
 */
export function isBusinessDay(
  date: IsoDate,
  ds: HolidayDataset,
  options?: BusinessDayOptions,
): boolean {
  requireCovered(date, ds, "isBusinessDay");
  const day = new Date(parseIsoDateUtc(date)).getUTCDay();
  if (options?.pendingOn20080322 === true) {
    return day !== 0 && findHoliday(date, ds) === null;
  }
  if (date < SATURDAY_RULE_FROM && day === 6) {
    throw new RangeError(
      `isBusinessDay: "${date}" 는 토요일 말일 연장 판정 시작일(${SATURDAY_RULE_FROM}) 이전의 토요일입니다`,
    );
  }
  return !isWeekend(date) && findHoliday(date, ds) === null;
}

export interface RollResult {
  date: IsoDate;
  rolled: boolean;
  /** 왜 밀렸는지. 화면에 그대로 낸다. 밀지 않았으면 없다. */
  reasonKo?: string;
  /** 건너뛴 공휴일들. 토·일은 공휴일 레코드가 아니라 여기 담기지 않는다. */
  skipped: HolidayRecord[];
}

function reasonFor(date: IsoDate, ds: HolidayDataset): string {
  const holiday = findHoliday(date, ds);
  if (holiday) {
    // 이름 자체가 `대체공휴일(삼일절)` 처럼 괄호를 품는 레코드가 있어 감싸지 않는다.
    return `말일이 공휴일이라 다음 근무일로 만료 (${holiday.nameKo})`;
  }
  const day = new Date(parseIsoDateUtc(date)).getUTCDay();
  return `말일이 ${day === 6 ? "토요일" : "일요일"}이라 다음 근무일로 만료`;
}

/**
 * 민법 제161조의 익일 만료. 말일이 토·일·공휴일이면 그 다음 첫 근무일로 민다.
 *
 * 커버리지 밖 날짜이거나 미는 도중 커버리지를 벗어나면 RangeError 를 던진다.
 */
export function rollToNextBusinessDay(
  date: IsoDate,
  ds: HolidayDataset,
  options?: BusinessDayOptions,
): RollResult {
  requireCovered(date, ds, "rollToNextBusinessDay");
  if (isBusinessDay(date, ds, options)) {
    return { date, rolled: false, skipped: [] };
  }
  const reasonKo = reasonFor(date, ds);
  const skipped: HolidayRecord[] = [];
  let cursor = date;
  for (;;) {
    const holiday = findHoliday(cursor, ds);
    if (holiday) skipped.push(holiday);
    cursor = addDays(cursor, 1);
    requireCovered(cursor, ds, "rollToNextBusinessDay");
    if (isBusinessDay(cursor, ds, options)) {
      return { date: cursor, rolled: true, reasonKo, skipped };
    }
  }
}
