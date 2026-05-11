/**
 * litigation-cost 도메인 input 검증.
 *
 * 각 sub-domain 별 RangeError prefix:
 *   - `"인지대 입력 검증 실패: <inner>"` — validateStampDutyInput
 *   - `"송달료 입력 검증 실패: <inner>"` — validateDeliveryFeeInput
 *   - `"변호사보수 입력 검증 실패: <inner>"` — validateLawyerFeeInput
 *
 * KLAC 적용 사건 범위 검증은 RangeError 비차단 — `KlacScopeWarning[]` 반환 (G5 §3.3).
 */

import {
  appliedDomains,
  caseNameKo,
  isCaseType,
  isCivilOrFamily,
  LAWYER_FEE_MULTIPLIER_MAX,
  LAWYER_FEE_MULTIPLIER_MIN,
} from "./helpers";
import type {
  AppealsLevel,
  CaseType,
  DeliveryFeeInput,
  KlacScopeWarning,
  LawyerFeeDiscount,
  LawyerFeeInput,
  StampDutyInput,
} from "./types";

const APPEALS_LEVELS: readonly AppealsLevel[] = ["firstInstance", "appeal", "supreme"];

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function isFinitePositiveInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 1 && Number.isInteger(n);
}

function isFiniteNonNegativeInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

function fail(domain: string, message: string): never {
  throw new RangeError(`${domain} 입력 검증 실패: ${message}`);
}

function assertCaseTypeAppliesDomain(
  caseType: CaseType,
  domain: "stampDuty" | "deliveryFee" | "lawyerFee",
  prefix: string,
): void {
  if (!appliedDomains(caseType).includes(domain)) {
    fail(prefix, `사건구분 "${caseNameKo(caseType)}" 은 본 도메인에 적용되지 않습니다`);
  }
}

// ===== Stamp Duty =====

export function validateStampDutyInput(input: StampDutyInput): void {
  const prefix = "인지대";
  if (!isFiniteNonNegative(input.caseValue)) {
    fail(prefix, `소가가 유효하지 않습니다 (입력: ${String(input.caseValue)})`);
  }
  if (!isCaseType(input.caseType)) {
    fail(prefix, `사건구분이 유효하지 않습니다 (입력: ${String(input.caseType)})`);
  }
  assertCaseTypeAppliesDomain(input.caseType, "stampDuty", prefix);
  if (!APPEALS_LEVELS.includes(input.appealsLevel)) {
    fail(prefix, `심급이 유효하지 않습니다 (입력: ${String(input.appealsLevel)})`);
  }
  // 지급명령·화해는 1심 only — 인지법 제7조. 항소/상고 + 특별절차 동시 지정 거부.
  if ((input.isPaymentOrder || input.isSettlement) && input.appealsLevel !== "firstInstance") {
    fail(prefix, `지급명령·화해는 1심에서만 적용됩니다 (현재 심급: ${input.appealsLevel})`);
  }
  // 지급명령 + 화해 동시 지정 거부 — 상호 배타.
  if (input.isPaymentOrder && input.isSettlement) {
    fail(prefix, "지급명령과 화해는 동시에 적용할 수 없습니다");
  }
}

// ===== Delivery Fee =====

export function validateDeliveryFeeInput(input: DeliveryFeeInput): void {
  const prefix = "송달료";
  if (!isCaseType(input.caseType)) {
    fail(prefix, `사건구분이 유효하지 않습니다 (입력: ${String(input.caseType)})`);
  }
  assertCaseTypeAppliesDomain(input.caseType, "deliveryFee", prefix);
  if (!isFinitePositiveInt(input.partyCount)) {
    fail(
      prefix,
      `당사자수가 유효하지 않습니다 (입력: ${String(input.partyCount)}, 양의 정수만 허용)`,
    );
  }
  if (input.creditorCount !== undefined && !isFiniteNonNegativeInt(input.creditorCount)) {
    fail(
      prefix,
      `채권자수가 유효하지 않습니다 (입력: ${String(input.creditorCount)}, 0 이상 정수만 허용)`,
    );
  }
  if (input.customCount !== undefined && !isFinitePositiveInt(input.customCount)) {
    fail(
      prefix,
      `사용자 입력 송달 횟수가 유효하지 않습니다 (입력: ${String(input.customCount)}, 양의 정수만 허용)`,
    );
  }
  if (
    input.perDeliveryUnitPriceWon !== undefined &&
    !isFiniteNonNegative(input.perDeliveryUnitPriceWon)
  ) {
    fail(prefix, `회당 단가가 유효하지 않습니다 (입력: ${String(input.perDeliveryUnitPriceWon)})`);
  }
  if (input.filingDate !== undefined && !ISO_DATE_PATTERN.test(input.filingDate)) {
    fail(prefix, `접수일이 ISO 형식이 아닙니다 (입력: ${String(input.filingDate)})`);
  }
}

