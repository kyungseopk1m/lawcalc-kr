import type {
  CompensationBaseInput,
  CompensationDeductionsInput,
  CompensationInput,
  CompensationLossRateInput,
  CompensationLostIncomeInput,
  PermanentDisabilityInput,
  TemporaryDisabilityInput,
} from "./types";
import { validateOtherDamagesInput } from "../other-damages/validators";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEDUCTION_ITEMS = 50;
const MAX_DISABILITY_ITEMS = 20;
const PREFIX = "손해배상 입력 검증 실패";

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
    throw new RangeError(`${PREFIX}: ${label} 는 YYYY-MM-DD 형식의 유효한 날짜여야 합니다.`);
  }
}

function assertRatio(label: string, value: unknown, max = 1): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
    throw new RangeError(`${PREFIX}: ${label} 는 0 이상 ${max} 이하 실수여야 합니다.`);
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

function validateBase(base: CompensationBaseInput): void {
  if (base === null || typeof base !== "object") {
    throw new RangeError(`${PREFIX}: base 객체가 필요합니다.`);
  }
  assertIsoDate("base.birthDate", base.birthDate);
  assertIsoDate("base.accidentDate", base.accidentDate);
  assertIsoDate("base.treatmentEndDate", base.treatmentEndDate);
  if (base.accidentDate < base.birthDate) {
    throw new RangeError(`${PREFIX}: base.accidentDate 는 base.birthDate 이상이어야 합니다.`);
  }
  if (base.treatmentEndDate < base.accidentDate) {
    throw new RangeError(
      `${PREFIX}: base.treatmentEndDate 는 base.accidentDate 이상이어야 합니다.`,
    );
  }
  if (base.sex !== "male" && base.sex !== "female") {
    throw new RangeError(`${PREFIX}: base.sex 는 "male" 또는 "female" 여야 합니다.`);
  }
  if (base.retirementAge !== undefined) {
    if (
      typeof base.retirementAge !== "number" ||
      !Number.isInteger(base.retirementAge) ||
      base.retirementAge < 1 ||
      base.retirementAge > 120
    ) {
      throw new RangeError(`${PREFIX}: base.retirementAge 는 1~120 정수여야 합니다.`);
    }
  }
}

function validatePermanent(items: PermanentDisabilityInput[]): void {
  if (items.length > MAX_DISABILITY_ITEMS) {
    throw new RangeError(
      `${PREFIX}: lossRate.permanent 는 ${MAX_DISABILITY_ITEMS}건 이하여야 합니다.`,
    );
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as PermanentDisabilityInput;
    if (item === null || typeof item !== "object") {
      throw new RangeError(`${PREFIX}: lossRate.permanent[${i}] 객체가 필요합니다.`);
    }
    if (typeof item.ratio !== "number" || !Number.isFinite(item.ratio)) {
      throw new RangeError(`${PREFIX}: lossRate.permanent[${i}].ratio 는 실수여야 합니다.`);
    }
    if (item.ratio <= 0 || item.ratio > 1) {
      throw new RangeError(
        `${PREFIX}: lossRate.permanent[${i}].ratio 는 0 초과 1 이하 실수여야 합니다.`,
      );
    }
  }
}

function validateTemporary(items: TemporaryDisabilityInput[]): void {
  if (items.length > MAX_DISABILITY_ITEMS) {
    throw new RangeError(
      `${PREFIX}: lossRate.temporary 는 ${MAX_DISABILITY_ITEMS}건 이하여야 합니다.`,
    );
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as TemporaryDisabilityInput;
    if (item === null || typeof item !== "object") {
      throw new RangeError(`${PREFIX}: lossRate.temporary[${i}] 객체가 필요합니다.`);
    }
    if (typeof item.ratio !== "number" || !Number.isFinite(item.ratio)) {
      throw new RangeError(`${PREFIX}: lossRate.temporary[${i}].ratio 는 실수여야 합니다.`);
    }
    if (item.ratio <= 0 || item.ratio > 1) {
      throw new RangeError(
        `${PREFIX}: lossRate.temporary[${i}].ratio 는 0 초과 1 이하 실수여야 합니다.`,
      );
    }
    assertPositiveNumber(`lossRate.temporary[${i}].years`, item.years);
  }
}

function validateLossRate(lossRate: CompensationLossRateInput): void {
  if (lossRate === null || typeof lossRate !== "object") {
    throw new RangeError(`${PREFIX}: lossRate 객체가 필요합니다.`);
  }
  const permanent = lossRate.permanent ?? [];
  const temporary = lossRate.temporary ?? [];
  if (!Array.isArray(permanent)) {
    throw new RangeError(`${PREFIX}: lossRate.permanent 는 배열이어야 합니다.`);
  }
  if (!Array.isArray(temporary)) {
    throw new RangeError(`${PREFIX}: lossRate.temporary 는 배열이어야 합니다.`);
  }
  validatePermanent(permanent);
  validateTemporary(temporary);
  if (lossRate.priorImpairmentRatio !== undefined) {
    assertRatio("lossRate.priorImpairmentRatio", lossRate.priorImpairmentRatio);
  }
}

