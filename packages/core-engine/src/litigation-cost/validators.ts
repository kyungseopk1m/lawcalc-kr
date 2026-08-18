/**
 * litigation-cost 도메인 input 검증.
 *
 * 각 sub-domain 별 RangeError prefix:
 *   - `"인지대 입력 검증 실패: <inner>"` — validateStampDutyInput
 *   - `"송달료 입력 검증 실패: <inner>"` — validateDeliveryFeeInput
 *   - `"변호사보수 입력 검증 실패: <inner>"` — validateLawyerFeeInput
 *
 * 대한법률구조공단 적용 사건 범위 검증은 RangeError 비차단 — `KoreaLegalAidScopeWarning[]` 반환 (G5 §3.3).
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
  KoreaLegalAidScopeWarning,
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

/**
 * 소가 산정 기준 화이트리스트 (인지규칙 제18조의2). `StampDutyInput.caseValueBasis` 와 동기.
 * `.lcalc` 파서도 이 상수를 쓴다. 목록을 두 벌 두면 새 값을 넣었을 때 앱이 스스로 쓴 파일을
 * 못 여는 상태가 조용히 생긴다.
 */
export const CASE_VALUE_BASES: ReadonlyArray<NonNullable<StampDutyInput["caseValueBasis"]>> = [
  "amount",
  "unascertainable",
  "unascertainableHighTier",
];

/** 보전처분 종류 화이트리스트 (인지법 제9조 제2항). `.lcalc` 파서와 공유한다. */
export const PROVISIONAL_MEASURE_TYPES: ReadonlyArray<
  NonNullable<StampDutyInput["provisionalMeasureType"]>
> = ["general", "provisionalStatus"];

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
  // 지급명령(독촉)은 caseType paymentOrder 자체가 제7조 ②항 대상이라, flag 없이 사건구분만으로도
  // 특별절차로 취급한다 (엔진 파생과 일치). 소장식 인지가 새던 UI 결함(감사 F3) 차단.
  const isPaymentOrder = input.isPaymentOrder === true || input.caseType === "paymentOrder";
  // 지급명령·화해는 1심에서만 적용된다 (인지법 제7조). 항소·상고와 동시 지정은 거부한다.
  if ((isPaymentOrder || input.isSettlement) && input.appealsLevel !== "firstInstance") {
    fail(prefix, `지급명령·화해는 1심에서만 적용됩니다 (현재 심급: ${input.appealsLevel})`);
  }
  // 조정신청(머)은 「민사조정규칙」제3조의 **신청** 수수료라 심급 배수를 탈 자리가 없다.
  // 민사조정법 제34조·제36조는 이의 후 소송으로 이행하는 구조이지 조정신청의 항소·상고가
  // 아니고, 같은 법 제6조의 항소심 조정은 법원의 회부라 신청 수수료를 새로 붙이지 않는다.
  // 이 가드가 없던 동안 소가 30,000,000원 조정신청이 항소 21,000원 / 상고 28,000원이라는
  // 존재하지 않는 수수료를 냈다.
  if (input.caseType === "civilMediation" && input.appealsLevel !== "firstInstance") {
    fail(prefix, `조정신청은 1심에서만 적용됩니다 (현재 심급: ${input.appealsLevel})`);
  }
  // 지급명령 + 화해 동시 지정 거부 — 상호 배타.
  if (isPaymentOrder && input.isSettlement) {
    fail(prefix, "지급명령과 화해는 동시에 적용할 수 없습니다");
  }
  // 보전처분(가압류·가처분)은 제9조 ②항 별도 체계라 심급 배수나 지급명령·화해와 무관하다.
  const isProvisional =
    input.caseType === "provisionalMeasureCollegial" ||
    input.caseType === "provisionalMeasureSingle";
  if (isProvisional) {
    if (
      input.provisionalMeasureType !== undefined &&
      !PROVISIONAL_MEASURE_TYPES.includes(input.provisionalMeasureType)
    ) {
      fail(
        prefix,
        `보전처분 종류가 유효하지 않습니다 (입력: ${String(input.provisionalMeasureType)})`,
      );
    }
    if (isPaymentOrder || input.isSettlement) {
      fail(
        prefix,
        "보전처분 인지에는 지급명령·화해 감액을 적용할 수 없습니다 (제9조 ②항 별도 체계)",
      );
    }
    if (input.appealsLevel !== "firstInstance") {
      fail(
        prefix,
        `보전처분 인지는 심급 배수를 적용하지 않습니다 (현재 심급: ${input.appealsLevel})`,
      );
    }
  }
  // 소가 산정 기준(인지규칙 제18조의2). `resolveEffectiveCaseValue` 는 "amount" 가 아닌
  // **모든** 값을 간주 소가로 취급하므로, 오타 하나가 소가를 통째로 갈아치운다
  // (소가 10억 + "unascertainableHigh" 오타 → 인지 4,055,000원이 230,000원이 된다).
  // 손편집된 `.lcalc` 이나 신버전이 추가한 기준값을 구버전이 여는 경우에 실제로 도달한다.
  // 형제 필드 provisionalMeasureType 과 같은 화이트리스트 검증을 건다.
  if (input.caseValueBasis !== undefined && !CASE_VALUE_BASES.includes(input.caseValueBasis)) {
    fail(prefix, `소가 산정 기준이 유효하지 않습니다 (입력: ${String(input.caseValueBasis)})`);
  }
  // 보존용 전체 소가 (계산 무영향). 손편집된 파일이 소가란에 NaN 을 실어 오지 않게 막는다.
  if (input.fullCaseValue !== undefined && !isFiniteNonNegative(input.fullCaseValue)) {
    fail(prefix, `전체 소가가 유효하지 않습니다 (입력: ${String(input.fullCaseValue)})`);
  }
  // 제11조 ①항 원신청서 인지액. 검증이 없으면 음수·NaN·Infinity 가 그대로 2배가 되어
  // 음수 인지액이나 NaN 이 결과에 실린다 (`-1` → -2원, `NaN` → NaN, `Infinity` → Infinity).
  // 인지액은 원 단위 양의 정수다.
  if (
    input.underlyingApplicationStampDutyWon !== undefined &&
    !(
      Number.isSafeInteger(input.underlyingApplicationStampDutyWon) &&
      input.underlyingApplicationStampDutyWon >= 1
    )
  ) {
    fail(
      prefix,
      `원신청서 인지액이 유효하지 않습니다 (입력: ${String(input.underlyingApplicationStampDutyWon)})`,
    );
  }
  if (input.filingDate !== undefined && !ISO_DATE_PATTERN.test(input.filingDate)) {
    fail(prefix, `접수일이 ISO 형식이 아닙니다 (입력: ${String(input.filingDate)})`);
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
      if (discount.hasOralHearing !== undefined && typeof discount.hasOralHearing !== "boolean") {
        fail(prefix, "provisionalCase.hasOralHearing 은 boolean 이거나 미지정이어야 합니다");
      }
      if (
        discount.applicationKind !== undefined &&
        discount.applicationKind !== "application" &&
        discount.applicationKind !== "objectionOrCancellation"
      ) {
        fail(
          prefix,
          `provisionalCase.applicationKind 가 유효하지 않습니다 (입력: ${String(discount.applicationKind)})`,
        );
      }
      return;
    case "koreaLegalAid":
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
  // 제3조 ②항은 가압류·가처분 사건에만 적용된다. 본안 사건구분에 이 감액이 붙으면 오적용이다.
  if (
    input.caseType !== "provisionalMeasureCollegial" &&
    input.caseType !== "provisionalMeasureSingle" &&
    input.discounts.some((d) => d.kind === "provisionalCase")
  ) {
    fail(
      prefix,
      "제3조 ②항 감액은 가압류·가처분 사건구분에만 적용됩니다 (현재 사건구분: " +
        `${input.caseType})`,
    );
  }
  if (
    input.koreaLegalAidAgreedFeeWon !== undefined &&
    !isFiniteNonNegative(input.koreaLegalAidAgreedFeeWon)
  ) {
    fail(
      prefix,
      `대한법률구조공단 약정보수액이 유효하지 않습니다 (입력: ${String(input.koreaLegalAidAgreedFeeWon)})`,
    );
  }
  if (input.agreedFeeWon !== undefined && !isFiniteNonNegative(input.agreedFeeWon)) {
    fail(prefix, `지급보수액이 유효하지 않습니다 (입력: ${String(input.agreedFeeWon)})`);
  }
  if (input.filingDate !== undefined && !ISO_DATE_PATTERN.test(input.filingDate)) {
    fail(prefix, `접수일이 ISO 형식이 아닙니다 (입력: ${String(input.filingDate)})`);
  }
}

