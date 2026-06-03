/**
 * 기타손해(개호비 + 치료비 + 보조구) 합산. 매뉴얼 §6-가·나·다.
 *
 * 호출자(auto-injury / auto-death compute)가 로드한 labor-rates / hoffman dataset + 사고일을
 * 컨텍스트로 주입한다. 결과 소계는 재산상 손해 pool 에 **과실상계 전** 합산된다.
 */

import type { OtherDamagesInput, OtherDamagesResult } from "./types";
import { computeAttendantCare } from "./attendant";
import { computeAppliance, computeTreatment } from "./treatment";
import type { OtherDamagesContext } from "./internal";
import { validateOtherDamagesInput } from "./validators";

export type { OtherDamagesContext } from "./internal";

/**
 * 기타손해 계산. 입력의 각 손해 항목이 비었으면 해당 결과 필드는 생략된다.
 * 세 항목 모두 비면 `subtotalWon = 0` + 상세 전부 생략 (회귀 0).
 */
export function computeOtherDamages(
  input: OtherDamagesInput,
  ctx: OtherDamagesContext,
): OtherDamagesResult | null {
  validateOtherDamagesInput(input, ctx.accidentDate);

  const attendant = input.attendantCare ? computeAttendantCare(input.attendantCare, ctx) : null;
  const treatment = input.treatment ? computeTreatment(input.treatment, ctx) : null;
  const appliance = input.appliance ? computeAppliance(input.appliance, ctx) : null;

  // 세 항목 모두 내용 없음(빈 `{}` 또는 빈 배열 포함) → null 반환.
  // 호출자(injury/death compute)는 이를 미입력과 동일하게 처리 → 결과 키 생략(회귀 0).
  // 회귀 0 보장을 UI 가 아닌 엔진 계약으로 끌어올린다 (수기 .lcalc / API 호출도 안전).
  if (attendant === null && treatment === null && appliance === null) {
    return null;
  }

  const attendantCareWon = attendant?.subtotalWon ?? 0;
  const treatmentWon = treatment?.subtotalWon ?? 0;
  const applianceWon = appliance?.subtotalWon ?? 0;

  return {
    attendantCareWon,
    treatmentWon,
    applianceWon,
    subtotalWon: attendantCareWon + treatmentWon + applianceWon,
    ...(attendant !== null ? { attendantCare: attendant } : {}),
    ...(treatment !== null ? { treatment } : {}),
    ...(appliance !== null ? { appliance } : {}),
  };
}
