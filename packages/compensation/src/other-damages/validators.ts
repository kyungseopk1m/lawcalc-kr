/**
 * 기타손해 입력 검증. 실패 시 RangeError (export surface 노출 가능한 한국어 메시지).
 */

import type { IsoDate } from "@lawcalc-kr/core-engine";
import type {
  AttendantCareInput,
  AttendantFutureSegmentInput,
  AttendantPastInput,
  OtherDamagesInput,
  TreatmentFutureInput,
  TreatmentInput,
  TreatmentPastInput,
} from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ITEMS = 50;
const PREFIX = "기타손해 입력 검증 실패";

function assertIsoDate(label: string, value: unknown): void {
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new RangeError(`${PREFIX}: ${label} 는 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const reconstructed = new Date(Date.UTC(y, m - 1, d));
  if (
    reconstructed.getUTCFullYear() !== y ||
    reconstructed.getUTCMonth() !== m - 1 ||
    reconstructed.getUTCDate() !== d
  ) {
    throw new RangeError(`${PREFIX}: ${label} 는 유효한 날짜여야 합니다.`);
  }
}

function assertNonNegativeInteger(label: string, value: unknown): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    !Number.isSafeInteger(value)
  ) {
    throw new RangeError(`${PREFIX}: ${label} 는 0 이상 정수여야 합니다.`);
  }
}

function assertPositiveNumber(label: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${PREFIX}: ${label} 는 양수여야 합니다.`);
  }
}