// ===== 대한법률구조공단 scope (non-throwing) =====

/**
 * 대한법률구조공단 적용 사건 범위 검증. G5 §3.3 권고 — RangeError 비차단, UI 측 경고 채널.
 *
 *   - `koreaLegalAidScopeNotCivilOrFamily`: 행정·보전·지급명령에 대한법률구조공단 variant 적용 시
 *   - `koreaLegalAidScopeOverridden`: 대한법률구조공단 + 다른 multiplier 누적 시 이중 감액 risk
 *
 * 본 함수는 throw 하지 않음 — 호출자가 warnings 배열을 받아 UI 측 표시.
 */
export function validateKoreaLegalAidDiscountScope(
  caseType: CaseType,
  discounts: ReadonlyArray<LawyerFeeDiscount>,
): KoreaLegalAidScopeWarning[] {
  const warnings: KoreaLegalAidScopeWarning[] = [];
  const hasKoreaLegalAid = discounts.some((d) => d.kind === "koreaLegalAid");
  if (!hasKoreaLegalAid) {
    return warnings;
  }
  if (!isCivilOrFamily(caseType)) {
    warnings.push({
      caseType,
      reason: "koreaLegalAidScopeNotCivilOrFamily",
      messageKo: `대한법률구조공단 적용은 민·가사 사건에 한합니다 (현재: ${caseNameKo(caseType)})`,
    });
  }
  const hasOtherMultiplier = discounts.some((d) => d.kind !== "koreaLegalAid");
  if (hasOtherMultiplier) {
    warnings.push({
      caseType,
      reason: "koreaLegalAidScopeOverridden",
      messageKo: "대한법률구조공단 variant 와 다른 multiplier 의 누적은 이중 감액 위험이 있습니다",
    });
  }
  return warnings;
}
