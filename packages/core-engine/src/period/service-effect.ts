import { addDays, parseIsoDateUtc } from "../days";
import type { IsoDate } from "../types";

import { computePeriod } from "./compute-period";
import type { HolidayExtensionStatus, PeriodDeps, PeriodInput } from "./types";

const PREFIX = "송달 효력·상소기간 입력 검증 실패";

/**
 * - `publicServiceEffect`: 공시송달 효력발생일 (민사소송법 제196조)
 * - `appealExpiry`: 송달일부터 `days`일 상소기간의 만료일 (제396조 제1항 2주, 제444조 제1항 1주)
 * - `finalDate`: 상소 없이 그 기간이 끝난 다음 날, 재판 확정일 (제498조)
 */
export type ServiceEffectKind = "publicServiceEffect" | "appealExpiry" | "finalDate";

/**
 * 첫 공시송달의 "2주가 지나야" 를 어느 날로 표기할지.
 *
 * - `day14` (기본): 실시일 익일부터 2주 기간을 민법으로 계산(제157조 초일 불산입, 제161조 말일
 *   연장)하고, 그 기간이 지난 다음 날을 효력발생일로 본다. 2주 상소기간의 확정일과 같은 날이다.
 * - `day15`: 실시일 + 15일을 효력발생일로 보고, 그 날이 토요일·공휴일이면 다음 근무일로 민다.
 *   제196조 문언이 정한 연장이 아니라 실무 표기 방식 하나라 결과에 그 사실을 적는다.
 */
export type PublicServiceBasis = "day14" | "day15";

/**
 * - `first`: 첫 공시송달 (제196조 제1항 본문, 2주)
 * - `subsequent`: 같은 당사자에게 하는 그 뒤의 공시송달 (같은 항 단서, 실시한 다음 날)
 * - `foreign`: 외국에서 할 송달에 대한 공시송달 (같은 조 제2항, 2월)
 */
export type PublicServiceVariant = "first" | "subsequent" | "foreign";

export interface ServiceEffectOptions {
  kind: ServiceEffectKind;
  /** `publicServiceEffect` + `first` 에서만 본다. 기본값 `day14`. */
  basis?: PublicServiceBasis;
  /** `publicServiceEffect` 에서만 본다. 기본값 `first`. */
  variant?: PublicServiceVariant;
  /** `appealExpiry` / `finalDate` 의 상소기간 일수. 기본값 14 (항소·상고 2주). 즉시항고는 7. */
  days?: 14 | 7;
  /** 2008-03-22 당시 법원에 계속 중인 사건. 토요일을 말일 연장 대상으로 보지 않는다. */
  pendingOn20080322?: boolean;
}

export interface ServiceEffectInput extends ServiceEffectOptions {
  /** 송달일 (공시송달이면 실시일). */
  serviceDate: IsoDate;
}

export interface ServiceEffectResult {
  serviceDate: IsoDate;
  /** 효력발생일 / 상소기간 만료일 / 확정일. */
  date: IsoDate;
  /** 기간 계산을 거친 경우 제161조까지 적용한 기간 만료일. `subsequent` · `day15` 에는 없다. */
  periodEnd?: IsoDate;
  /** 토요일·공휴일 때문에 날짜가 뒤로 밀렸는지. */
  pushed: boolean;
  /** 말일 연장 판정 상태. 공휴일 데이터 커버리지 밖이면 `outOfCoverage` 로 남기고 밀지 않는다. */
  holidayExtension: HolidayExtensionStatus;
  articles: string[];
  formulaText: string;
  /** 연장 사유 또는 판정 불가 사유. */
  reasonKo?: string;
  /** `day15` 처럼 문언 밖의 표기 방식을 쓴 경우의 고지. */
  noteKo?: string;
}

const DAY15_NOTE_KO =
  "실시일 + 15일을 효력발생일로 보고 토요일·공휴일이면 다음 근무일로 미는 표기 방식입니다. " +
  "민사소송법 제196조 제1항 본문의 문언은 실시일부터 2주가 지나야 효력이 생긴다는 것이며, 기본 방식(day14)은 그 2주를 민법으로 계산해 기간이 지난 다음 날로 봅니다.";

