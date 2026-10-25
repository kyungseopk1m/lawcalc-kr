/**
 * 기대여명·여명종료일·여명단축 계산.
 *
 * 규칙은 법원 손해배상 프로그램 화면 7건과 서울고법 2022. 2. 18. 선고 2020나2039267 의
 * 여명종료일을 역산해 정했다.
 * - 생명표: 기준일이 속한 해의 사망률 기준연도 표. 없으면 수록된 최신 표를 쓰고 경고한다.
 *   `tableYear` 를 주면 그 연도 표를 쓴다 (수록되지 않았으면 RangeError).
 * - 나이: 기준일 현재 만 나이 (정수, 보간 없음).
 * - 날짜: 기준일 + floor(여명 × 365)일. "× 365.25", 년 단위 날짜 더하기, 반올림은 모두 사례와 어긋난다.
 *
 * 여명은 소수 둘째 자리 값이라 백분의 일 년 단위 정수로 바꿔 계산한다 (부동소수 곱의 1일 오차 방지).
 * 백분율 단축은 여명 × P/100 을 정확한 분수로 둔 채 × 365 후 버린다. 일수에 P 를 곱하는 순서와
 * 결과가 다를 수 있으나 구분할 실례가 없어 년수에 곱하는 쪽을 택했다.
 */

import { addDays, type IsoDate } from "@lawcalc-kr/core-engine";
import {
  getLifeExpectancyAtYear,
  listLifeExpectancyYears,
  loadLifeExpectancyTable,
} from "@lawcalc-kr/datasets-compensation";

import type {
  LifeExpectancyDeps,
  LifeExpectancyInput,
  LifeExpectancyResult,
  LifeExpectancyWarning,
} from "./types";
import { validateLifeExpectancyInput } from "./validators";

/** 기준일 현재 만 나이. 2월 29일생은 평년 3월 1일에 나이를 먹는다 (민법 제160조제3항). */
export function fullAge(birthDate: IsoDate, date: IsoDate): number {
  const age = Number(date.slice(0, 4)) - Number(birthDate.slice(0, 4));
  return date.slice(5) < birthDate.slice(5) ? age - 1 : age;
}

/** floor(numerator / denominator), 둘 다 음 아닌 안전 정수. */
function floorDiv(numerator: number, denominator: number): number {
  return (numerator - (numerator % denominator)) / denominator;
}

/** 여명(백분의 일 년 × scale)을 날짜로. 일수 = floor(hundredths × 365 / (100 × scale)). */
function endDateOf(baseDate: IsoDate, hundredths: number, scale = 1): IsoDate {
  return addDays(baseDate, floorDiv(hundredths * 365, 100 * scale));
}

export function computeLifeExpectancy(
  input: LifeExpectancyInput,
  deps: LifeExpectancyDeps = {},
): LifeExpectancyResult {
  validateLifeExpectancyInput(input);
  const dataset = loadLifeExpectancyTable(deps.lifeExpectancy);
  const warnings: LifeExpectancyWarning[] = [];

  const baseDate =
    input.basis === "appraisal" ? (input.appraisalDate as IsoDate) : input.accidentDate;
  const age = fullAge(input.birthDate, baseDate);
  const baseYear = Number(baseDate.slice(0, 4));
  let tableYear = input.tableYear ?? baseYear;
  if (input.tableYear !== undefined) {
    if (!listLifeExpectancyYears(dataset).includes(input.tableYear)) {
      throw new RangeError(
        `기대여명 계산 실패: ${input.tableYear}년 생명표가 수록되어 있지 않습니다.`,
      );
    }
  } else if (!listLifeExpectancyYears(dataset).includes(baseYear)) {
    tableYear = dataset.mortalityBaseYear;
    warnings.push({
      code: "lifeTableFallback",
      message: `${baseYear}년 생명표가 없어 수록된 최신 ${tableYear}년 생명표를 씁니다.`,
    });
  }
  const remainingYears = getLifeExpectancyAtYear(dataset, input.sex, age, tableYear);
  if (remainingYears === undefined) {
    throw new RangeError(`기대여명 계산 실패: ${tableYear}년 생명표에 만 ${age}세 값이 없습니다.`);
  }
  const normal = Math.round(remainingYears * 100);
  const normalEndDate = endDateOf(baseDate, normal);

  let shortened: { shortenedRemainingYears: number; shortenedEndDate: IsoDate } | undefined;
  const s = input.shortening;
  if (s?.method === "percent") {
    // 정상 여명 × P/100: 백분의 일 년 × 백분의 일 % 를 정수로 두고 나눗셈은 날짜 변환에서 한 번만.
    const scaled = normal * Math.round(s.percent * 100);
    shortened = {
      shortenedRemainingYears: scaled / 1_000_000,
      shortenedEndDate: endDateOf(baseDate, scaled, 10_000),
    };
  } else if (s !== undefined) {
    const years = Math.round(s.years * 100);
    const value = s.method === "subtractYears" ? normal - years : years;
    if (value <= 0) {
      throw new RangeError(
        `기대여명 계산 실패: 단축 후 여명이 0년 이하입니다 (정상 여명 ${remainingYears}년, 차감 ${s.years}년).`,
      );
    }
    shortened = {
      shortenedRemainingYears: value / 100,
      shortenedEndDate: endDateOf(baseDate, value),
    };
  }

  const endDateOverridden = input.endDateOverride !== undefined;
  const endDate = input.endDateOverride ?? shortened?.shortenedEndDate ?? normalEndDate;
  return {
    baseDate,
    age,
    tableYear,
    remainingYears,
    normalEndDate,
    ...shortened,
    endDate,
    endDateOverridden,
    warnings,
  };
}
