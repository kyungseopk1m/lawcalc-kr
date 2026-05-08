import type { CalcOptions, IsoDate } from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

function parseParts(value: IsoDate): { y: number; m: number; d: number } {
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`Invalid ISO date: "${value}" (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const ms = Date.UTC(y, m - 1, d);
  const reconstructed = new Date(ms);
  if (
    reconstructed.getUTCFullYear() !== y ||
    reconstructed.getUTCMonth() !== m - 1 ||
    reconstructed.getUTCDate() !== d
  ) {
    throw new RangeError(`Invalid calendar date: "${value}"`);
  }
  return { y, m, d };
}

/**
 * "YYYY-MM-DD"를 UTC epoch ms로 변환한다. 시간대/DST 영향 배제.
 */
export function parseIsoDateUtc(value: IsoDate): number {
  const { y, m, d } = parseParts(value);
  return Date.UTC(y, m - 1, d);
}

function formatIsoDateUtc(ms: number): IsoDate {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear().toString().padStart(4, "0");
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = d.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * 두 날짜 사이의 일수를 옵션에 따라 계산한다.
 *
 * 규약 (법원 매뉴얼/실무 기준):
 * - `to` 는 항상 산입한다 (말일 산입).
 * - `includeFirstDay` 가 false 면 시작일 1일을 차감한다 (민법 제157조 초일 불산입 원칙).
 * - 같은 날짜 + 초일 산입 → 1일, 같은 날짜 + 초일 불산입 → 0일.
 *
 * `leapYear` 는 분모(연 일수) 결정에만 영향을 주고 본 함수에서는 사용하지 않는다.
 * 일수 자체는 항상 실제 캘린더 기준으로 센다.
 *
 * @throws `from` 또는 `to` 가 잘못된 날짜이거나 `to < from` 이면 RangeError.
 */
export function countDays(
  from: IsoDate,
  to: IsoDate,
  options: Pick<CalcOptions, "leapYear" | "includeFirstDay">,
): number {
  const fromMs = parseIsoDateUtc(from);
  const toMs = parseIsoDateUtc(to);
  if (toMs < fromMs) {
    throw new RangeError(`countDays: "to" (${to}) is before "from" (${from})`);
  }
  void options.leapYear;
  const inclusive = Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
  return options.includeFirstDay ? inclusive : inclusive - 1;
}

/**
 * 그레고리력 윤년 정의.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number, leapYear: CalcOptions["leapYear"]): number {
  if (leapYear === "fixed365") return 365;
  return isLeapYear(year) ? 366 : 365;
}

/**
 * `from` 부터 `to` (둘 다 포함)까지에 윤일(2/29)이 포함되어 있는지 검사한다.
 * 기간식 분모 결정에 사용된다 (법원 매뉴얼: 1년 사이에 윤달 있으면 366).
 */
export function containsLeapDay(from: IsoDate, to: IsoDate): boolean {
  const a = parseParts(from);
  const b = parseParts(to);
  for (let y = a.y; y <= b.y; y++) {
    if (!isLeapYear(y)) continue;
    const leap = `${y.toString().padStart(4, "0")}-02-29`;
    if (leap >= from && leap <= to) return true;
  }
  return false;
}

/**
 * `date + n year`. 02-29 + 1y 가 비윤년이면 02-28로 clip한다 (민법 통설).
 */
export function addYears(date: IsoDate, n: number): IsoDate {
  const { y, m, d } = parseParts(date);
  const targetYear = y + n;
  let day = d;
  if (m === 2 && d === 29 && !isLeapYear(targetYear)) {
    day = 28;
  }
  return `${targetYear.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

/**
 * `date + n day`. UTC 기반.
 */
export function addDays(date: IsoDate, n: number): IsoDate {
  return formatIsoDateUtc(parseIsoDateUtc(date) + n * MS_PER_DAY);
}

/**
 * `a` 와 `b` 중 더 빠른(작은) 날짜.
 */
export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

/**
 * `a` 와 `b` 중 더 늦은(큰) 날짜.
 */
export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a > b ? a : b;
}