function validateLostIncome(lostIncome: CompensationLostIncomeInput): void {
  if (lostIncome === null || typeof lostIncome !== "object") {
    throw new RangeError(`${PREFIX}: lostIncome 객체가 필요합니다.`);
  }
  const hasOccupation =
    typeof lostIncome.occupation === "string" && lostIncome.occupation.length > 0;
  const hasDirectWage = lostIncome.directWageWon !== undefined;
  if (!hasOccupation && !hasDirectWage) {
    throw new RangeError(
      `${PREFIX}: lostIncome.occupation 또는 lostIncome.directWageWon 중 하나는 필요합니다.`,
    );
  }
  if (hasDirectWage) {
    assertNonNegativeInteger("lostIncome.directWageWon", lostIncome.directWageWon);
    if ((lostIncome.directWageWon as number) === 0) {
      throw new RangeError(`${PREFIX}: lostIncome.directWageWon 는 양의 정수여야 합니다.`);
    }
  }
  if (lostIncome.discountMethod !== undefined && lostIncome.discountMethod !== "hoffman") {
    throw new RangeError(
      `${PREFIX}: lostIncome.discountMethod 는 v0.5.0 에서 "hoffman" 만 지원합니다.`,
    );
  }
  if (lostIncome.workingDaysPerMonth !== undefined) {
    if (
      typeof lostIncome.workingDaysPerMonth !== "number" ||
      !Number.isInteger(lostIncome.workingDaysPerMonth) ||
      lostIncome.workingDaysPerMonth < 1 ||
      lostIncome.workingDaysPerMonth > 31
    ) {
      throw new RangeError(`${PREFIX}: lostIncome.workingDaysPerMonth 는 1~31 정수여야 합니다.`);
    }
  }
}

function validateDeductions(deductions: CompensationDeductionsInput): void {
  if (deductions === null || typeof deductions !== "object") {
    throw new RangeError(`${PREFIX}: deductions 객체가 필요합니다.`);
  }
  const ratio = deductions.ratio ?? [];
  const absolute = deductions.absolute ?? [];
  if (!Array.isArray(ratio)) {
    throw new RangeError(`${PREFIX}: deductions.ratio 는 배열이어야 합니다.`);
  }
  if (!Array.isArray(absolute)) {
    throw new RangeError(`${PREFIX}: deductions.absolute 는 배열이어야 합니다.`);
  }
  if (ratio.length + absolute.length > MAX_DEDUCTION_ITEMS) {
    throw new RangeError(`${PREFIX}: 공제 항목 합계는 ${MAX_DEDUCTION_ITEMS}건 이하여야 합니다.`);
  }
  for (let i = 0; i < ratio.length; i++) {
    const item = ratio[i]!;
    assertRatio(`deductions.ratio[${i}].ratio`, item.ratio);
  }
  for (let i = 0; i < absolute.length; i++) {
    const item = absolute[i]!;
    assertNonNegativeInteger(`deductions.absolute[${i}].amount`, item.amount);
  }
}

/**
 * `validateCompensationInput` 은 본 도메인 진입 단계의 입력 검증을 단일 surface 로 모은다.
 * 실패 시 `RangeError` 를 던지며, throw 메시지는 PDF / CSV / 클립보드 export 에도 노출 가능한 한국어다.
 */
export function validateCompensationInput(input: CompensationInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  const accidentType = input.accidentType ?? "auto";
  if (accidentType !== "auto" && accidentType !== "industrial") {
    throw new RangeError(`${PREFIX}: accidentType 는 "auto" 또는 "industrial" 여야 합니다.`);
  }
  validateBase(input.base);
  validateLossRate(input.lossRate);
  validateLostIncome(input.lostIncome);
  if (input.solatiumWon !== undefined) {
    assertNonNegativeInteger("solatiumWon", input.solatiumWon);
  }
  if (input.faultRatio !== undefined) {
    assertRatio("faultRatio", input.faultRatio);
  }
  if (input.deductions !== undefined) {
    validateDeductions(input.deductions);
  }
  if (input.industrialInsurance !== undefined) {
    if (input.industrialInsurance === null || typeof input.industrialInsurance !== "object") {
      throw new RangeError(`${PREFIX}: industrialInsurance 객체가 필요합니다.`);
    }
    if (accidentType !== "industrial") {
      throw new RangeError(
        `${PREFIX}: industrialInsurance 는 accidentType 가 "industrial" 일 때만 지정할 수 있습니다.`,
      );
    }
    if (input.industrialInsurance.disabilityBenefitWon !== undefined) {
      assertNonNegativeInteger(
        "industrialInsurance.disabilityBenefitWon",
        input.industrialInsurance.disabilityBenefitWon,
      );
    }
  }
  if (input.otherDamages !== undefined) {
    validateOtherDamagesInput(input.otherDamages, input.base.accidentDate);
  }
}
