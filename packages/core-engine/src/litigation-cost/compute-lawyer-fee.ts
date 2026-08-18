import { applyLawyerFeeDiscounts } from "./helpers";
import {
  getLawyerFeeBracket,
  lawyerFeeDatasetVersionTag,
  loadLawyerFeeDataset,
  type LawyerFeeDataset,
} from "./lawyer-fee-dataset";
import type { LawyerFeeBracket, LawyerFeeDiscount, LawyerFeeInput, LawyerFeeResult } from "./types";
import { validateKoreaLegalAidDiscountScope, validateLawyerFeeInput } from "./validators";

/**
 * 변호사보수 engine. 「변호사보수의 소송비용 산입에 관한 규칙」 별표 + 제3조 + 제5조 + 제6조 wire-up.
 *
 * 산식 (PR 1 정정 spec 제3조 정합):
 *
 *   1. validateLawyerFeeInput(input)  — 음수 소가 / 무효 caseType / 도메인 mismatch 등 거부.
 *   2. bracket = getLawyerFeeBracket(dataset, caseValue)  — 8구간 매칭.
 *   3. baseAmount = bracket.baseAmount + (caseValue - bracket.scopeStart) × bracket.rate.
 *   4. applyLawyerFeeDiscounts(baseAmount, discounts, koreaLegalAidAgreedFeeWon)  — PR 1 helper.
 *      → { amountWon, multiplier (clamp 후), rawMultiplier, clamped }.
 *      누적 (compound) + clamp [0.0, 1.5] (제6조 제2항 cap).
 *   5. validateKoreaLegalAidDiscountScope(caseType, discounts)  — 비차단 warning. result.koreaLegalAidWarnings 노출.
 *   6. 심급 처리: 본 규칙 제3조 제1항·제3항 — per_instance_independent. 각 심급마다 별표 그대로
 *      적용 (인지법의 ×1.5/×2 누적 배수와 다른 패턴). 항소심/상고심의 소가 = 상소로써 불복하는
 *      범위 — caller 가 input.caseValue 로 입력. engine 은 심급 multiplier 미적용.
 *   7. formulaText 생성 (사건구분 라벨 + 구간 산식 + discount 분기 라벨 + multiplier + clamped + 최종).
 *
 * 시기별 슬라이스: 본 v1.0.0 = 현행 단일 슬라이스 (2018-04-01 별표). filingDate 는 input
 * type 으로만 보존 (validate ISO), v0.3.1+ 의 history-aware 슬라이스 진입 시점에 wire-up.
 */

export interface ComputeLawyerFeeDeps {
  /** 외부 dataset 주입 (테스트/시기별 슬라이스 wire-up). 미지정 시 기본 dataset 사용. */
  dataset?: LawyerFeeDataset;
  /** 결과의 computedAt override (golden 결정성용). 미지정 시 new Date().toISOString(). */
  computedAt?: string;
}

function bracketFormulaSegment(bracket: LawyerFeeBracket, caseValue: number): string {
  if (bracket.rate === 0) {
    return `별표 ${bracket.sortOrder}구간 정액 ${bracket.baseAmount.toLocaleString("en-US")}원 (${bracket.rateText})`;
  }
  return (
    `별표 ${bracket.sortOrder}구간: ${bracket.baseAmount.toLocaleString("en-US")} + ` +
    `(${caseValue.toLocaleString("en-US")} - ${bracket.scopeStart.toLocaleString("en-US")}) × ${bracket.rate}`
  );
}

function discountSegment(discount: LawyerFeeDiscount): string {
  switch (discount.kind) {
    case "noOralHearingOrAdmission":
      return `제5조 (${discount.reason}, ×0.5)`;
    case "provisionalCase":
      if (discount.applicationKind === "objectionOrCancellation") {
        return "제3조 제2항 (가압류·가처분 이의·취소 신청사건 ×0.5, 단서 대상 아님)";
      }
      if (discount.hasOralHearing === false) {
        return "제3조 제2항 단서 (가압류·가처분 신청사건, 변론·심문을 거치지 않아 산입 불가 ×0)";
      }
      return discount.hasOralHearing === true
        ? "제3조 제2항 (가압류·가처분 신청사건, 변론·심문 거침 ×0.5)"
        : "제3조 제2항 본문 (가압류·가처분 ×0.5)";
    case "koreaLegalAid":
      return "대한법률구조공단 (×0.42 default)";
    case "courtDiscretion":
      return `제6조 (재량 ×${discount.multiplier})`;
    case "customPercent":
      return `합의/특약 (×${discount.rate})`;
  }
}

function buildFormulaText(args: {
  bracket: LawyerFeeBracket;
  input: LawyerFeeInput;
  baseAmount: number;
  appliedDiscounts: LawyerFeeDiscount[];
  rawMultiplier: number;
  multiplier: number;
  clamped: boolean;
  finalAmount: number;
}): string {
  const segments: string[] = [bracketFormulaSegment(args.bracket, args.input.caseValue)];
  for (const d of args.appliedDiscounts) {
    segments.push(discountSegment(d));
  }
  const baseDisplay = Number.isInteger(args.baseAmount)
    ? args.baseAmount.toLocaleString("en-US")
    : args.baseAmount.toFixed(2);
  const finalDisplay = args.finalAmount.toLocaleString("en-US");
  const clampNote = args.clamped
    ? `, 상한 적용 (산정 ${args.rawMultiplier} → ${args.multiplier})`
    : "";
  return (
    `${segments.join(" + ")} = ${baseDisplay}원, ` +
    `배율 ${args.multiplier}${clampNote} → ${finalDisplay}원 (제3조 제1항·제3항, 심급별 독립)`
  );
}

