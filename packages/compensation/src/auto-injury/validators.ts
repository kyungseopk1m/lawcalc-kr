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
import { validateLifeExpectancyInput } from "../life-expectancy/validators";
import { validateLostRetirementInput } from "../lost-retirement/validators";
import { monthsBetween } from "../internal";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEDUCTION_ITEMS = 50;
const MAX_DISABILITY_ITEMS = 20;
const MAX_FAMILY_CLAIMANTS = 20;
const MAX_WAGE_SCHEDULE_ROWS = 600;
const MAX_MANUAL_ROW_MONTH = 1440;
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
  if (base.calculationDate !== undefined) {
    assertIsoDate("base.calculationDate", base.calculationDate);
    if (base.calculationDate < base.accidentDate) {
      throw new RangeError(
        `${PREFIX}: base.calculationDate 는 base.accidentDate 이상이어야 합니다.`,
      );
    }
  }
  if (
    base.laborRateEffectiveRule !== undefined &&
    base.laborRateEffectiveRule !== "published" &&
    base.laborRateEffectiveRule !== "survey"
  ) {
    throw new RangeError(
      `${PREFIX}: base.laborRateEffectiveRule 는 "published" 또는 "survey" 여야 합니다.`,
    );
  }
  if (base.courtTruncation !== undefined && typeof base.courtTruncation !== "boolean") {
    throw new RangeError(`${PREFIX}: base.courtTruncation 은 boolean 이어야 합니다.`);
  }
  if (base.truncateEachStep !== undefined && typeof base.truncateEachStep !== "boolean") {
    throw new RangeError(`${PREFIX}: base.truncateEachStep 은 boolean 이어야 합니다.`);
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
    // segment 분해는 한시기간을 개월(반올림)로 환산한다. 0개월로 떨어지면 그 항목이
    // 경계 목록에서 걸러져 아무 경고 없이 사라진다. 계산 결과에 반영될 수 없는 입력은
    // 조용히 무시하지 말고 거부한다.
    if (Math.round(item.years * 12) < 1) {
      throw new RangeError(
        `${PREFIX}: lossRate.temporary[${i}].years 는 한 달 이상이어야 합니다 (입력: ${item.years}년 = 약 ${(item.years * 12).toFixed(2)}개월).`,
      );
    }
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
  if (
    lossRate.hospitalizationFullLoss !== undefined &&
    typeof lossRate.hospitalizationFullLoss !== "boolean"
  ) {
    throw new RangeError(`${PREFIX}: lossRate.hospitalizationFullLoss 는 boolean 이어야 합니다.`);
  }
}

/**
 * 호봉승급 일정(`incomeSteps`)·직접 편집 행(`manualRows`) 검증. 부상·사망 공용 (`prefix` 로 메시지 구분).
 * 반환값: 월소득 입력이 사고일부터 덮어 직종·일당 입력이 없어도 되는지.
 */
