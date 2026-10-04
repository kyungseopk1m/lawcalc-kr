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

import type {
  CompensationAutoDeathResult,
  CompensationResult,
  LaborRateEffectiveRule,
} from "@lawcalc-kr/compensation";

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
  /** 비율공제·지급치료비가 재산상 손해를 넘어 빼지 않은 금액 (`propertyOnlyExcessWon`). */
  propertyOnlyExcessWon: number;
  /** "노임 기준" 행 값 (`laborRateTimingText`). 결과에는 입력이 없어 화면이 넘긴다. 없으면 "". */
  laborRateTimingText: string;
  /** "절사" 행 값 (`COURT_TRUNCATION_TEXT`). 자×부상에서 법원 방식 절사를 켰을 때만, 아니면 "". */
  courtTruncationText: string;
}

/** 결과를 낸 노임 시점 입력. 결과 객체에 없으므로 화면 입력에서 받는다. */
export interface LaborRateTiming {
  calculationDate?: string;
  laborRateEffectiveRule?: LaborRateEffectiveRule;
  /** 자×부상 `base.courtTruncation`. 결과에 없어 화면이 넘긴다. */
  courtTruncation?: boolean;
}

/** "절사" 행 값. 화면·클립보드·PDF·CSV 공용. */
export const COURT_TRUNCATION_TEXT =
  "법원 계산 프로그램 방식 (노동능력상실률 % 소수 2자리, 누적 호프만 소수 4자리 버림)";

/** "노임 기준" 행 값. 화면·클립보드·PDF·CSV 공용. */
export function laborRateTimingText(timing: LaborRateTiming): string {
  const rule =
    timing.laborRateEffectiveRule === "survey" ? "조사 시점 (5/1·9/1)" : "공표 적용일 (1/1·9/1)";
  const date = timing.calculationDate ?? "없음 (사고일 단가 하나)";
  return `계산 기준일 ${date} · 노임 적용일 규약 ${rule}`;
}

type AnyCompensationResult = CompensationResult | CompensationAutoDeathResult;

/**
 * 과실상계·공제 뒤에 더한 위자료 (원). 위자료가 과실상계 대상 소계에 들어간 결과
 * (보험약관 기준 토글, 또는 그 방식으로 저장된 옛 `.lcalc` 결과)는 0 이다.
 *
 * 결과에는 토글 값이 없어서 소계 구성으로 판별한다: 소계가 위자료를 뺀 재산상 손해
 * (일실수입 + 기타손해 + 장례비)에 가까우면 위자료는 뒤에 더해진 것이다. 유족급여를
 * 수급권자별로 공제한 사망 결과는 소계가 상속인별 몫(원 미만 버림)의 합이라 몇 원 어긋날
 * 수 있어 같음이 아니라 어느 쪽에 더 가까운지로 판별한다.
 */
export function solatiumAddedAfterDeductionsWon(result: AnyCompensationResult): number {
  if (result.solatiumWon === 0) return 0;
  const lostIncome = result.industrialBenefit?.lostIncomeAfterWon ?? result.lostIncomeSubtotalWon;
  const funeral = "funeralExpenseWon" in result ? result.funeralExpenseWon : 0;
  const pecuniaryWithoutSolatium = lostIncome + (result.otherDamages?.subtotalWon ?? 0) + funeral;
  const gap = result.pecuniaryDamagesSubtotalWon - pecuniaryWithoutSolatium;
  return Math.abs(gap) < Math.abs(gap - result.solatiumWon) ? result.solatiumWon : 0;
}

/** 비율공제·지급치료비 중 재산상 손해를 넘어 빼지 않은 금액 행의 라벨. */
export const PROPERTY_ONLY_EXCESS_LABEL =
  "비율공제·지급치료비 중 재산상 손해 초과분 (위자료에서 빼지 않음)";

/**
 * 비율공제·지급치료비는 재산상 손해에만 대응해 남은 재산상 손해(과실상계 후 − 구 비율공제)
 * 까지만 뺀다 (위자료를 잠식하지 않는다). 소계가 그보다 크면 넘는 금액은 빼지 않는데, 그
 * 금액을 돌려준다. 화면은 이 금액을 양수 행으로 보여 행 합이 실제로 뺀 금액
 * (`propertyOnlyAppliedWon`)과 맞게 한다.
 *
 * 엔진이 준 `propertyOnlyDiscardedWon` 을 쓴다 (상속인별 계산은 몫마다 한도가 걸려 총액으로
 * 역산할 수 없다). 이 키가 없는 구 결과만 총액으로 역산한다.
 */
