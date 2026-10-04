/**
 * compensation 패키지 공용 내부 헬퍼.
 *
 * 월수 계산과 호프만 현가율 조회는 자×부상·자×사망·기타손해 세 도메인이 같은 정원을
 * 써야 한다. 과거 세 곳에 각자 복제돼 있었고, 그 탓에 coverage clamp 가 기타손해에만
 * 적용되어 일실수입 본류에서 RangeError 가 나는 비대칭이 생겼다. 단일 출처로 합쳐
 * 같은 결함이 재발하지 않게 한다.
 */

import {
  getHoffmanAt,
  getLaborRateAt,
  type HoffmanDataset,
  type LaborRatesDataset,
} from "@lawcalc-kr/datasets-compensation";
import type { IsoDate } from "@lawcalc-kr/core-engine";

/** `H[0] = 0` 정원 보강 (dataset 의 1-based index 와 segment boundary 통합). */
export function getCumulativeHoffman(dataset: HoffmanDataset, month: number): number {
  if (month === 0) return 0;
  return getHoffmanAt(dataset, month);
}

/**
 * 두 ISO 날짜 사이의 calendar month floor 차이.
 *
 * - `to.day` 가 `from.day` 보다 작으면 -1 (월 미충족 분 제거).
 * - 사고일 ~ (생년 + retirementAge 년) 정원에서는 day 가 정확 동일하므로 -1 발생 안 함.
 */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/**
 * 호프만표 coverage 범위로 월수를 clamp 한다.
 *
 * 사고 당시 만 25세 미만(가동연한 65세 기준 480개월 초과)이거나 가동연한을 65세보다
 * 높게 잡으면 조회 월수가 dataset 의 `monthsCovered` 를 넘어 `getHoffmanAt` 이
 * RangeError 를 던진다. 단리 중간이자 공제의 현가율은 414개월에서 이미 240 한도에
 * 걸리므로(대법원 1992. 7. 10. 선고 92다15871 — 240 을 넘으면 수치표상 값과 무관하게
 * 240 적용), coverage 를 넘는 구간의 기여분은 0 이고 clamp 해도 금액이 달라지지 않는다.
 *
 * 즉 clamp 는 근사가 아니라 판례가 정한 한도를 그대로 반영하는 것이며, 계산을 거부할
 * 이유가 없다. 표시용 `startMonth`/`endMonth` 는 clamp 하지 않아 실제 가동기간이
 * 결과에 그대로 남고, 한도 적용 사실은 `hoffman240Cap` 이 별도로 드러낸다.
 */
export function clampToHoffmanCoverage(dataset: HoffmanDataset, month: number): number {
  return Math.max(0, Math.min(month, dataset.monthsCovered));
}

/** clamp 를 적용한 누적 현가율 조회. 일실수입·개호비 전 경로의 단일 진입점. */
export function getCumulativeHoffmanClamped(dataset: HoffmanDataset, month: number): number {
  return getCumulativeHoffman(dataset, clampToHoffmanCoverage(dataset, month));
}

/**
 * 노임단가 적용일 규약.
 *
 * - `"published"`: 대한건설협회 공표 적용일(1/1·9/1). 데이터셋 `effectiveFrom` 그대로.
 * - `"survey"`: 조사 시점(5/1·9/1). 같은 단가를 4개월 앞당겨 적용한다. 법원 손해배상 계산
 *   프로그램 예시와 이를 붙인 판결 별지(서울중앙지법 2020. 10. 21. 선고 2019나48259 등)가 이 방식이다.
 *
 * 데이터셋은 그대로 두고 조회할 때만 규약을 바꾼다.
 */
export type LaborRateEffectiveRule = "published" | "survey";

const SURVEY_LEAD_MONTHS = 4;