export function validateWageSchedule(
  lostIncome: CompensationLostIncomeInput,
  accidentDate: string,
  prefix: string,
): boolean {
  const won = (label: string, value: unknown) => {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${prefix}: ${label} 는 0 이상 정수여야 합니다.`);
    }
  };
  const list = (label: string, value: unknown): unknown[] => {
    if (!Array.isArray(value) || value.length === 0 || value.length > MAX_WAGE_SCHEDULE_ROWS) {
      throw new RangeError(
        `${prefix}: ${label} 는 1~${MAX_WAGE_SCHEDULE_ROWS}건 배열이어야 합니다.`,
      );
    }
    return value;
  };
  if (lostIncome.manualRows !== undefined) {
    let prevEnd = 0;
    list("lostIncome.manualRows", lostIncome.manualRows).forEach((raw, i) => {
      const label = `lostIncome.manualRows[${i}]`;
      const row = raw as Record<string, unknown>;
      if (row === null || typeof row !== "object") {
        throw new RangeError(`${prefix}: ${label} 객체가 필요합니다.`);
      }
      const { startMonth, endMonth } = row;
      if (
        !Number.isInteger(startMonth) ||
        !Number.isInteger(endMonth) ||
        (startMonth as number) < prevEnd ||
        (endMonth as number) <= (startMonth as number) ||
        (endMonth as number) > MAX_MANUAL_ROW_MONTH
      ) {
        throw new RangeError(
          `${prefix}: ${label} 의 월수는 앞 행 끝 이상에서 시작해 시작보다 큰 ${MAX_MANUAL_ROW_MONTH} 이하 정수로 끝나야 합니다.`,
        );
      }
      prevEnd = endMonth as number;
      won(`${label}.monthlyWageWon`, row.monthlyWageWon);
      const { lossRate } = row;
      if (
        typeof lossRate !== "number" ||
        !Number.isFinite(lossRate) ||
        lossRate < 0 ||
        lossRate > 1
      ) {
        throw new RangeError(`${prefix}: ${label}.lossRate 는 0 이상 1 이하 실수여야 합니다.`);
      }
      if (typeof row.livingCostDeducted !== "boolean") {
        throw new RangeError(`${prefix}: ${label}.livingCostDeducted 는 boolean 이어야 합니다.`);
      }
    });
  }
  if (lostIncome.incomeSteps === undefined) return lostIncome.manualRows !== undefined;
  let prevDate = accidentDate;
  list("lostIncome.incomeSteps", lostIncome.incomeSteps).forEach((raw, i) => {
    const label = `lostIncome.incomeSteps[${i}]`;
    const step = raw as Record<string, unknown>;
    if (step === null || typeof step !== "object") {
      throw new RangeError(`${prefix}: ${label} 객체가 필요합니다.`);
    }
    const { fromDate } = step;
    if (
      typeof fromDate !== "string" ||
      !ISO_DATE_PATTERN.test(fromDate) ||
      new Date(Date.parse(`${fromDate}T00:00:00Z`) || 0).toISOString().slice(0, 10) !== fromDate ||
      fromDate < prevDate ||
      (i > 0 && fromDate === prevDate)
    ) {
      throw new RangeError(
        `${prefix}: ${label}.fromDate 는 사고일 이상, 앞 항목보다 늦은 YYYY-MM-DD 날짜여야 합니다.`,
      );
    }
    prevDate = fromDate;
    won(`${label}.monthlyWageWon`, step.monthlyWageWon);
  });
  const first = lostIncome.incomeSteps[0] as { fromDate: string };
  return lostIncome.manualRows !== undefined || monthsBetween(accidentDate, first.fromDate) === 0;
}

function validateLostIncome(lostIncome: CompensationLostIncomeInput, accidentDate: string): void {
  if (lostIncome === null || typeof lostIncome !== "object") {
    throw new RangeError(`${PREFIX}: lostIncome 객체가 필요합니다.`);
  }
  const coversStart = validateWageSchedule(lostIncome, accidentDate, PREFIX);
  const hasOccupation =
    typeof lostIncome.occupation === "string" && lostIncome.occupation.length > 0;
  const hasDirectWage = lostIncome.directWageWon !== undefined;
  if (!hasOccupation && !hasDirectWage && !coversStart) {
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
  const lists = {
    ratio: deductions.ratio ?? [],
    paidTreatment: deductions.paidTreatment ?? [],
    absolute: deductions.absolute ?? [],
    legacyRatio: deductions.legacyRatio ?? [],
  };
  let count = 0;
  for (const [key, list] of Object.entries(lists)) {
    if (!Array.isArray(list)) {
      throw new RangeError(`${PREFIX}: deductions.${key} 는 배열이어야 합니다.`);
    }
    count += list.length;
  }
  if (count > MAX_DEDUCTION_ITEMS) {
    throw new RangeError(`${PREFIX}: 공제 항목 합계는 ${MAX_DEDUCTION_ITEMS}건 이하여야 합니다.`);
  }
  lists.ratio.forEach((item, i) => {
    if ("ratio" in item && !("amount" in item)) {
      throw new RangeError(
        `${PREFIX}: deductions.ratio[${i}] 는 금액(amount) 항목입니다. 구 비율(ratio) 공제는 deductions.legacyRatio 로 옮겨 주세요.`,
      );
    }
    assertNonNegativeInteger(`deductions.ratio[${i}].amount`, item.amount);
  });
  lists.paidTreatment.forEach((item, i) =>
    assertNonNegativeInteger(`deductions.paidTreatment[${i}].amount`, item.amount),
  );
  lists.absolute.forEach((item, i) =>
    assertNonNegativeInteger(`deductions.absolute[${i}].amount`, item.amount),
  );
  lists.legacyRatio.forEach((item, i) =>
    assertRatio(`deductions.legacyRatio[${i}].ratio`, item.ratio),
  );
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
  validateLostIncome(input.lostIncome, input.base.accidentDate);
  if (input.solatiumWon !== undefined) {
    assertNonNegativeInteger("solatiumWon", input.solatiumWon);
  }
  if (input.faultRatio !== undefined) {
    assertRatio("faultRatio", input.faultRatio);
  }
  if (input.applyFaultToSolatium !== undefined && typeof input.applyFaultToSolatium !== "boolean") {
    throw new RangeError(`${PREFIX}: applyFaultToSolatium 은 boolean 이어야 합니다.`);
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
  if (input.lifeExpectancy !== undefined) {
    if (input.lifeExpectancy === null || typeof input.lifeExpectancy !== "object") {
      throw new RangeError(`${PREFIX}: lifeExpectancy 객체가 필요합니다.`);
    }
    validateLifeExpectancyInput({
      ...input.lifeExpectancy,
      sex: input.base.sex,
      birthDate: input.base.birthDate,
      accidentDate: input.base.accidentDate,
    });
  }
  if (input.lostRetirement !== undefined) {
    validateLostRetirementInput(input.lostRetirement, input.base.accidentDate);
  }
  if (input.claimants !== undefined) {
    const claimants = input.claimants;
    if (claimants === null || typeof claimants !== "object") {
      throw new RangeError(`${PREFIX}: claimants 객체가 필요합니다.`);
    }
    const family = claimants.family ?? [];
    if (!Array.isArray(family) || family.length > MAX_FAMILY_CLAIMANTS) {
      throw new RangeError(
        `${PREFIX}: claimants.family 는 ${MAX_FAMILY_CLAIMANTS}명 이하 배열이어야 합니다.`,
      );
    }
    family.forEach((f, i) => {
      if (f === null || typeof f !== "object" || typeof f.name !== "string") {
        throw new RangeError(`${PREFIX}: claimants.family[${i}].name 은 문자열이어야 합니다.`);
      }
      assertNonNegativeInteger(`claimants.family[${i}].solatiumWon`, f.solatiumWon);
    });
    if (
      claimants.finalRounding !== undefined &&
      claimants.finalRounding !== "won" &&
      claimants.finalRounding !== "hundred"
    ) {
      throw new RangeError(
        `${PREFIX}: claimants.finalRounding 은 "won" 또는 "hundred" 여야 합니다.`,
      );
    }
  }
}
