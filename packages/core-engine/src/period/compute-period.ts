import { addDays, countDays, parseIsoDateUtc } from "../days";
import type { IsoDate } from "../types";

import type {
  DateSpanInput,
  DateSpanResult,
  HolidayExtensionStatus,
  PeriodArticleLabels,
  PeriodDeps,
  PeriodInput,
  PeriodResult,
  PeriodUnit,
} from "./types";

const PREFIX = "기간 계산 입력 검증 실패";
const MAX_COUNT = 1200;

/**
 * 민법 제155조 고지. 기간 계산의 민법 규정은 법령·재판상 처분·법률행위에 다른 정함이
 * 없을 때에만 적용되는 보충 규정이다. 결과가 사건의 특칙보다 앞서지 않는다는 사실을
 * 결과 객체에 남긴다.
 */
const SUPPLEMENTARY_NOTE_KO =
  "민법 제155조에 따라 법령이나 재판상 처분 또는 법률행위에 다른 정함이 없는 경우에 적용되는 보충 규정으로 계산한 결과입니다.";

const UNIT_LABEL: Record<PeriodUnit, string> = {
  day: "일",
  week: "주",
  month: "개월",
  year: "년",
};

/**
 * 기본 조문 라벨. 민법 제155조~제161조.
 *
 * 기간 계산 탭은 민법 일반규정을 그대로 쓰므로 라벨을 넘기지 않고 이 세트로 계산한다.
 * 다른 법이 기간 계산을 직접 정하는 계열(형사소송법 제66조 등)은 호출자가 자기 세트를
 * 넘긴다. 기간 엔진은 어느 계열인지 알지 않는다.
 */
const CIVIL_CODE_ARTICLES: PeriodArticleLabels = {
  firstDay: "제157조",
  endOfPeriod: "제159조",
  calendar: "제160조 제2항",
  monthEndClip: "제160조 제3항",
  holidayRollover: "제161조",
  noteKo: SUPPLEMENTARY_NOTE_KO,
};

/**
 * 기간 계산 engine. 기본값은 민법 제155조~제161조 wire-up이고, `articles` 로 다른 계열의
 * 조문 라벨을 넘기면 결과의 `articles` · `formulaText` · `noteKo` 가 그 조문을 가리킨다.
 * 아래 조문 번호는 기본 세트 기준의 서술이다.
 *
 * 산식:
 *
 *   1. 기산일 결정 (제157조). 원칙은 초일 불산입이라 `from` 의 익일이 기산일이다.
 *      `includeFirstDay` 를 켜면 (기간이 오전 0시로부터 시작하는 때, 제157조 단서)
 *      `from` 자신이 기산일이다.
 *   2. 만료일 결정.
 *        - 일·주: 일은 기산일 + (수량 - 1). 주는 아래 역법 계산에 7배수 일로 환산하지
 *          않고 제160조 제2항을 그대로 적용한다 (기산일 + 7 x 수량 - 1일과 같은 값).
 *        - 월·년 (제160조 제2항): 최종 월·년에서 기산일에 해당한 날의 **전일**로 만료한다.
 *        - 최종 월에 해당일이 없으면 (제160조 제3항) 그 월의 **말일**로 만료한다.
 *          이때는 전일로 당기지 않는다. 1월 31일 기산 + 1개월 = 2월 28일 (윤년 29일).
 *   3. 제159조에 따라 만료일의 종료로 기간이 끝난다. 결과의 만료일은 그 날 자체다.
 *   4. `holidayExtension` 이 켜져 있으면 제161조. 말일이 토요일 또는 공휴일이면 익일로
 *      만료한다. 공휴일 판정은 주입된 `deps` 로만 하고, 커버리지 밖이면 조용히 넘기지 않고
 *      `outOfCoverage` 로 남긴다.
 *
 * @throws 입력이 잘못되었거나 `holidayExtension` 을 켜고 `deps` 를 주지 않으면 RangeError.
 */
