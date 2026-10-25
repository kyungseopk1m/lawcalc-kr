/**
 * 기대여명 입력 검증. 실패 시 RangeError (한국어 메시지).
 */

import { isValidIsoDate } from "@lawcalc-kr/core-engine";
import type { LifeExpectancyInput } from "./types";

const PREFIX = "기대여명 입력 검증 실패";

function assertIsoDate(label: string, value: unknown): void {
  if (!isValidIsoDate(value)) {
    throw new RangeError(`${PREFIX}: ${label} 는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.`);
  }
}

/** 소수 둘째 자리까지인 유한수인지. 100배 값이 정수에 충분히 가까우면 통과. */
function isTwoDecimal(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value * 100 - Math.round(value * 100)) < 1e-6
  );
}

export function validateLifeExpectancyInput(input: LifeExpectancyInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  if (input.sex !== "male" && input.sex !== "female") {
    throw new RangeError(`${PREFIX}: sex 는 "male" 또는 "female" 이어야 합니다.`);
  }
  assertIsoDate("birthDate", input.birthDate);
  assertIsoDate("accidentDate", input.accidentDate);
  // ISO 형식이 확인됐으므로 문자열 비교가 날짜 비교와 같다.
  if (input.accidentDate < input.birthDate) {
    throw new RangeError(`${PREFIX}: accidentDate 는 birthDate 이후여야 합니다.`);
  }
  if (input.basis !== undefined && input.basis !== "accident" && input.basis !== "appraisal") {
    throw new RangeError(`${PREFIX}: basis 는 "accident" 또는 "appraisal" 이어야 합니다.`);
  }
  if (input.basis === "appraisal" && input.appraisalDate === undefined) {
    throw new RangeError(`${PREFIX}: 감정일 기준이면 appraisalDate 가 필요합니다.`);
  }
  if (input.appraisalDate !== undefined) {
    assertIsoDate("appraisalDate", input.appraisalDate);
    if (input.appraisalDate < input.accidentDate) {
      throw new RangeError(`${PREFIX}: appraisalDate 는 accidentDate 이후여야 합니다.`);
    }
  }
  if (input.endDateOverride !== undefined) {
    assertIsoDate("endDateOverride", input.endDateOverride);
    if (input.endDateOverride < input.accidentDate) {
      throw new RangeError(`${PREFIX}: endDateOverride 는 accidentDate 이후여야 합니다.`);
    }
  }
  if (
    input.tableYear !== undefined &&
    (typeof input.tableYear !== "number" || !Number.isInteger(input.tableYear))
  ) {
    throw new RangeError(`${PREFIX}: tableYear 는 정수(사망률 기준연도)여야 합니다.`);
  }
  const s = input.shortening;
  if (s !== undefined) {
    if (s === null || typeof s !== "object") {
      throw new RangeError(`${PREFIX}: shortening 은 객체여야 합니다.`);
    }
    if (s.method === "percent") {
      if (!isTwoDecimal(s.percent) || s.percent <= 0 || s.percent > 100) {
        throw new RangeError(
          `${PREFIX}: 백분율 단축의 percent 는 0 초과 100 이하, 소수 둘째 자리까지여야 합니다.`,
        );
      }
    } else if (s.method === "subtractYears" || s.method === "remainingYears") {
      const min = s.method === "subtractYears" ? 0 : 0.01;
      if (!isTwoDecimal(s.years) || s.years < min) {
        throw new RangeError(
          `${PREFIX}: 단축 years 는 ${s.method === "subtractYears" ? "0 이상" : "0 초과"}, 소수 둘째 자리까지여야 합니다.`,
        );
      }
    } else {
      throw new RangeError(
        `${PREFIX}: shortening.method 는 "subtractYears" | "remainingYears" | "percent" 중 하나여야 합니다.`,
      );
    }
  }
}
