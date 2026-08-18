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

/** 경고 문구를 실어 보내기 위해 export payload 에만 덧붙이는 필드. `.lcalc` 에는 저장하지 않는다. */
export interface WithExportWarnings {
  exportWarnings: string[];
}

type AnyCompensationResult = CompensationResult | CompensationAutoDeathResult;

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
      `일실수입에 호프만 240 한도가 적용됐습니다 — ${cappedAt + 1}번째 구간부터 누적 현가율을 240으로 제한해 금액이 줄었습니다.`,
    );
  }

  const other = result.otherDamages;
  if (other !== undefined) {
    const attendantCappedAt = other.attendantCare?.hoffman240CappedAtIndex;
    if (attendantCappedAt !== null && attendantCappedAt !== undefined) {
      warnings.push(
        `개호비에 호프만 240 한도가 적용됐습니다 — ${attendantCappedAt + 1}번째 구간부터 제한돼 금액이 줄었습니다.`,
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
  return { ...result, exportWarnings: buildCompensationExportWarnings(result) };
}