// ===== Lawyer Fee =====

function validateLawyerFeeDiscount(discount: LawyerFeeDiscount, prefix: string): void {
  switch (discount.kind) {
    case "noOralHearingOrAdmission":
      if (
        !["admission", "defaultAdmission", "noOralHearing", "orderForPerformance"].includes(
          discount.reason,
        )
      ) {
        fail(
          prefix,
          `noOralHearingOrAdmission reason 이 유효하지 않습니다 (입력: ${String(discount.reason)})`,
        );
      }
      return;
    case "provisionalCase":
      if (typeof discount.hasOralHearing !== "boolean") {
        fail(prefix, "provisionalCase.hasOralHearing 은 boolean 이어야 합니다");
      }
      return;
    case "klac":
      return;
    case "courtDiscretion":
      if (!Number.isFinite(discount.multiplier)) {
        fail(
          prefix,
          `courtDiscretion.multiplier 가 유효하지 않습니다 (입력: ${String(discount.multiplier)})`,
        );
      }
      if (
        discount.multiplier < LAWYER_FEE_MULTIPLIER_MIN ||
        discount.multiplier > LAWYER_FEE_MULTIPLIER_MAX
      ) {
        fail(
          prefix,
          `courtDiscretion.multiplier 는 ${LAWYER_FEE_MULTIPLIER_MIN} ~ ${LAWYER_FEE_MULTIPLIER_MAX} 범위여야 합니다 (입력: ${discount.multiplier})`,
        );
      }
      return;
    case "customPercent":
      if (!Number.isFinite(discount.rate)) {
        fail(prefix, `customPercent.rate 가 유효하지 않습니다 (입력: ${String(discount.rate)})`);
      }
      if (discount.rate < 0 || discount.rate > LAWYER_FEE_MULTIPLIER_MAX) {
        fail(
          prefix,
          `customPercent.rate 는 0 ~ ${LAWYER_FEE_MULTIPLIER_MAX} 범위여야 합니다 (입력: ${discount.rate})`,
        );
      }
      return;
  }
}

export function validateLawyerFeeInput(input: LawyerFeeInput): void {
  const prefix = "변호사보수";
  if (!isFiniteNonNegative(input.caseValue)) {
    fail(prefix, `소가가 유효하지 않습니다 (입력: ${String(input.caseValue)})`);
  }
  if (!isCaseType(input.caseType)) {
    fail(prefix, `사건구분이 유효하지 않습니다 (입력: ${String(input.caseType)})`);
  }
  assertCaseTypeAppliesDomain(input.caseType, "lawyerFee", prefix);
  if (!Array.isArray(input.discounts)) {
    fail(prefix, "discounts 는 배열이어야 합니다");
  }
  for (const d of input.discounts) {
    validateLawyerFeeDiscount(d, prefix);
  }
  if (input.klacAgreedFeeWon !== undefined && !isFiniteNonNegative(input.klacAgreedFeeWon)) {
    fail(prefix, `KLAC 약정보수액이 유효하지 않습니다 (입력: ${String(input.klacAgreedFeeWon)})`);
  }
  if (input.filingDate !== undefined && !ISO_DATE_PATTERN.test(input.filingDate)) {
    fail(prefix, `접수일이 ISO 형식이 아닙니다 (입력: ${String(input.filingDate)})`);
  }
}

// ===== KLAC scope (non-throwing) =====

/**
 * KLAC 적용 사건 범위 검증. G5 §3.3 권고 — RangeError 비차단, UI 측 경고 채널.
 *
 *   - `klacScopeNotCivilOrFamily`: 행정·보전·지급명령에 KLAC variant 적용 시
 *   - `klacScopeOverridden`: KLAC + 다른 multiplier 누적 시 이중 감액 risk
 *
 * 본 함수는 throw 하지 않음 — 호출자가 warnings 배열을 받아 UI 측 표시.
 */
export function validateKlacDiscountScope(
  caseType: CaseType,
  discounts: ReadonlyArray<LawyerFeeDiscount>,
): KlacScopeWarning[] {
  const warnings: KlacScopeWarning[] = [];
  const hasKlac = discounts.some((d) => d.kind === "klac");
  if (!hasKlac) {
    return warnings;
  }
  if (!isCivilOrFamily(caseType)) {
    warnings.push({
      caseType,
      reason: "klacScopeNotCivilOrFamily",
      messageKo: `KLAC 적용은 민·가사 사건에 한합니다 (현재: ${caseNameKo(caseType)})`,
    });
  }
  const hasOtherMultiplier = discounts.some((d) => d.kind !== "klac");
  if (hasOtherMultiplier) {
    warnings.push({
      caseType,
      reason: "klacScopeOverridden",
      messageKo: "KLAC variant 와 다른 multiplier 의 누적은 이중 감액 위험이 있습니다",
    });
  }
  return warnings;
}
