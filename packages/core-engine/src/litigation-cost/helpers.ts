/**
 * litigation-cost 도메인의 pure helper 함수.
 *
 * 본 PR 1 에서는 engine 미작성 — 본 파일의 함수들은 types.ts 의 const lookup 과
 * LawyerFeeDiscount 의 multiplier 산정만 담당. PR 2/3/4 의 engine 이 본 helper 들을 import.
 */

import {
  CASE_TYPE_META,
  type CaseType,
  type CaseTypeMeta,
  type Domain,
  type LawyerFeeDiscount,
} from "./types";

/**
 * 사건구분 부호 (한글). 예: `civilFirstInstanceCollegial` → `"가합"`.
 */
export function caseCode(caseType: CaseType): string {
  return CASE_TYPE_META[caseType].code;
}

/**
 * 사건구분 정본 사건명. 예: `civilFirstInstanceCollegial` → `"민사1심합의사건"`.
 * 정본 source: 「사건별 부호문자의 부여에 관한 예규」 (재판예규 제1677호).
 */
export function caseNameKo(caseType: CaseType): string {
  return CASE_TYPE_META[caseType].nameKo;
}

/**
 * 사건구분이 적용되는 도메인 목록. 예: `paymentOrder` → `["stampDuty", "deliveryFee"]` (보수 적용 외).
 */
export function appliedDomains(caseType: CaseType): readonly Domain[] {
  return CASE_TYPE_META[caseType].appliedDomains;
}

/**
 * 사건구분이 민·가사 사건인지 (대한법률구조공단 적용 사건 범위 검증용).
 *
 * 대한법률구조공단 정본 source ("민·가사 사건 등") 기준 — 행정/보전/지급명령 default 미적용.
 */
export function isCivilOrFamily(caseType: CaseType): boolean {
  return CASE_TYPE_META[caseType].isCivilOrFamily;
}

/**
 * 사건구분 전체 lookup. UI dropdown / select 등의 enumeration 용.
 */
export function listCaseTypes(): ReadonlyArray<{
  caseType: CaseType;
  meta: CaseTypeMeta;
}> {
  return (Object.keys(CASE_TYPE_META) as CaseType[]).map((caseType) => ({
    caseType,
    meta: CASE_TYPE_META[caseType],
  }));
}

/**
 * 미지의 값이 `CaseType` 인지 type guard.
 */
export function isCaseType(value: unknown): value is CaseType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CASE_TYPE_META, value);
}

// ===== Lawyer Fee Discount Multiplier =====

/**
 * 대한법률구조공단 약정보수액 default rate (별표 × 0.42).
 * Korea Legal Aid Corporation (KLAC) source:
 *   "기준 중위소득 125% 이하의 국민은 민·가사 사건 등에 대하여 대법원이 정한 변호사보수의
 *    약 42%에 해당하는 보수와 인지대 등 실비만 받고 소송구조를 실시"
 *   — https://www.klac.or.kr/legalstruct/cyberConsultation.do
 */
export const KOREA_LEGAL_AID_DEFAULT_RATE = 0.42;

/**
 * 변호사보수 multiplier clamp range. 제6조 ②항 cap = 1/2 한도 증액 → ×1.5 상한.
 * 감액은 본 규칙상 명시 cap 없음 — 안전망으로 0.0 floor.
 */
export const LAWYER_FEE_MULTIPLIER_MIN = 0.0;
export const LAWYER_FEE_MULTIPLIER_MAX = 1.5;

/**
 * LawyerFeeDiscount 한 variant 의 multiplier 산출.
 *
 * 대한법률구조공단 variant 의 경우 koreaLegalAidAgreedFeeWon 이 제공되면 (agreed/base) 비율 사용,
 * 미지정 시 0.42 default.
 *
 * 본 함수는 단일 variant 의 multiplier 만 반환 — 누적 적용은 `applyLawyerFeeDiscounts` 사용.
 */
export function lawyerFeeDiscountMultiplier(
  discount: LawyerFeeDiscount,
  baseFeeWon: number,
  koreaLegalAidAgreedFeeWon?: number,
): number {
  switch (discount.kind) {
    case "noOralHearingOrAdmission":
      return 0.5;
    case "provisionalCase":
      return discount.hasOralHearing ? 1.0 : 0.5;
    case "koreaLegalAid":
      if (
        koreaLegalAidAgreedFeeWon !== undefined &&
        Number.isFinite(koreaLegalAidAgreedFeeWon) &&
        koreaLegalAidAgreedFeeWon >= 0 &&
        baseFeeWon > 0
      ) {
        const ratio = koreaLegalAidAgreedFeeWon / baseFeeWon;
        return ratio < 1.0 ? ratio : 1.0;
      }
      return KOREA_LEGAL_AID_DEFAULT_RATE;
    case "courtDiscretion":
      return discount.multiplier;
    case "customPercent":
      return discount.rate;
  }
}

