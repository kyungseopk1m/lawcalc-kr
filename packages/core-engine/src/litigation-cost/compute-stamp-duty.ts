import { decimalToFraction } from "./helpers";
import {
  getAppealsMultiplier,
  getStampDutyBracket,
  loadStampDutyDataset,
  stampDutyVersionTag,
  type StampDutyDataset,
} from "./stamp-duty-dataset";
import type {
  AppealsLevel,
  StampDutyBracket,
  StampDutyInput,
  StampDutyResult,
  StampDutyRoundingPolicy,
} from "./types";
import { validateStampDutyInput } from "./validators";

/**
 * 인지대 engine. 「민사소송 등 인지법」 제2조 + 제3조 + 제7조 + 제16조 wire-up.
 *
 * 산식 (PR 1 정정 spec §1 정합):
 *
 *   1. validateStampDutyInput(input)  — 음수 소가 / 무효 caseType / 항소 + 특별절차 등 거부.
 *   2. bracket = getStampDutyBracket(dataset, caseValue)  — 4구간 매칭.
 *   3. baseLine = caseValue × bracket.rate + bracket.baseAmount — 인지법 제2조 ①은 **소가
 *      전체**에 구간 요율을 곱하고 보정 상수(5천/5만5천/55만5천원)를 더하는 연속 보정식이다
 *      (구간 경계에서 값이 이어진다: 1천만×50/10,000 = 1천만×45/10,000 + 5,000 = 50,000).
 *      v0.10.0 전 구현은 변호사보수 별표("…까지 부분" 요율)와 동형인 구간별 누진식
 *      `baseAmount + (caseValue − scopeStart) × rate` 로 오적용해 1천만원 이상 전 구간을
 *      과소계산했다 (예: 소가 5천만 소장 185,000 ← 정답 230,000). KLAC 자동계산·법령
 *      원문(법률 제20003호) 대조로 확정 후 교정.
 *   4. × appealsMultiplier (1심 1.0 / 항소 1.5 / 상고 2.0, 제3조).
 *   5. × specialProcedure (지급명령 ×0.1 제7조 ②항 / 화해 ×0.2 제7조 ①항, 1심 only).
 *   6. × electronicFiling (×0.9, 제16조 — filingDate 가 시행일 2011-10-19 이전이면 미적용).
 *   7. 재심 (isRetrial=true): 산식 무영향 (제8조 본문 "심급에 따라 ... 금액"), formulaText prefix 만.
 *   8. applyStampDutyRounding  — 1,000원 floor + 100원 절사 (제2조 ②항), 모든 multiplier 적용 후 마지막.
 *
 * 누적 multiplier 가 [0, 1.5] 범위 외인 변호사보수와 달리 인지법의 multiplier 는 본 규칙상
 * 각각 명시적이므로 clamp 미적용 (특별절차 0.1 < 항소 1.5 < 상고 + 1심외 X 조합 차단은 validator 에서).
 */

export interface ComputeStampDutyDeps {
  /** 외부 dataset 주입 (테스트/시기별 슬라이스 wire-up). 미지정 시 기본 dataset 사용. */
  dataset?: StampDutyDataset;
  /** 결과의 computedAt override (golden 결정성용). 미지정 시 new Date().toISOString(). */
  computedAt?: string;
}

/**
 * 1,000원 floor + 100원 절사 (인지법 제2조 ②항).
 *
 *   - amount < 1,000 → 1,000.
 *   - amount >= 1,000 → floor to 100원 단위 (100원 미만 절사).
 *
 * truncateBelowWon=100 일 때 (현행), 1,234 → 1,200 / 999 → 1,000 / 1,001 → 1,000.
 * truncateBelowWon=0 일 때 절사 없음 (안전망).
 */
export function applyStampDutyRounding(amount: number, policy: StampDutyRoundingPolicy): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`applyStampDutyRounding.amount: must be >= 0 (got ${amount})`);
  }
  if (amount < policy.floorMinimumWon) {
    return policy.floorMinimumWon;
  }
  if (policy.truncateBelowWon <= 0) {
    return amount;
  }
  return Math.floor(amount / policy.truncateBelowWon) * policy.truncateBelowWon;
}

function appealsLevelLabelKo(level: AppealsLevel): string {
  switch (level) {
    case "firstInstance":
      return "1심";
    case "appeal":
      return "항소";
    case "supreme":
      return "상고";
  }
}

function bracketFormulaSegment(bracket: StampDutyBracket, caseValue: number): string {
  if (bracket.baseAmount === 0) {
    return `소가 ${caseValue.toLocaleString("en-US")} × ${bracket.rate}`;
  }
  return `(소가 ${caseValue.toLocaleString("en-US")} × ${bracket.rate} + ${bracket.baseAmount.toLocaleString("en-US")})`;
}

