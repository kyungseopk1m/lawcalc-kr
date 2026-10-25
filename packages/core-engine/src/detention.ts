import { addDays, countDays, parseIsoDateUtc } from "./days";
import type { IsoDate } from "./types";

/**
 * - `sentencing`: 판결선고일 기준. 구금 시작일 산입, 기준일(선고일) 불산입.
 * - `release`: 석방일 기준. 구금 시작일과 기준일(석방일) 모두 산입 (= sentencing + 1).
 */
export type DetentionBasis = "sentencing" | "release";

export interface DetentionInput {
  /** 구금 시작일 (체포·구속일). */
  startDate: IsoDate;
  /** 판결선고일 또는 석방일. `startDate` 이후(같은 날 포함). */
  baseDate: IsoDate;
  basis: DetentionBasis;
}

export interface DetentionResult {
  days: number;
  articles: string[];
  formulaText: string;
}

const PREFIX = "미결구금일수 입력 검증 실패";

/**
 * 미결구금일수. 형법 제57조 제1항은 판결선고 전의 구금일수 전부를 형에 산입하고, 같은 조
 * 제2항은 구금일수 1일을 형기 1일로 계산한다. 이 함수는 그 일수를 센다.
 *
 * @throws 날짜가 잘못되었거나 `baseDate` 가 `startDate` 보다 이르면 한국어 RangeError.
 */
export function computeDetentionDays(input: DetentionInput): DetentionResult {
  try {
    parseIsoDateUtc(input.startDate);
    parseIsoDateUtc(input.baseDate);
  } catch {
    throw new RangeError(`${PREFIX}: 날짜 형식이 올바르지 않습니다.`);
  }
  if (input.baseDate < input.startDate) {
    throw new RangeError(
      `${PREFIX}: 기준일 (${input.baseDate}) 이 구금 시작일 (${input.startDate}) 보다 이릅니다.`,
    );
  }
  if (input.basis !== "sentencing" && input.basis !== "release") {
    throw new RangeError(`${PREFIX}: basis 는 sentencing 또는 release 여야 합니다.`);
  }
  const inclusive = countDays(input.startDate, input.baseDate, {
    leapYear: "actual",
    includeFirstDay: true,
  });
  const release = input.basis === "release";
  const days = release ? inclusive : inclusive - 1;
  return {
    days,
    articles: ["형법 제57조"],
    formulaText: release
      ? `구금 시작일 ${input.startDate} 부터 석방일 ${input.baseDate} 까지 (양 끝 산입) ${days}일`
      : `구금 시작일 ${input.startDate} 부터 판결선고일 ${input.baseDate} 전날까지 (선고일 불산입) ${days}일`,
  };
}

/**
 * 기준일이 속한 달을 포함해 `monthsBack` 개월 (기본 3: 전전월 1일부터) 의 날마다 구금 시작일로 넣은
 * 미결구금일수 표. 기준일 당일까지 포함한다.
 */
export function buildDetentionTable(
  baseDate: IsoDate,
  basis: DetentionBasis,
  monthsBack = 3,
): { startDate: IsoDate; days: number }[] {
  if (!Number.isInteger(monthsBack) || monthsBack < 1 || monthsBack > 24) {
    throw new RangeError(`${PREFIX}: monthsBack 은 1 이상 24 이하의 정수여야 합니다.`);
  }
  try {
    parseIsoDateUtc(baseDate);
  } catch {
    throw new RangeError(`${PREFIX}: 기준일 형식이 올바르지 않습니다.`);
  }
  const [y, m] = baseDate.split("-").map(Number) as [number, number];
  if (y < 1000) throw new RangeError(`${PREFIX}: 기준일 연도는 1000 이상이어야 합니다 (${y}).`);
  const first = new Date(Date.UTC(y, m - monthsBack, 1)).toISOString().slice(0, 10);
  const rows: { startDate: IsoDate; days: number }[] = [];
  for (let d = first; d <= baseDate; d = addDays(d, 1)) {
    rows.push({ startDate: d, days: computeDetentionDays({ startDate: d, baseDate, basis }).days });
  }
  return rows;
}