/**
 * 변호사보수 계산. 입력 검증 → bracket 매칭 → 누진 산식 → 감액/조정 누적 → 대한법률구조공단 scope warning.
 *
 * @example
 *   const r = computeLawyerFee({
 *     caseValue: 30_000_000,
 *     caseType: "civilFirstInstanceCollegial",
 *     discounts: [{ kind: "koreaLegalAid" }],
 *   });
 *   // r.amount === floor(2_800_000 × 0.42) = 1_176_000
 *   // r.koreaLegalAidWarnings.length === 0 (민사 — 적용 범위)
 */
export function computeLawyerFee(
  input: LawyerFeeInput,
  deps?: ComputeLawyerFeeDeps,
): LawyerFeeResult {
  validateLawyerFeeInput(input);
  const dataset = loadLawyerFeeDataset(deps?.dataset);
  const bracket = getLawyerFeeBracket(dataset, input.caseValue);

  const baseAmount = bracket.baseAmount + (input.caseValue - bracket.scopeStart) * bracket.rate;

  // 제3조 제2항 본문에 따라 보전 사건(카합/카단)이면 별표액의 1/2 이 적용된다. 호출자가
  // discount 를 빠뜨려도 사건구분만으로 걸리게 한다. 명시 discount 가 있으면 그쪽을 쓴다
  // (둘 다 적용하면 1/4 이 된다).
  const isProvisionalCase =
    input.caseType === "provisionalMeasureCollegial" ||
    input.caseType === "provisionalMeasureSingle";
  const provisionalAutoApplied =
    isProvisionalCase && !input.discounts.some((d) => d.kind === "provisionalCase");
  const effectiveDiscounts: LawyerFeeDiscount[] = provisionalAutoApplied
    ? [...input.discounts, { kind: "provisionalCase" }]
    : [...input.discounts];

  const { amountWon, multiplier, rawMultiplier, clamped } = applyLawyerFeeDiscounts(
    baseAmount,
    effectiveDiscounts,
    input.koreaLegalAidAgreedFeeWon,
  );

  // 제3조 제1항. 산입 보수는 지급보수액의 범위 내에서 별표 기준으로 산정한다. agreedFeeWon 을 주면
  // min(별표 산정액, 지급보수액) 으로 cap (감사 F2). 미지정 시 결과는 별표 상한액이지 실제 산입액이
  // 아님을 formulaText 로 격리 고지한다.
  const hasAgreedFee =
    input.agreedFeeWon !== undefined &&
    Number.isFinite(input.agreedFeeWon) &&
    input.agreedFeeWon >= 0;
  const agreedFeeCapApplied = hasAgreedFee && input.agreedFeeWon! < amountWon;
  const finalAmount = agreedFeeCapApplied ? input.agreedFeeWon! : amountWon;

  const koreaLegalAidWarnings = validateKoreaLegalAidDiscountScope(input.caseType, input.discounts);

  // 제3조 제2항 단서는 사실관계(변론·심문 개최 여부)라 입력 없이는 판정할 수 없다. 본문만 적용한
  // 결과라는 것을 격리 고지한다 (제3조 제1항 지급보수액 미입력 고지와 같은 관용구).
  // 이의·취소 신청사건은 단서 대상이 아니므로 고지할 미확인 사항이 없다.
  const provisionalClauseNote =
    isProvisionalCase &&
    !effectiveDiscounts.some(
      (d) =>
        d.kind === "provisionalCase" &&
        (d.hasOralHearing !== undefined || d.applicationKind === "objectionOrCancellation"),
    )
      ? " · 신청사건이면 변론 또는 심문을 거친 경우에 한해 산입됨 (제3조 제2항 단서 미반영)"
      : "";

  const capNote = agreedFeeCapApplied
    ? ` → 지급보수액 ${input.agreedFeeWon!.toLocaleString("en-US")}원 한도 적용 (제3조 제1항)`
    : hasAgreedFee
      ? ` (지급보수액 ${input.agreedFeeWon!.toLocaleString("en-US")}원 이내라 별표 산정액을 그대로 산입)`
      : " · 지급보수액 미입력: 별표 상한액이며 실제 산입액은 지급보수액 범위 내로 제한됨 (제3조 제1항)";

  const formulaText =
    buildFormulaText({
      bracket,
      input,
      baseAmount,
      appliedDiscounts: effectiveDiscounts,
      rawMultiplier,
      multiplier,
      clamped,
      finalAmount: amountWon,
    }) +
    capNote +
    provisionalClauseNote;

  return {
    amount: finalAmount,
    baseAmount,
    multiplier,
    rawMultiplier,
    multiplierClamped: clamped,
    appliedDiscounts: effectiveDiscounts,
    koreaLegalAidWarnings,
    formulaText,
    dataVersion: lawyerFeeDatasetVersionTag(dataset),
    computedAt: deps?.computedAt ?? new Date().toISOString(),
  };
}