function buildFormulaText(args: {
  input: StampDutyInput;
  bracket: StampDutyBracket;
  baseLine: number;
  appealsMultiplier: number;
  specialMultiplier: number | null;
  specialLabel: string | null;
  electronicMultiplier: number | null;
  electronicSkippedNote: string | null;
  preRounding: number;
  finalAmount: number;
}): string {
  const segments: string[] = [];
  if (args.input.isRetrial) {
    segments.push("재심소장 (제8조, 심급별 동일 적용)");
  }
  segments.push(`${appealsLevelLabelKo(args.input.appealsLevel)} (×${args.appealsMultiplier})`);
  if (args.specialLabel && args.specialMultiplier !== null) {
    segments.push(`${args.specialLabel} (×${args.specialMultiplier})`);
  }
  if (args.electronicMultiplier !== null) {
    segments.push(`전자소송 (×${args.electronicMultiplier})`);
  }
  if (args.electronicSkippedNote !== null) {
    segments.push(args.electronicSkippedNote);
  }

  const arithmetic: string[] = [bracketFormulaSegment(args.bracket, args.input.caseValue)];
  arithmetic.push(`× ${args.appealsMultiplier}`);
  if (args.specialMultiplier !== null) {
    arithmetic.push(`× ${args.specialMultiplier}`);
  }
  if (args.electronicMultiplier !== null) {
    arithmetic.push(`× ${args.electronicMultiplier}`);
  }

  const preRoundingDisplay = Number.isInteger(args.preRounding)
    ? args.preRounding.toLocaleString("en-US")
    : args.preRounding.toFixed(2);
  const arithmeticText = `${arithmetic.join(" ")} = ${preRoundingDisplay}원 → ${args.finalAmount.toLocaleString("en-US")}원 (제2조 ②항 반올림)`;
  return `${segments.join(" + ")}: ${arithmeticText}`;
}

/**
 * 인지대 계산. 입력 검증 → 누진 산식 → 심급/특별절차/전자소송 multiplier → 반올림.
 */
export function computeStampDuty(
  input: StampDutyInput,
  deps?: ComputeStampDutyDeps,
): StampDutyResult {
  validateStampDutyInput(input);
  const dataset = loadStampDutyDataset(deps?.dataset);
  const bracket = getStampDutyBracket(dataset, input.caseValue);

  // 인지법 제2조 ① — 소가 전체 × 요율 + 보정 상수 (연속 보정식, 상단 doc 참조).
  // float 곱(예: 50,000,000 × 0.0045 = 224,999.99999999997)이 100원 절사(제2조 ②)를
  // 아래로 새게 하므로, 요율을 정확 유리수(0.0045 → 45/10,000)로 곱해 계산한다
  // (변호사보수 floor 와 동일 정책 — decimalToFraction).
  const rate = decimalToFraction(bracket.rate);
  const value = decimalToFraction(input.caseValue);
  const num = value.num * rate.num + BigInt(bracket.baseAmount) * value.den * rate.den;
  const den = value.den * rate.den;
  const baseLine = Number(num) / Number(den);

  const appealsMultiplier = getAppealsMultiplier(dataset, input.appealsLevel);

  let specialMultiplier: number | null = null;
  let specialLabel: string | null = null;
  if (input.isPaymentOrder) {
    specialMultiplier = dataset.specialProcedures.paymentOrder.multiplier;
    specialLabel = "지급명령";
  } else if (input.isSettlement) {
    specialMultiplier = dataset.specialProcedures.settlement.multiplier;
    specialLabel = "화해";
  }

  // 제16조 전자소송 감액 — filingDate 가 시행일 이전이면 미적용 (미지정 시 현행 사건으로 간주).
  const electronicEffectiveFrom = dataset.electronicFilingDiscount.effectiveFrom;
  const electronicApplies =
    input.isElectronicFiling === true &&
    (input.filingDate === undefined || input.filingDate >= electronicEffectiveFrom);
  const electronicMultiplier = electronicApplies
    ? dataset.electronicFilingDiscount.multiplier
    : null;
  const electronicSkippedNote =
    input.isElectronicFiling === true && !electronicApplies
      ? `전자소송 감액 미적용 (접수일 ${input.filingDate} — 제16조 시행 ${electronicEffectiveFrom} 전)`
      : null;

  let preRounding = baseLine * appealsMultiplier;
  if (specialMultiplier !== null) {
    preRounding *= specialMultiplier;
  }
  if (electronicMultiplier !== null) {
    preRounding *= electronicMultiplier;
  }

  const finalAmount = applyStampDutyRounding(preRounding, dataset.roundingPolicy);

  const formulaText = buildFormulaText({
    input,
    bracket,
    baseLine,
    appealsMultiplier,
    specialMultiplier,
    specialLabel,
    electronicMultiplier,
    electronicSkippedNote,
    preRounding,
    finalAmount,
  });

  return {
    amount: finalAmount,
    formulaText,
    dataVersion: stampDutyVersionTag(dataset),
    computedAt: deps?.computedAt ?? new Date().toISOString(),
  };
}