export function propertyOnlyExcessWon(result: AnyCompensationResult): number {
  const d = result.deductions;
  if (d.propertyOnlyDiscardedWon !== undefined) return d.propertyOnlyDiscardedWon;
  const propertyOnly = d.ratioSubtotalWon + (d.paidTreatmentSubtotalWon ?? 0);
  const room = Math.max(0, result.faultOffset.afterWon - (d.legacyRatioSubtotalWon ?? 0));
  return Math.max(0, propertyOnly - room);
}

export interface SolatiumSettlement {
  addedWon: number;
  deductionExcessWon: number;
  uncoveredExcessWon: number;
  /** 상속인별 계산: 전액공제 초과분 중 위자료로도 빼지 못해 버린 합 (되돌림 행). 총액 계산은 0. */
  heirExcessDroppedWon: number;
  /** 상속인별 계산: 상속분 나눗셈·상속인별 100원 미만 버림 차이 합 (빼는 행). 총액 계산은 0. */
  heirRoundingWon: number;
}

/** 상속인별 계산의 버린 초과분 행 라벨 (양수, 되돌림). */
export const HEIR_EXCESS_DROPPED_LABEL =
  "전액공제 초과분 중 위자료로도 빼지 못한 금액 (상속인별 0원 하한, 차감하지 않음)";
/** 상속인별 계산의 절사 차이 행 라벨 (음수). */
export const HEIR_ROUNDING_LABEL = "상속분 나눗셈·상속인별 100원 미만 버림";

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
  const d = result.deductions;
  if (d.roundingWon !== undefined) {
    // 유족급여 수급권자별(상속인별) 계산. 상속인마다 0원 하한이 걸려 총액의 "공제 후 0원 →
    // 초과분" 표시가 맞지 않는다. 엔진 항등식 최종액 = afterWon + 위자료 + 버린 초과분 − 절사
    // 차이를 그대로 행으로 낸다 (위자료에서 뺀 초과분은 afterWon 의 음수 몫에 이미 들어 있다).
    return {
      addedWon,
      deductionExcessWon: 0,
      uncoveredExcessWon: 0,
      heirExcessDroppedWon: d.absoluteExcessDroppedWon ?? 0,
      heirRoundingWon: d.roundingWon,
    };
  }
  if (addedWon === 0) {
    return {
      addedWon,
      deductionExcessWon: 0,
      uncoveredExcessWon: 0,
      heirExcessDroppedWon: 0,
      heirRoundingWon: 0,
    };
  }
  // 엔진의 공제 후 금액. 비율공제·지급치료비는 이미 재산상 손해 한도로 줄어 있어, 음수면
  // 전액공제(선급금 등)가 재산상 손해를 넘은 것이다.
  const excess = Math.max(0, -result.deductions.afterWon);
  const deductionExcessWon = Math.min(excess, addedWon);
  return {
    addedWon,
    deductionExcessWon,
    uncoveredExcessWon: excess - deductionExcessWon,
    heirExcessDroppedWon: 0,
    heirRoundingWon: 0,
  };
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
  // 엔진의 대체 처리 경고(직종 조사 중단, 호프만표 범위 초과 `hoffmanCoverageClamped` 등).
  // 문구는 엔진이 만든 한국어를 그대로 쓴다.
  const warnings: string[] = (result.warnings ?? []).map((warning) => warning.message);

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
        `개호비에 호프만 240 한도가 적용됐습니다. 향후개호 구간을 시작 시점 순으로 누적한 현가율이 ${attendantCappedAt + 1}번째 입력 구간에서 240에 닿아, 그 시점 이후 기간은 240 한도로 금액에 넣지 않았습니다.`,
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
  timing?: LaborRateTiming,
): T & WithExportWarnings {
  const settlement = solatiumSettlement(result);
  return {
    ...result,
    exportWarnings: buildCompensationExportWarnings(result),
    solatiumAddedWon: settlement.addedWon,
    deductionExcessWon: settlement.deductionExcessWon,
    deductionExcessLabel: deductionExcessLabel(settlement),
    propertyOnlyExcessWon: propertyOnlyExcessWon(result),
    laborRateTimingText: timing ? laborRateTimingText(timing) : "",
    courtTruncationText: timing?.courtTruncation ? COURT_TRUNCATION_TEXT : "",
  };
}
