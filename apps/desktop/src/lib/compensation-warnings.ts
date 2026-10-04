/**
 * 손해배상 결과의 사용자 경고 문구 — **단일 출처**.
 *
 * 화면·클립보드·PDF·CSV 가 같은 목록을 내야 한다. 종전에는 화면에만 배지가 있고 세 export
 * 에는 금액만 남아, 경고가 가장 필요한 지점(실무에서 최종 산출물이 되는 PDF 산출근거)에서
 * 사라졌다. 상한이 걸렸다는 것은 **실제로 금액이 잘렸다는 사실**이라 더 그렇다.
 *
 * Rust 측 export 는 문구를 만들지 않고 `exportWarnings` 로 받은 문자열을 그대로 출력한다.
 * 경고가 늘어도 이 파일만 고치면 세 경로가 함께 따라온다.
 */

import type { CompensationAutoDeathResult, CompensationResult } from "@lawcalc-kr/compensation";

import { formatWon } from "./format-won";

/** 경고 문구를 실어 보내기 위해 export payload 에만 덧붙이는 필드. `.lcalc` 에는 저장하지 않는다. */
export interface WithExportWarnings {
  exportWarnings: string[];
  /** 과실상계·공제 뒤에 더한 위자료. 화면의 "위자료 가산" 행과 같은 값 (0 이면 행 없음). */
  solatiumAddedWon: number;
  /** 공제가 재산상 손해를 넘은 금액 중 위자료에서 뺀 금액. 0 이면 "공제 초과분" 행 없음. */
  deductionExcessWon: number;
  /** "공제 초과분" 행 라벨 (0원 하한 설명 포함). Rust 는 문구를 만들지 않고 그대로 쓴다. */
  deductionExcessLabel: string;
}

type AnyCompensationResult = CompensationResult | CompensationAutoDeathResult;

/**
 * 과실상계·공제 뒤에 더한 위자료 (원). 위자료가 과실상계 대상 소계에 들어간 결과
 * (보험약관 기준 토글, 또는 그 방식으로 저장된 옛 `.lcalc` 결과)는 0 이다.
 *
 * 결과에는 토글 값이 없어서 소계 구성으로 판별한다: 소계가 위자료를 뺀 재산상 손해
 * (일실수입 + 기타손해 + 장례비)와 같으면 위자료는 뒤에 더해진 것이다.
 */
export function solatiumAddedAfterDeductionsWon(result: AnyCompensationResult): number {
  const lostIncome = result.industrialBenefit?.lostIncomeAfterWon ?? result.lostIncomeSubtotalWon;
  const funeral = "funeralExpenseWon" in result ? result.funeralExpenseWon : 0;
  const pecuniaryWithoutSolatium = lostIncome + (result.otherDamages?.subtotalWon ?? 0) + funeral;
  return result.pecuniaryDamagesSubtotalWon === pecuniaryWithoutSolatium ? result.solatiumWon : 0;
}

export interface SolatiumSettlement {
  addedWon: number;
  deductionExcessWon: number;
  uncoveredExcessWon: number;
}

/**
 * 위자료 가산과 공제 초과분. 엔진 최종액은 `max(0, 과실상계 후 - 공제 + 위자료)` 라서
 * 공제가 재산상 손해를 넘으면 초과분이 위자료에서 빠진다. 화면은 이때 "공제 후 재산상
 * 손해 0원 → 공제 초과분(음수) → 위자료 가산" 으로 보여, 그 세 행의 합이 최종액(100원
 * 미만 버림 전)과 맞게 한다. 위자료로도 다 못 뺀 초과분은 0원 하한으로 버려진다.
 *
 * 위자료가 과실상계 대상 소계에 들어간 결과(보험약관 기준·구 결과)는 모두 0 이다.
 */
export function solatiumSettlement(result: AnyCompensationResult): SolatiumSettlement {
  const addedWon = solatiumAddedAfterDeductionsWon(result);
  if (addedWon === 0) return { addedWon, deductionExcessWon: 0, uncoveredExcessWon: 0 };
  const afterDeductions =
    result.faultOffset.afterWon -
    result.deductions.ratioSubtotalWon -
    result.deductions.absoluteSubtotalWon;
  const excess = Math.max(0, -afterDeductions);
  const deductionExcessWon = Math.min(excess, addedWon);
  return { addedWon, deductionExcessWon, uncoveredExcessWon: excess - deductionExcessWon };
}

/** "공제 초과분" 행 라벨. 다 빼지 못한 초과분이 있으면 0원 하한을 밝힌다. */
export function deductionExcessLabel(settlement: SolatiumSettlement): string {
  return settlement.uncoveredExcessWon > 0
    ? `공제 초과분 (위자료에서 차감, 남은 ${formatWon(settlement.uncoveredExcessWon)}은 최종액 0원 하한으로 차감하지 않음)`
    : "공제 초과분 (위자료에서 차감)";
}

/**
 * 결과에 걸린 경고를 사람이 읽는 문장으로 만든다. 없으면 빈 배열.
 *
 * 금액이 잘린 사실(상한 적용)을 먼저, 입력 방식에 대한 주의(분할 의심)를 뒤에 둔다.
 */
export function buildCompensationExportWarnings(result: AnyCompensationResult): string[] {
  const warnings: string[] = [];

  const cappedAt = result.hoffman240Cap.cappedAtIndex;
  if (cappedAt !== null && cappedAt !== undefined) {
    warnings.push(
      `일실수입에 호프만 240 한도가 적용됐습니다. ${cappedAt + 1}번째 구간부터 누적 현가율을 240으로 제한해 금액이 줄었습니다.`,
    );
  }

  const other = result.otherDamages;
  if (other !== undefined) {
    const attendantCappedAt = other.attendantCare?.hoffman240CappedAtIndex;
    if (attendantCappedAt !== null && attendantCappedAt !== undefined) {
      warnings.push(
        `개호비에 호프만 240 한도가 적용됐습니다. ${attendantCappedAt + 1}번째 구간부터 제한돼 금액이 줄었습니다.`,
      );
    }
    if (other.treatment?.valueSum20Capped === true) {
      warnings.push("치료비에 수치합계 20 한도가 적용돼 금액이 줄었습니다.");
    }
    if (other.appliance?.valueSum20Capped === true) {
      warnings.push("보조구에 수치합계 20 한도가 적용돼 금액이 줄었습니다.");
    }
    if (other.treatment?.splitSuspected === true || other.appliance?.splitSuspected === true) {
      warnings.push(
        "단가와 주기가 같고 기간이 겹치거나 이어지는 향후 지출 항목이 있습니다. 같은 지출을 나눠 입력하면 수치합계 한도가 항목마다 따로 걸려 합계가 커집니다.",
      );
    }
  }

  return warnings;
}

/** export 로 넘길 payload — 결과 원본에 경고 목록만 덧붙인다. */
export function withCompensationExportWarnings<T extends AnyCompensationResult>(
  result: T,
): T & WithExportWarnings {
  const settlement = solatiumSettlement(result);
  return {
    ...result,
    exportWarnings: buildCompensationExportWarnings(result),
    solatiumAddedWon: settlement.addedWon,
    deductionExcessWon: settlement.deductionExcessWon,
    deductionExcessLabel: deductionExcessLabel(settlement),
  };
}