/** `date + n month`. 대상 월에 그 일자가 없으면 말일로 맞춘다. */
export function shiftMonths(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const index = y * 12 + (m - 1) + n;
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

/**
 * 규약을 반영한 노임단가 조회. 조사 시점 규약은 `date + 4개월` 의 공표 단가와 같다
 * (공표 적용일이 모두 매월 1일이라 말일 보정이 경계를 넘지 않는다).
 * 사고일 구간 단가는 공표 시점과 무관하게 규약대로 정한다. "기준일까지 공표된 단가만" 제한은
 * 사고일 이후 분할 경계(`laborRateChanges`)에만 적용한다. 그래서 기준일 = 사고일이면 기준일
 * 없음과 결과가 같다.
 */
export function getLaborRateAtRule(
  dataset: LaborRatesDataset,
  occupation: string,
  date: IsoDate,
  rule: LaborRateEffectiveRule = "published",
): number | undefined {
  return getLaborRateAt(
    dataset,
    occupation,
    rule === "survey" ? shiftMonths(date, SURVEY_LEAD_MONTHS) : date,
  );
}

/** 계산은 하되 사용자가 알아야 할 대체 처리. 결과의 `warnings` 에 실린다. */
export interface CompensationWarning {
  /**
   * - `laborRateCarriedForward`: 직종이 뒤 노임 조사에서 빠져 그 뒤 구간에 마지막 단가를 이어 썼다.
   * - `laborRateSurveyFallback`: 조사 시점 규약으로 사고일 단가를 찾지 못해 공표 적용일 단가를 썼다.
   */
  code: "laborRateCarriedForward" | "laborRateSurveyFallback";
  occupation: string;
  message: string;
}

/**
 * 직종 단가 조회 + 대체 처리. 찾지 못하면 `undefined` (호출자가 RangeError).
 *
 * - 사고일 조회: 규약대로 찾고, 조사 시점 규약에서 실패하면 공표 적용일 단가로 대체 + 경고.
 *   공표 규약에서 사고일 단가가 없으면 대체하지 않는다 (직종 통합 안내는 화면 몫).
 * - 사고일 뒤 분할 구간: 직종이 그 묶음에 없으면 그 직종의 마지막 조사 단가를 이어 쓴다 (다른 직종
 *   단가로 대체하지 않는다) + 경고. 경고는 같은 직종·종류당 한 번.
 */
export function resolveOccupationRate(
  dataset: LaborRatesDataset,
  occupation: string,
  date: IsoDate,
  rule: LaborRateEffectiveRule,
  accidentDate: IsoDate,
  warnings: CompensationWarning[],
): number | undefined {
  const rate = getLaborRateAtRule(dataset, occupation, date, rule);
  if (rate !== undefined) return rate;
  const warn = (code: CompensationWarning["code"], message: string) => {
    if (!warnings.some((w) => w.code === code && w.occupation === occupation)) {
      warnings.push({ code, occupation, message });
    }
  };
  if (date === accidentDate) {
    if (rule !== "survey") return undefined;
    const published = getLaborRateAt(dataset, occupation, date);
    if (published !== undefined) {
      warn(
        "laborRateSurveyFallback",
        `${occupation} 직종은 조사 시점 규약으로 사고일 ${date} 단가를 찾을 수 없어 공표 적용일 기준 단가 ${published.toLocaleString("ko-KR")}원을 씁니다.`,
      );
    }
    return published;
  }
  const lookup = rule === "survey" ? shiftMonths(date, SURVEY_LEAD_MONTHS) : date;
  let last: { rate: number; from: IsoDate } | undefined;
  let missingFrom: IsoDate | undefined;
  for (const slice of dataset.slices) {
    if (slice.effectiveFrom > lookup) break;
    const value = slice.rates[occupation];
    if (typeof value === "number") {
      last = { rate: value, from: slice.effectiveFrom };
      missingFrom = undefined;
    } else if (last !== undefined) {
      missingFrom ??= slice.effectiveFrom;
    }
  }
  if (last === undefined) return undefined;
  warn(
    "laborRateCarriedForward",
    `${occupation} 직종은 ${missingFrom ?? lookup} 이후 조사되지 않아 그 뒤 구간은 마지막 단가 ${last.rate.toLocaleString("ko-KR")}원(${last.from} 적용)을 씁니다.`,
  );
  return last.rate;
}

/** 노임단가 변경일과 그 날의 사고일 기준 월수. */
export interface LaborRateChange {
  date: IsoDate;
  month: number;
}

/**
 * 사고일 뒤의 노임단가 변경일(규약 반영) 오름차순. 계산 기준일까지 **공표된** 단가만 넣는다.
 * 판결 별지는 변론종결일까지 나온 마지막 조사보고서 단가를 장래분에 쓰고, 조사 시점 규약이면
 * 그 단가를 4개월 앞당긴 날부터 적용한다 (서울중앙지법 2019나48259: 변론종결 2020. 7. 22.,
 * 2020. 1. 1. 공표 138,290원을 2019. 9. 1.부터).
 * 월수는 `monthsBetween(accidentDate, date)` 다. 같은 월수에 걸린 변경은 뒤 단가가 그 월부터
 * 적용된다(법원 프로그램 계산표의 0개월 행과 금액이 같다).
 */
export function laborRateChanges(
  dataset: LaborRatesDataset,
  accidentDate: IsoDate,
  calculationDate: IsoDate,
  rule: LaborRateEffectiveRule = "published",
): LaborRateChange[] {
  return dataset.slices
    .filter((slice) => slice.effectiveFrom <= calculationDate)
    .map((slice) =>
      rule === "survey"
        ? shiftMonths(slice.effectiveFrom, -SURVEY_LEAD_MONTHS)
        : slice.effectiveFrom,
    )
    .filter((date) => date > accidentDate)
    .map((date) => ({ date, month: monthsBetween(accidentDate, date) }));
}

/**
 * 직종 단가가 직전 구간과 같은 변경일은 뺀다. 직종이 뒤 조사에서 빠져 마지막 단가를 이어 쓸 때
 * 같은 일당 행이 수십 개로 갈려 행마다 원 미만 절사가 쌓이는 것을 막는다.
 */
export function dropUnchangedLaborRates(
  changes: readonly LaborRateChange[],
  rateAt: (date: IsoDate) => number | undefined,
  startDate: IsoDate,
): LaborRateChange[] {
  let previous = rateAt(startDate);
  return changes.filter((change) => {
    const rate = rateAt(change.date);
    if (rate !== undefined && rate === previous) return false;
    previous = rate;
    return true;
  });
}

/** `date` 에 적용할 단가의 조회일 = 그날 이전(포함) 마지막 변경일, 없으면 `fallback`(사고일). */
export function laborRateDateAt(
  changes: readonly LaborRateChange[],
  date: IsoDate,
  fallback: IsoDate,
): IsoDate {
  let selected = fallback;
  for (const change of changes) {
    if (change.date <= date && change.date > selected) selected = change.date;
  }
  return selected;
}

/**
 * 비율 곱셈의 정확한 원 미만 절사.
 *
 * `Math.floor(금액 × (1 - 0.1))` 처럼 실수로 계수를 만들어 곱하면 `1 - 0.1 = 0.9` 근방의 이진 오차로
 * 정수 결과가 1원 모자랄 수 있다 (`1 - (1 - 0)(1 - 0.1)` = 0.09999999999999998 → 1,000,000 × → 99,999).
 * 비율을 유효숫자 15자리로 정규화한 JS 의 최단 십진 표현(`String(r)`)이 뜻하는 십진 유리수 `정수 / 10^k` 로 바꿔 BigInt 로
 * 곱하고 나눈다. 0.1 은 정확히 1/10 이고, 1/3 은 0.3333333333333333 (16자리)로 종전 실수 곱과 같은
 * 값이 된다. double 의 이진 정확값을 쓰면 0.1 이 0.1000000000000000055... 가 되어 같은 오차가 되살아난다.
 * 금액은 0 이상 정수여야 한다.
 */
function decimalRatio(ratio: number): { num: bigint; den: bigint } {
  // 화면은 "38.88" 을 38.88 / 100 = 0.38880000000000003 으로 넘긴다. 유효숫자 15자리로 정규화해
  // 입력 의도(0.3888)를 되살린다. 1/3 은 0.333333333333333 이 되어 1e9 × (1 - r) 는 666,666,666 그대로.
  const [mantissa = "0", exponentText = "0"] = String(Number(ratio.toPrecision(15)))
    .toLowerCase()
    .split("e");
  const [intPart = "0", fracPart = ""] = mantissa.split(".");
  const exponent = Number(exponentText) - fracPart.length;
  const digits = BigInt(intPart + fracPart);
  return exponent >= 0
    ? { num: digits * 10n ** BigInt(exponent), den: 1n }
    : { num: digits, den: 10n ** BigInt(-exponent) };
}

/** `floor(amount × Π(1 - ratio_i) / divisor)`. `divisor` 는 1e-4 단위 수치합계 등 정수 환산용. */
export function floorTimesComplements(
  amount: number | bigint,
  ratios: readonly number[],
  divisor = 1,
): number {
  let numerator = BigInt(amount);
  let denominator = BigInt(divisor);
  for (const ratio of ratios) {
    const { num, den } = decimalRatio(ratio);
    numerator *= den - num;
    denominator *= den;
  }
  return Number(numerator / denominator);
}

/**
 * 공제 적용 (과실상계 후 금액 기준).
 *
 * - 구 비율공제: `floor(과실상계 후 × Σ ratio)` (구 파일 금액 유지를 위해 호출자가 종전 실수식 그대로 구한다).
 * - 비율공제·지급치료비: 항목마다 `floor(금액 × [1 - (1 - 기왕증)(1 - 과실)])`. 재산상 손해에만
 *   대응하므로 남은 재산상 손해를 넘는 부분은 버린다 (위자료 잠식 없음, 원장 결정 9 재검토).
 * - 전액공제: 그대로 뺀다. 재산상 손해를 넘으면 그 초과분이 위자료를 차감한다(선급금 등 손해 전체 변제).
 */
export function applyDeductions(
  afterFaultWon: number,
  legacyRatioWon: number,
  propertyOnlyWon: number,
  absoluteWon: number,
): { afterWon: number; propertyOnlyAppliedWon: number } {
  const propertyOnlyAppliedWon = Math.min(
    propertyOnlyWon,
    Math.max(0, afterFaultWon - legacyRatioWon),
  );
  return {
    afterWon: afterFaultWon - legacyRatioWon - propertyOnlyAppliedWon - absoluteWon,
    propertyOnlyAppliedWon,
  };
}

/** 공제 계수 `1 - (1 - 기왕증)(1 - 과실)` 을 항목마다 곱해 floor 한 합 (정수 연산). */
export function sumCourtDeductions(
  items: readonly { amount: number }[] | undefined,
  priorImpairmentRatio: number,
  faultRatio: number,
): number {
  // floor(a × (1 - c)) = a - ceil(a × c), c = (1 - 기왕증)(1 - 과실). a × c 의 올림을 정수로 구한다.
  const prior = decimalRatio(priorImpairmentRatio);
  const fault = decimalRatio(faultRatio);
  const scale = prior.den * fault.den;
  const remain = (prior.den - prior.num) * (fault.den - fault.num);
  return (items ?? []).reduce((acc, item) => {
    const kept = (BigInt(item.amount) * remain + scale - 1n) / scale;
    return acc + item.amount - Number(kept);
  }, 0);
}