function assertRatio(label: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${PREFIX}: ${label} 는 0 이상 1 이하 실수여야 합니다.`);
  }
}

/** occupation 또는 directDailyWageWon 중 하나 필요 + directDailyWageWon 양의 정수. */
function assertWageSource(label: string, occupation: unknown, directDailyWageWon: unknown): void {
  const hasOccupation = typeof occupation === "string" && occupation.length > 0;
  const hasDirect = directDailyWageWon !== undefined;
  if (!hasOccupation && !hasDirect) {
    throw new RangeError(
      `${PREFIX}: ${label} 의 occupation 또는 directDailyWageWon 중 하나는 필요합니다.`,
    );
  }
  if (hasDirect) {
    assertNonNegativeInteger(`${label}.directDailyWageWon`, directDailyWageWon);
    if ((directDailyWageWon as number) === 0) {
      throw new RangeError(`${PREFIX}: ${label}.directDailyWageWon 는 양의 정수여야 합니다.`);
    }
  }
}

function validateAttendantPast(item: AttendantPastInput, i: number): void {
  if (item === null || typeof item !== "object") {
    throw new RangeError(`${PREFIX}: attendantCare.past[${i}] 객체가 필요합니다.`);
  }
  assertWageSource(`attendantCare.past[${i}]`, item.occupation, item.directDailyWageWon);
  assertPositiveNumber(`attendantCare.past[${i}].totalDays`, item.totalDays);
  if (item.actualSpentWon !== undefined) {
    assertNonNegativeInteger(`attendantCare.past[${i}].actualSpentWon`, item.actualSpentWon);
  }
  if (item.priorRatio !== undefined) {
    assertRatio(`attendantCare.past[${i}].priorRatio`, item.priorRatio);
  }
}

function validateAttendantFuture(
  item: AttendantFutureSegmentInput,
  i: number,
  accidentDate?: IsoDate,
): void {
  if (item === null || typeof item !== "object") {
    throw new RangeError(`${PREFIX}: attendantCare.future[${i}] 객체가 필요합니다.`);
  }
  assertWageSource(`attendantCare.future[${i}]`, item.occupation, item.directDailyWageWon);
  assertIsoDate(`attendantCare.future[${i}].startDate`, item.startDate);
  assertIsoDate(`attendantCare.future[${i}].endDate`, item.endDate);
  if (accidentDate !== undefined && item.startDate < accidentDate) {
    throw new RangeError(
      `${PREFIX}: attendantCare.future[${i}].startDate 는 사고일(${accidentDate}) 이상이어야 합니다.`,
    );
  }
  if (item.endDate < item.startDate) {
    throw new RangeError(
      `${PREFIX}: attendantCare.future[${i}].endDate 는 startDate 이상이어야 합니다.`,
    );
  }
  assertPositiveNumber(`attendantCare.future[${i}].personCount`, item.personCount);
  if (item.daysPerMonth !== undefined) {
    if (
      typeof item.daysPerMonth !== "number" ||
      !Number.isInteger(item.daysPerMonth) ||
      item.daysPerMonth < 1 ||
      item.daysPerMonth > 31
    ) {
      throw new RangeError(
        `${PREFIX}: attendantCare.future[${i}].daysPerMonth 는 1~31 정수여야 합니다.`,
      );
    }
  }
  if (item.priorRatio !== undefined) {
    assertRatio(`attendantCare.future[${i}].priorRatio`, item.priorRatio);
  }
}

function validateAttendantCare(attendantCare: AttendantCareInput, accidentDate?: IsoDate): void {
  if (attendantCare === null || typeof attendantCare !== "object") {
    throw new RangeError(`${PREFIX}: attendantCare 객체가 필요합니다.`);
  }
  const past = attendantCare.past ?? [];
  const future = attendantCare.future ?? [];
  if (!Array.isArray(past) || !Array.isArray(future)) {
    throw new RangeError(`${PREFIX}: attendantCare.past / future 는 배열이어야 합니다.`);
  }
  if (past.length + future.length > MAX_ITEMS) {
    throw new RangeError(`${PREFIX}: 개호비 항목 합계는 ${MAX_ITEMS}건 이하여야 합니다.`);
  }
  past.forEach(validateAttendantPast);
  future.forEach((item, i) => validateAttendantFuture(item, i, accidentDate));
}

function validateTreatmentPast(item: TreatmentPastInput, i: number, group: string): void {
  if (item === null || typeof item !== "object") {
    throw new RangeError(`${PREFIX}: ${group}.past[${i}] 객체가 필요합니다.`);
  }
  assertNonNegativeInteger(`${group}.past[${i}].costWon`, item.costWon);
  if (item.priorRatio !== undefined) {
    assertRatio(`${group}.past[${i}].priorRatio`, item.priorRatio);
  }
}

function validateFutureItem(
  item: TreatmentFutureInput,
  i: number,
  group: string,
  accidentDate?: IsoDate,
): void {
  if (item === null || typeof item !== "object") {
    throw new RangeError(`${PREFIX}: ${group}[${i}] 객체가 필요합니다.`);
  }
  assertNonNegativeInteger(`${group}[${i}].costWon`, item.costWon);
  if (item.kind !== "oneTime" && item.kind !== "recurring") {
    throw new RangeError(
      `${PREFIX}: ${group}[${i}].kind 는 "oneTime" 또는 "recurring" 이어야 합니다.`,
    );
  }
  assertIsoDate(`${group}[${i}].firstDate`, item.firstDate);
  assertIsoDate(`${group}[${i}].lastDate`, item.lastDate);
  if (accidentDate !== undefined && item.firstDate < accidentDate) {
    throw new RangeError(
      `${PREFIX}: ${group}[${i}].firstDate 는 사고일(${accidentDate}) 이상이어야 합니다.`,
    );
  }
  if (item.lastDate < item.firstDate) {
    throw new RangeError(`${PREFIX}: ${group}[${i}].lastDate 는 firstDate 이상이어야 합니다.`);
  }
  if (item.kind === "recurring") {
    if (
      typeof item.lifespanMonths !== "number" ||
      !Number.isInteger(item.lifespanMonths) ||
      item.lifespanMonths < 1
    ) {
      throw new RangeError(
        `${PREFIX}: ${group}[${i}].lifespanMonths 는 반복(recurring) 시 양의 정수여야 합니다.`,
      );
    }
  }
  if (item.priorRatio !== undefined) {
    assertRatio(`${group}[${i}].priorRatio`, item.priorRatio);
  }
}

function validateTreatment(treatment: TreatmentInput, accidentDate?: IsoDate): void {
  if (treatment === null || typeof treatment !== "object") {
    throw new RangeError(`${PREFIX}: treatment 객체가 필요합니다.`);
  }
  const past = treatment.past ?? [];
  const future = treatment.future ?? [];
  if (!Array.isArray(past) || !Array.isArray(future)) {
    throw new RangeError(`${PREFIX}: treatment.past / future 는 배열이어야 합니다.`);
  }
  if (past.length + future.length > MAX_ITEMS) {
    throw new RangeError(`${PREFIX}: 치료비 항목 합계는 ${MAX_ITEMS}건 이하여야 합니다.`);
  }
  past.forEach((item, i) => validateTreatmentPast(item, i, "treatment"));
  future.forEach((item, i) => validateFutureItem(item, i, "treatment.future", accidentDate));
}

function validateAppliance(appliance: TreatmentFutureInput[], accidentDate?: IsoDate): void {
  if (!Array.isArray(appliance)) {
    throw new RangeError(`${PREFIX}: appliance 는 배열이어야 합니다.`);
  }
  if (appliance.length > MAX_ITEMS) {
    throw new RangeError(`${PREFIX}: 보조구 항목은 ${MAX_ITEMS}건 이하여야 합니다.`);
  }
  appliance.forEach((item, i) => validateFutureItem(item, i, "appliance", accidentDate));
}

/**
 * 기타손해 입력 검증. `accidentDate` 를 주면 향후 항목의 필요일이 사고일 이상인지도 검증한다
 * (compute / 도메인 validator 가 사고일을 주입). 미지정 시 날짜 하한 검사는 생략한다.
 */
export function validateOtherDamagesInput(input: OtherDamagesInput, accidentDate?: IsoDate): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  if (input.attendantCare !== undefined) {
    validateAttendantCare(input.attendantCare, accidentDate);
  }
  if (input.treatment !== undefined) {
    validateTreatment(input.treatment, accidentDate);
  }
  if (input.appliance !== undefined) {
    validateAppliance(input.appliance, accidentDate);
  }
}
