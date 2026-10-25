import { calculateInheritance } from "@lawcalc-kr/core-engine";
import type {
  CompensationDeathBaseInput,
  CompensationAutoDeathInput,
  CompensationDeathClaimantsInput,
  CompensationHeirsInput,
} from "./types";
import type {
  CompensationDeductionsInput,
  CompensationLostIncomeInput,
} from "../auto-injury/types";
import { validateOtherDamagesInput } from "../other-damages/validators";
import { validateLifeExpectancyInput } from "../life-expectancy/validators";
import { validateLostRetirementInput } from "../lost-retirement/validators";
import { validateWageSchedule } from "../auto-injury/validators";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DEDUCTION_ITEMS = 50;
const MAX_RECIPIENTS = 20;
const MAX_CLAIMANT_ITEMS = 20;
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

/** 상속인 이름 목록. 원고별 입력은 이름으로 매칭하므로 이름이 겹치면 같은 금액을 두 번 반영하게 된다. */
function uniqueHeirNames(heirs: CompensationHeirsInput | undefined, label: string): string[] {
  if (heirs === undefined) {
    throw new RangeError(`${PREFIX}: ${label} 는 heirs 가 있어야 상속인별로 계산할 수 있습니다.`);
  }
  const names = calculateInheritance(heirs).shares.map((share) => share.name);
  if (new Set(names).size !== names.length) {
    throw new RangeError(`${PREFIX}: ${label} 를 쓰려면 상속인 이름이 서로 달라야 합니다.`);
  }
  return names;
}

function validateClaimants(
  claimants: CompensationDeathClaimantsInput,
  heirs: CompensationHeirsInput | undefined,
): void {
  if (claimants === null || typeof claimants !== "object") {
    throw new RangeError(`${PREFIX}: claimants 객체가 필요합니다.`);
  }
  const names = uniqueHeirNames(heirs, "claimants");
  const ownSolatium = claimants.ownSolatium ?? [];
  if (!Array.isArray(ownSolatium) || ownSolatium.length > MAX_CLAIMANT_ITEMS) {
    throw new RangeError(
      `${PREFIX}: claimants.ownSolatium 은 ${MAX_CLAIMANT_ITEMS}개 이하 배열이어야 합니다.`,
    );
  }
  ownSolatium.forEach((item, i) => {
    if (item === null || typeof item !== "object" || !names.includes(item.heirName)) {
      throw new RangeError(
        `${PREFIX}: claimants.ownSolatium[${i}].heirName 은 상속인 목록에 있는 이름이어야 합니다.`,
      );
    }
    assertNonNegativeInteger(`claimants.ownSolatium[${i}].solatiumWon`, item.solatiumWon);
  });
  const otherClaimants = claimants.otherClaimants ?? [];
  if (!Array.isArray(otherClaimants) || otherClaimants.length > MAX_CLAIMANT_ITEMS) {
    throw new RangeError(
      `${PREFIX}: claimants.otherClaimants 는 ${MAX_CLAIMANT_ITEMS}명 이하 배열이어야 합니다.`,
    );
  }
  // 앞뒤 공백만 다른 이름은 같은 사람으로 본다.
  const trimmedHeirNames = names.map((n) => n.trim());
  const otherNames: string[] = [];
  otherClaimants.forEach((item, i) => {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.name !== "string" ||
      item.name.trim() === ""
    ) {
      throw new RangeError(
        `${PREFIX}: claimants.otherClaimants[${i}].name 은 비어 있지 않은 문자열이어야 합니다.`,
      );
    }
    const name = item.name.trim();
    if (trimmedHeirNames.includes(name)) {
      throw new RangeError(
        `${PREFIX}: claimants.otherClaimants[${i}].name "${item.name}" 는 상속인 이름과 같습니다. 상속인의 위자료는 고유 위자료(ownSolatium)로 입력해 주세요.`,
      );
    }
    if (otherNames.includes(name)) {
      throw new RangeError(
        `${PREFIX}: claimants.otherClaimants[${i}].name "${item.name}" 가 중복되었습니다.`,
      );
    }
    otherNames.push(name);
    assertNonNegativeInteger(`claimants.otherClaimants[${i}].solatiumWon`, item.solatiumWon);
  });
  if (claimants.funeralPayer !== undefined && !names.includes(claimants.funeralPayer)) {
    throw new RangeError(
      `${PREFIX}: claimants.funeralPayer "${String(claimants.funeralPayer)}" 는 상속인 목록에 없는 이름입니다.`,
    );
  }
  if (
    claimants.finalRounding !== undefined &&
    claimants.finalRounding !== "won" &&
    claimants.finalRounding !== "hundred"
  ) {
    throw new RangeError(`${PREFIX}: claimants.finalRounding 은 "won" 또는 "hundred" 여야 합니다.`);
  }
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
  validateLostIncome(input.lostIncome, input.base.accidentDate);
  if (input.livingCostDeductionRatio !== undefined) {
    assertRatio("livingCostDeductionRatio", input.livingCostDeductionRatio);
    // 법원 예시 절사는 생계비 비율을 정확한 분수로 쓴다: 1/3 이거나 소수 6자리까지.
    const r = input.livingCostDeductionRatio;
    if (
      input.base.courtTruncation === true &&
      Math.abs(r - 1 / 3) >= 1e-12 &&
      Math.abs(r * 1e6 - Math.round(r * 1e6)) > 1e-6
    ) {
      throw new RangeError(
        `${PREFIX}: 법원 예시 절사에서 livingCostDeductionRatio 는 1/3 이거나 소수 여섯째 자리까지여야 합니다.`,
      );
    }
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
      const names = uniqueHeirNames(input.heirs, "industrialInsurance.recipients");
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
  if (input.industrialInsurance?.funeralBenefitWon !== undefined) {
    assertNonNegativeInteger(
      "industrialInsurance.funeralBenefitWon",
      input.industrialInsurance.funeralBenefitWon,
    );
    if (input.claimants?.funeralPayer === undefined) {
      throw new RangeError(
        `${PREFIX}: industrialInsurance.funeralBenefitWon 은 claimants.funeralPayer(장례비를 지출한 상속인)가 있어야 공제할 수 있습니다.`,
      );
    }
  }
  if (input.claimants !== undefined) {
    validateClaimants(input.claimants, input.heirs);
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
    // 사망은 상실률 100 으로 계산하지만 (입력 lossRatePercent 무시), 잘못된 값이 조용히
    // 저장되지 않도록 입력 그대로 검증한다.
    validateLostRetirementInput(input.lostRetirement, input.base.accidentDate);
  }
  if (input.otherDamages !== undefined) {
    validateOtherDamagesInput(input.otherDamages, input.base.accidentDate);
  }
  if (input.heirs !== undefined) {
    validateHeirs(input.heirs);
  }
}