/**
 * 공시송달 효력발생일 · 상소기간 만료일 · 재판 확정일.
 *
 * 기간 계산은 민사소송법 제170조에 따라 민법(제157조·제160조·제161조)으로 하며, 날짜 계산은
 * `computePeriod` 를 그대로 쓴다. 공휴일 판정은 `deps` (`createHolidayDeps()`) 로만 한다.
 *
 * @throws 입력이 잘못되면 한국어 RangeError.
 */
export function computeServiceEffect(
  input: ServiceEffectInput,
  deps: PeriodDeps,
): ServiceEffectResult {
  validate(input);
  const s = input.serviceDate;
  const pending = input.pendingOn20080322 === true;

  if (input.kind === "publicServiceEffect") {
    const variant = input.variant ?? "first";
    if (variant === "subsequent") {
      const date = addDays(s, 1);
      return {
        serviceDate: s,
        date,
        pushed: false,
        holidayExtension: "off",
        articles: ["민사소송법 제196조 제1항 단서"],
        formulaText: `공시송달 실시일 ${s} → 같은 당사자에게 하는 그 뒤의 공시송달은 실시한 다음 날 ${date} 부터 효력 (민사소송법 제196조 제1항 단서)`,
      };
    }
    if (variant === "first" && (input.basis ?? "day14") === "day15") {
      return day15Effect(s, pending, deps);
    }
    const foreign = variant === "foreign";
    const article = foreign ? "민사소송법 제196조 제2항" : "민사소송법 제196조 제1항 본문";
    const period = runPeriod(
      { from: s, unit: foreign ? "month" : "week", count: 2 },
      pending,
      deps,
    );
    const date = addDays(period.expiryDate, 1);
    return {
      serviceDate: s,
      date,
      periodEnd: period.expiryDate,
      pushed: period.holidayExtension === "applied",
      holidayExtension: period.holidayExtension,
      articles: [article, "민사소송법 제170조", ...civil(period.articles)],
      formulaText:
        `공시송달 실시일 ${s} → ${foreign ? "2월" : "2주"} 기간 (${article}, 제170조에 따라 민법으로 계산): ` +
        `${period.formulaText} → 기간이 지난 다음 날 ${date} 효력 발생`,
      ...(period.adjustmentReasonKo !== undefined ? { reasonKo: period.adjustmentReasonKo } : {}),
    };
  }

  const days = input.days ?? 14;
  const article = days === 14 ? "민사소송법 제396조 제1항" : "민사소송법 제444조 제1항";
  const period = runPeriod({ from: s, unit: "day", count: days }, pending, deps);
  const base = {
    serviceDate: s,
    periodEnd: period.expiryDate,
    pushed: period.holidayExtension === "applied",
    holidayExtension: period.holidayExtension,
    ...(period.adjustmentReasonKo !== undefined ? { reasonKo: period.adjustmentReasonKo } : {}),
  };
  const head = `송달일 ${s} → ${days === 14 ? "2주" : "1주"} 상소기간 (${article}, 제170조에 따라 민법으로 계산): ${period.formulaText}`;
  if (input.kind === "appealExpiry") {
    return {
      ...base,
      date: period.expiryDate,
      articles: [article, "민사소송법 제170조", ...civil(period.articles)],
      formulaText: `${head} → 만료일 ${period.expiryDate}`,
    };
  }
  const date = addDays(period.expiryDate, 1);
  return {
    ...base,
    date,
    articles: [article, "민사소송법 제170조", ...civil(period.articles), "민사소송법 제498조"],
    formulaText: `${head} → 상소 없이 기간이 끝나 다음 날 ${date} 확정 (민사소송법 제498조)`,
  };
}

/**
 * 달력 표시용. `year`-`month` 를 가운데 둔 3개월(전월·당월·익월)의 날마다 송달일로 넣어 계산한다.
 *
 * 공휴일 데이터 커버리지 밖 날짜는 밀지 않고 `holidayExtension: "outOfCoverage"` 로 남는다.
 */
