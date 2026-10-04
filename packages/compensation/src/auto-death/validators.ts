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
import { validateOtherDamagesInput } from "../other-damages/validators";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEDUCTION_ITEMS = 50;
const MAX_RECIPIENTS = 20;
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
  const accidentType = input.accidentType ?? "auto";
  if (accidentType !== "auto" && accidentType !== "industrial") {
    throw new RangeError(`${PREFIX}: accidentType 는 "auto" 또는 "industrial" 여야 합니다.`);
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
    if (input.industrialInsurance.survivorBenefitWon !== undefined) {
      assertNonNegativeInteger(
        "industrialInsurance.survivorBenefitWon",
        input.industrialInsurance.survivorBenefitWon,
      );
    }
    const recipients = input.industrialInsurance.recipients;
    if (recipients !== undefined) {
      if (!Array.isArray(recipients) || recipients.length > MAX_RECIPIENTS) {
        throw new RangeError(
          `${PREFIX}: industrialInsurance.recipients 는 ${MAX_RECIPIENTS}개 이하 배열이어야 합니다.`,
        );
      }
      if (input.industrialInsurance.survivorBenefitWon !== undefined) {
        throw new RangeError(
          `${PREFIX}: industrialInsurance 는 survivorBenefitWon 과 recipients 를 함께 지정할 수 없습니다.`,
        );
      }
      if (input.heirs === undefined) {
        throw new RangeError(
          `${PREFIX}: industrialInsurance.recipients 는 heirs 가 있어야 상속인별로 공제할 수 있습니다.`,
        );
      }
      // 수급권자는 상속인 이름으로 매칭하므로 이름이 겹치면 같은 유족급여를 두 번 공제하게 된다.
      const names = calculateInheritance(input.heirs).shares.map((share) => share.name);
      if (new Set(names).size !== names.length) {
        throw new RangeError(
          `${PREFIX}: industrialInsurance.recipients 를 쓰려면 상속인 이름이 서로 달라야 합니다.`,
        );
      }
      recipients.forEach((r, i) => {
        if (r === null || typeof r !== "object") {
          throw new RangeError(
            `${PREFIX}: industrialInsurance.recipients[${i}] 객체가 필요합니다.`,
          );
        }
        if (r.heirName !== undefined && typeof r.heirName !== "string") {
          throw new RangeError(
            `${PREFIX}: industrialInsurance.recipients[${i}].heirName 은 문자열이어야 합니다.`,
          );
        }
        if (r.heirName !== undefined && !names.includes(r.heirName)) {
          throw new RangeError(
            `${PREFIX}: 유족급여 수급권자 ${i + 1}번째 "${r.heirName}" 는 상속인 목록에 없는 이름입니다. 상속인이 아닌 수급권자는 이름을 비워 두세요.`,
          );
        }
        assertNonNegativeInteger(
          `industrialInsurance.recipients[${i}].survivorBenefitWon`,
          r.survivorBenefitWon,
        );
      });
    }
  }
  if (input.otherDamages !== undefined) {
    validateOtherDamagesInput(input.otherDamages, input.base.accidentDate);
  }
  if (input.heirs !== undefined) {
    validateHeirs(input.heirs);
  }
}
