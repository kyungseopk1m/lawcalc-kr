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
 *   3. baseLine = bracket.baseAmount + (caseValue - bracket.scopeStart) × bracket.rate.
 *   4. × appealsMultiplier (1심 1.0 / 항소 1.5 / 상고 2.0, 제3조).
 *   5. × specialProcedure (지급명령 ×0.1 제7조 ②항 / 화해 ×0.2 제7조 ①항, 1심 only).
 *   6. × electronicFiling (×0.9, 제16조).
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
  if (bracket.baseAmount === 0 && bracket.scopeStart === 0) {
    return `소가 ${caseValue.toLocaleString("en-US")} × ${bracket.rate}`;
  }
  return `(${bracket.baseAmount.toLocaleString("en-US")} + (${caseValue.toLocaleString("en-US")} - ${bracket.scopeStart.toLocaleString("en-US")}) × ${bracket.rate})`;
}

function buildFormulaText(args: {
  input: StampDutyInput;
  bracket: StampDutyBracket;
  baseLine: number;
  appealsMultiplier: number;
  specialMultiplier: number | null;
  specialLabel: string | null;
  electronicMultiplier: number | null;
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

  const baseLine = bracket.baseAmount + (input.caseValue - bracket.scopeStart) * bracket.rate;

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

  const electronicMultiplier = input.isElectronicFiling
    ? dataset.electronicFilingDiscount.multiplier
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