export function buildServiceEffectCalendar(
  year: number,
  month: number,
  options: ServiceEffectOptions,
  deps: PeriodDeps,
): ServiceEffectResult[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`${PREFIX}: year/month 가 올바르지 않습니다 (${year}-${month}).`);
  }
  // Date.UTC 는 0~99 년을 1900~1999 년으로 바꾸므로 네 자리 연도만 받는다.
  if (year < 1000 || year > 9999) {
    throw new RangeError(`${PREFIX}: 연도는 1000~9999 사이의 네 자리여야 합니다 (${year}).`);
  }
  const first = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const results: ServiceEffectResult[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    results.push(computeServiceEffect({ ...options, serviceDate: d }, deps));
  }
  return results;
}

/** 기간 엔진의 조문 라벨은 민법 조문 번호만 담고 있어 법 이름을 붙인다. */
function civil(articles: string[]): string[] {
  return articles.map((a) => `민법 ${a}`);
}

function runPeriod(
  base: Pick<PeriodInput, "from" | "unit" | "count">,
  pending: boolean,
  deps: PeriodDeps,
) {
  return computePeriod(
    { ...base, holidayExtension: true, ...(pending ? { pendingOn20080322: true } : {}) },
    deps,
  );
}

function day15Effect(s: IsoDate, pending: boolean, deps: PeriodDeps): ServiceEffectResult {
  const raw = addDays(s, 15);
  const common = {
    serviceDate: s,
    articles: ["민사소송법 제196조 제1항 본문"],
    noteKo: DAY15_NOTE_KO,
  };
  const outOfCoverage = (): ServiceEffectResult => ({
    ...common,
    date: raw,
    pushed: false,
    holidayExtension: "outOfCoverage",
    formulaText: `공시송달 실시일 ${s} + 15일 = ${raw} (토요일·공휴일 판정 불가)`,
    reasonKo: `${raw} 가 공휴일 데이터 커버리지 밖이라 토요일·공휴일 여부를 확인하지 못했습니다. 날짜를 직접 확인하십시오.`,
  });
  if (!deps.isCovered(raw)) return outOfCoverage();
  let rolled: { date: IsoDate; rolled: boolean; reasonKo?: string };
  try {
    rolled = deps.rollToNextBusinessDay(raw, pending ? { pendingOn20080322: true } : undefined);
  } catch (error) {
    if (error instanceof RangeError) return outOfCoverage();
    throw error;
  }
  return {
    ...common,
    date: rolled.date,
    pushed: rolled.rolled,
    holidayExtension: rolled.rolled ? "applied" : "notApplied",
    formulaText:
      `공시송달 실시일 ${s} + 15일 = ${raw}` +
      (rolled.rolled ? ` → 토요일·공휴일이라 다음 근무일 ${rolled.date}` : "") +
      ` 효력 발생`,
    ...(rolled.rolled && rolled.reasonKo !== undefined ? { reasonKo: rolled.reasonKo } : {}),
  };
}

function validate(input: ServiceEffectInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  try {
    parseIsoDateUtc(input.serviceDate);
  } catch {
    throw new RangeError(
      `${PREFIX}: serviceDate 가 올바른 날짜가 아닙니다 (${input.serviceDate}).`,
    );
  }
  if (!["publicServiceEffect", "appealExpiry", "finalDate"].includes(input.kind)) {
    throw new RangeError(
      `${PREFIX}: kind 는 publicServiceEffect / appealExpiry / finalDate 중 하나여야 합니다.`,
    );
  }
  if (input.days !== undefined && input.days !== 14 && input.days !== 7) {
    throw new RangeError(`${PREFIX}: days 는 14 또는 7 이어야 합니다.`);
  }
  if (input.basis !== undefined && input.basis !== "day14" && input.basis !== "day15") {
    throw new RangeError(`${PREFIX}: basis 는 day14 또는 day15 여야 합니다.`);
  }
  if (input.variant !== undefined && !["first", "subsequent", "foreign"].includes(input.variant)) {
    throw new RangeError(`${PREFIX}: variant 는 first / subsequent / foreign 중 하나여야 합니다.`);
  }
}