export function computePeriod(
  input: PeriodInput,
  deps?: PeriodDeps,
  labels: PeriodArticleLabels = CIVIL_CODE_ARTICLES,
): PeriodResult {
  validatePeriodInput(input);
  if (input.holidayExtension === true && deps === undefined) {
    throw new RangeError(
      `${PREFIX}: holidayExtension 을 켜려면 공휴일 판정 deps 를 함께 주입해야 합니다.`,
    );
  }

  const includeFirstDay = input.includeFirstDay ?? false;
  const startDate = includeFirstDay ? input.from : addDays(input.from, 1);
  const articles: string[] = [];
  /** 빈 라벨(대응 조문 없음)은 담지 않는다. */
  const useArticle = (label: string): void => {
    if (label !== "") articles.push(label);
  };
  /** 빈 라벨 자리에서는 조문 표기 없이 사유만 적는다. */
  const cite = (label: string, reason: string): string =>
    label === "" ? reason : `${label}, ${reason}`;

  useArticle(labels.firstDay);
  const steps = [
    `기산일 ${startDate} (${labels.firstDay} ${
      includeFirstDay ? "단서, 오전 0시 기산이라 초일 산입" : "본문, 초일 불산입"
    })`,
    `${input.count}${UNIT_LABEL[input.unit]} 경과`,
  ];

  let rawExpiry: IsoDate;
  if (input.unit === "day") {
    rawExpiry = addDays(startDate, input.count - 1);
    useArticle(labels.endOfPeriod);
    steps.push(`만료일 ${rawExpiry} (${cite(labels.endOfPeriod, "말일의 종료로 만료")})`);
  } else if (input.unit === "week") {
    rawExpiry = addDays(startDate, input.count * 7 - 1);
    useArticle(labels.calendar);
    useArticle(labels.endOfPeriod);
    steps.push(`만료일 ${rawExpiry} (${cite(labels.calendar, "최종 주의 기산일 해당일 전일")})`);
  } else {
    const months = input.unit === "year" ? input.count * 12 : input.count;
    const target = addMonthsCalendar(startDate, months);
    if (target.clipped) {
      rawExpiry = target.date;
      useArticle(labels.monthEndClip);
      useArticle(labels.endOfPeriod);
      steps.push(
        `만료일 ${rawExpiry} (${cite(labels.monthEndClip, "최종 월에 해당일이 없어 그 월의 말일")})`,
      );
    } else {
      rawExpiry = addDays(target.date, -1);
      useArticle(labels.calendar);
      useArticle(labels.endOfPeriod);
      steps.push(
        `만료일 ${rawExpiry} (${cite(
          labels.calendar,
          `최종 ${input.unit === "year" ? "년" : "월"}의 해당일 ${target.date} 의 전일`,
        )})`,
      );
    }
  }

  const extension = applyHolidayExtension(
    rawExpiry,
    input.holidayExtension === true,
    deps,
    labels.holidayRollover,
  );
  if (extension.status === "applied") {
    articles.push(labels.holidayRollover);
  }
  if (extension.reasonKo !== undefined) {
    steps.push(extension.reasonKo);
  }

  return {
    startDate,
    rawExpiry,
    expiryDate: extension.date,
    holidayExtension: extension.status,
    ...(extension.reasonKo !== undefined ? { adjustmentReasonKo: extension.reasonKo } : {}),
    articles,
    formulaText: steps.join(" → "),
    noteKo: labels.noteKo,
  };
}

/**
 * 두 날짜 사이의 기간을 낸다. 일수는 민법 제157조 (초일 불산입 / 0시 기산 산입) 를 따르고,
 * 연·월 환산은 `computePeriod` 의 역법 계산을 그대로 뒤집어 낸 **참고값**이다.
 *
 * @throws `to` 가 `from` 보다 이르거나 날짜 형식이 잘못되면 RangeError.
 */
export function computeDateSpan(input: DateSpanInput): DateSpanResult {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  const fromMs = parseIsoDateUtc(input.from);
  if (parseIsoDateUtc(input.to) < fromMs) {
    throw new RangeError(`${PREFIX}: to (${input.to}) 가 from (${input.from}) 보다 이릅니다.`);
  }

  const includeFirstDay = input.includeFirstDay ?? false;
  const startDate = includeFirstDay ? input.from : addDays(input.from, 1);
  const days =
    startDate > input.to
      ? 0
      : countDays(startDate, input.to, { leapYear: "actual", includeFirstDay: true });

  // 만료일 `to` 를 낸 기간을 되짚는다. `computePeriod` 가 최종 해당일의 전일을 만료일로
  // 삼으므로, 역산은 `to` 의 익일을 경계로 두고 완전한 월 수를 센다.
  const endExclusive = addDays(input.to, 1);
  const wholeMonths = startDate > input.to ? 0 : diffWholeMonths(startDate, endExclusive);
  const anchor = addMonthsCalendar(startDate, wholeMonths).date;
  const remainingDays =
    anchor > endExclusive
      ? 0
      : countDays(anchor, endExclusive, { leapYear: "actual", includeFirstDay: false });

  const calendar = {
    years: Math.floor(wholeMonths / 12),
    months: wholeMonths % 12,
    days: remainingDays,
  };

  return {
    startDate,
    days,
    calendar,
    articles: ["제157조", "제160조"],
    formulaText:
      `기산일 ${startDate} (제157조 ${
        includeFirstDay ? "단서, 오전 0시 기산이라 초일 산입" : "본문, 초일 불산입"
      })` +
      ` → ${input.to} 까지 ${days}일` +
      ` (역법 환산 ${calendar.years}년 ${calendar.months}개월 ${calendar.days}일, 참고값)`,
    noteKo: SUPPLEMENTARY_NOTE_KO,
  };
}

