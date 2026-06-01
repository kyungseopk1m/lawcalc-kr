import { calculateInheritance } from "@lawcalc-kr/core-engine";
import type {
  CompensationDeathBaseInput,
  CompensationAutoDeathInput,
  CompensationHeirsInput,
} from "./types";
import type {
  CompensationDeductionsInput,
  CompensationLostIncomeInput,
} from "../auto-injury/types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEDUCTION_ITEMS = 50;
const PREFIX = "사망 손해배상 입력 검증 실패";

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

function validateBase(base: CompensationDeathBaseInput): void {
  if (base === null || typeof base !== "object") {
    throw new RangeError(`${PREFIX}: base 객체가 필요합니다.`);
  }
  assertIsoDate("base.birthDate", base.birthDate);
  assertIsoDate("base.accidentDate", base.accidentDate);
  if (base.accidentDate < base.birthDate) {
    throw new RangeError(`${PREFIX}: base.accidentDate 는 base.birthDate 이상이어야 합니다.`);
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
      `${PREFIX}: lostIncome.discountMethod 는 v0.6.0 에서 "hoffman" 만 지원합니다.`,
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
 * 상속인 입력 선행 검증.
 *
 * inheritance 엔진에 위임해 1991-01-01 cutoff / 2차 대습 / 직계존속·방계 대습 거부 등의
 * `RangeError` 를 그대로 전파한다. compute 단계에서 같은 결과를 재사용하지 않고 검증만 한다
 * (입력 검증 surface 단일화).
 */
function validateHeirs(heirs: CompensationHeirsInput): void {
  if (heirs === null || typeof heirs !== "object") {
    throw new RangeError(`${PREFIX}: heirs 객체가 필요합니다.`);
  }
  // inheritance 엔진의 검증(1991 cutoff·대습 제약 등)을 그대로 전파한다.
  calculateInheritance(heirs);
}

/**
 * `validateCompensationDeathInput` 은 자×사망 도메인 진입 단계의 입력 검증을 단일 surface 로 모은다.
 * 실패 시 `RangeError` 를 던지며, throw 메시지는 PDF / CSV / 클립보드 export 에도 노출 가능한 한국어다.
 */
export function validateCompensationDeathInput(input: CompensationAutoDeathInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  if (input.mode !== "death") {
    throw new RangeError(`${PREFIX}: mode 는 "death" 여야 합니다.`);
  }
  validateBase(input.base);
  validateLostIncome(input.lostIncome);
  if (input.livingCostDeductionRatio !== undefined) {
    assertRatio("livingCostDeductionRatio", input.livingCostDeductionRatio);
  }
  if (input.funeralExpenseWon !== undefined) {
    assertNonNegativeInteger("funeralExpenseWon", input.funeralExpenseWon);
  }
  if (input.solatiumWon !== undefined) {
    assertNonNegativeInteger("solatiumWon", input.solatiumWon);
  }
  if (input.faultRatio !== undefined) {
    assertRatio("faultRatio", input.faultRatio);
  }
  if (input.deductions !== undefined) {
    validateDeductions(input.deductions);
  }
  if (input.heirs !== undefined) {
    validateHeirs(input.heirs);
  }
}