/**
 * 누적 multiplier 적용 결과.
 *
 *   - `amountWon`: 최종 변호사보수 (`floor(baseFeeWon × multiplier)`, 원 단위 절사 — 인지대와 동일 정책)
 *   - `multiplier`: clamp 후 적용 multiplier (0.0 ~ 1.5)
 *   - `rawMultiplier`: clamp 전 누적 multiplier (디버그/감사용)
 *   - `clamped`: clamp 적용 여부 (rawMultiplier 가 [0.0, 1.5] 범위 외였으면 true)
 */
export interface ApplyLawyerFeeDiscountsResult {
  amountWon: number;
  multiplier: number;
  rawMultiplier: number;
  clamped: boolean;
}

/**
 * 유한 number 를 정확한 십진 유리수(`num` / `den`, `den = 10^k`)로 환원한다.
 *
 * `Number.prototype.toString` 의 최단 round-trip 표현을 파싱하므로 `0.3 → 3/10` 처럼
 * 사용자가 의도한 십진값을 부동소수 오차 없이 복원한다. 지수 표기(`1e-7` 등)도 처리.
 * 변호사보수 floor 계산이 부동소수 오차나 배율 양자화로 ±1원 오차를 내지 않도록 하는 helper.
 * (입력은 변호사보수 도메인상 음수가 들어오지 않음 — base ≥ 0, multiplier ∈ [0, 1.5].)
 */
export function decimalToFraction(x: number): { num: bigint; den: bigint } {
  if (!Number.isFinite(x)) throw new RangeError(`유한수가 아닙니다: ${x}`);
  const match = x.toString().match(/^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new RangeError(`예상치 못한 수 표현: ${x}`);
  const [, sign, intPart, fracPart = "", expStr] = match;
  const num = BigInt(`${sign ?? ""}${intPart ?? "0"}${fracPart}`);
  const denExp = fracPart.length - (expStr ? Number.parseInt(expStr, 10) : 0);
  return denExp <= 0
    ? { num: num * 10n ** BigInt(-denExp), den: 1n }
    : { num, den: 10n ** BigInt(denExp) };
}

/**
 * LawyerFeeDiscount 누적 (compound) 적용.
 *
 * 정책 (G5 §5):
 *   - default = compound (`final = base × ∏ multiplier`)
 *   - 제6조 ②항 cap = 증액 1/2 한도 (×1.5 상한)
 *   - 안전망: clamp 0.0 ~ 1.5
 *
 * 본 규칙 본문 구조 (사건구분 × 종결 사유 의 직교 조합) 가 누적 적용을 전제 — G5 research note §5.1.
 */
export function applyLawyerFeeDiscounts(
  baseFeeWon: number,
  discounts: ReadonlyArray<LawyerFeeDiscount>,
  koreaLegalAidAgreedFeeWon?: number,
): ApplyLawyerFeeDiscountsResult {
  let multiplier = 1.0;
  for (const d of discounts) {
    multiplier *= lawyerFeeDiscountMultiplier(d, baseFeeWon, koreaLegalAidAgreedFeeWon);
  }
  const rawMultiplier = multiplier;
  let clamped = false;
  if (multiplier < LAWYER_FEE_MULTIPLIER_MIN) {
    multiplier = LAWYER_FEE_MULTIPLIER_MIN;
    clamped = true;
  } else if (multiplier > LAWYER_FEE_MULTIPLIER_MAX) {
    multiplier = LAWYER_FEE_MULTIPLIER_MAX;
    clamped = true;
  }
  // 원 단위 절사 (인지대와 동일 정책). 부동소수 곱셈 오차나 배율 양자화가 ±1원 오차를 내지
  // 않도록, base·multiplier 의 십진 표현을 정확한 유리수로 환원해 BigInt 정수 산술로 floor 한다.
  // 예: 2,800,000 × 0.3 = 정확히 840,000 / × 0.3571426785714286 = 999,999.5000… → 999,999.
  const b = decimalToFraction(baseFeeWon);
  const m = decimalToFraction(multiplier);
  const amountWon = Number((b.num * m.num) / (b.den * m.den));

  return {
    amountWon,
    multiplier,
    rawMultiplier,
    clamped,
  };
}