interface ExtensionOutcome {
  date: IsoDate;
  status: HolidayExtensionStatus;
  reasonKo?: string;
}

function applyHolidayExtension(
  rawExpiry: IsoDate,
  enabled: boolean,
  deps: PeriodDeps | undefined,
  article: string,
): ExtensionOutcome {
  if (!enabled || deps === undefined) {
    return { date: rawExpiry, status: "off" };
  }
  const outOfCoverage: ExtensionOutcome = {
    date: rawExpiry,
    status: "outOfCoverage",
    reasonKo: `${article} 판정 불가 (${rawExpiry} 가 공휴일 데이터 커버리지 밖이거나 토요일 말일 연장 시행일(2008-03-22) 이전 구간이라 토요일·공휴일 연장 여부를 확인하지 못했습니다. 만료일을 직접 확인하십시오.)`,
  };
  if (!deps.isCovered(rawExpiry)) {
    return outOfCoverage;
  }
  let rolled: { date: IsoDate; rolled: boolean; reasonKo?: string };
  try {
    rolled = deps.rollToNextBusinessDay(rawExpiry);
  } catch (error) {
    // 말일 자체는 커버리지 안이지만 연속 휴일이 커버리지 끝을 넘어가는 경우,
    // 또는 말일·연장 경로에 2008-03-22 이전 토요일이 걸리는 경우.
    if (error instanceof RangeError) return outOfCoverage;
    throw error;
  }
  if (!rolled.rolled) {
    return { date: rawExpiry, status: "notApplied" };
  }
  return {
    date: rolled.date,
    status: "applied",
    reasonKo: `${article} 적용: ${rolled.date} (${rolled.reasonKo ?? "말일이 토요일 또는 공휴일이라 익일로 만료"})`,
  };
}

/**
 * 입력값 자체의 검증. 공휴일 deps 유무는 보지 않는다.
 *
 * `.lcalc` 파서처럼 계산 없이 입력만 확인하는 호출자가 있어 따로 열어 둔다. 그 자리에서는
 * deps 가 아직 없고(계산 시점에 붙는다), 저장된 입력에 `holidayExtension: true` 가 들어
 * 있다는 이유로 파일이 안 열리면 안 된다.
 *
 * @throws 값이 잘못되면 한국어 RangeError.
 */
export function validatePeriodInput(input: PeriodInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  parseIsoDateUtc(input.from);
  if (!(input.unit in UNIT_LABEL)) {
    throw new RangeError(`${PREFIX}: unit 은 day / week / month / year 중 하나여야 합니다.`);
  }
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_COUNT) {
    throw new RangeError(`${PREFIX}: count 는 1 이상 ${MAX_COUNT} 이하의 정수여야 합니다.`);
  }
}

function dateParts(date: IsoDate): { y: number; m: number; d: number } {
  // 형식·달력 유효성 검증은 days.ts 를 단일 출처로 쓴다.
  parseIsoDateUtc(date);
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return { y, m, d };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * `date + n개월` 을 역법으로 계산한다 (민법 제160조 제2항).
 * 최종 월에 해당일이 없으면 그 월의 말일을 내고 `clipped: true` 로 알린다 (같은 조 제3항).
 */
function addMonthsCalendar(date: IsoDate, months: number): { date: IsoDate; clipped: boolean } {
  const { y, m, d } = dateParts(date);
  const total = y * 12 + (m - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const last = lastDayOfMonth(targetYear, targetMonth);
  const clipped = d > last;
  const day = clipped ? last : d;
  const iso = `${targetYear.toString().padStart(4, "0")}-${targetMonth
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  return { date: iso, clipped };
}

/** `from` 부터 `toExclusive` 사이에 들어가는 완전한 역법 월 수. */
function diffWholeMonths(from: IsoDate, toExclusive: IsoDate): number {
  const a = dateParts(from);
  const b = dateParts(toExclusive);
  let n = (b.y - a.y) * 12 + (b.m - a.m);
  if (n < 0) return 0;
  while (n > 0 && addMonthsCalendar(from, n).date > toExclusive) {
    n -= 1;
  }
  return n;
}
