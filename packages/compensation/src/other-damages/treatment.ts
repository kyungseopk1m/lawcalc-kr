/**
 * 치료비(기왕 + 향후) + 보조구 계산. 매뉴얼 §6-나·다.
 *
 * - 기왕치료비: 현가 없음. `Σ 비용 × (1 - 기왕증)`.
 * - 향후(치료비 향후 / 보조구): 일시금형. 발생시점별 단리 일시금 현가계수 합 = "수치합계" → 20 cap →
 *   `비용 × cappedSum × (1 - 기왕증)`.
 *   - `kind === "oneTime"`: firstDate 단일 발생 (수치 1개).
 *   - `kind === "recurring"`: firstDate ~ lastDate 를 lifespanMonths 주기로 발생.
 *
 * 보조구는 치료비 향후와 동형이므로 동일 헬퍼(`computeFutureList`)를 재사용한다.
 */

import type { TreatmentFutureInput, TreatmentInput, TreatmentResult } from "./types";
import { applyValueSum20Cap, singlePaymentHoffman, VALUE_SUM_CAP } from "./caps";
import { monthsBetween, type OtherDamagesContext } from "./internal";

/** 향후 일시금 항목 1건의 수치합계(단리 현가계수 합) raw 값. */
function rawValueSum(item: TreatmentFutureInput, ctx: OtherDamagesContext): number {
  const firstMonth = monthsBetween(ctx.accidentDate, item.firstDate);
  if (item.kind === "oneTime") {
    return singlePaymentHoffman(Math.max(0, firstMonth));
  }
  // recurring: firstDate ~ lastDate 를 lifespanMonths 주기로 발생.
  const lastMonth = monthsBetween(ctx.accidentDate, item.lastDate);
  const lifespan = item.lifespanMonths as number; // validator 가 recurring 필수 보장.
  let sum = 0;
  for (let m = firstMonth; m <= lastMonth; m += lifespan) {
    sum += singlePaymentHoffman(Math.max(0, m));
    // 어차피 20 cap 으로 clip 되므로, 초과 시 조기 종료 (장기/이상 입력의 과도 루프 방지).
    if (sum > VALUE_SUM_CAP) break;
  }
  return sum;
}

/** 향후 일시금 항목 목록(치료비 향후 또는 보조구)의 합 + cap 발생 여부. */
function computeFutureList(
  items: readonly TreatmentFutureInput[],
  ctx: OtherDamagesContext,
): { futureWon: number; anyCapped: boolean } {
  let futureWon = 0;
  let anyCapped = false;
  for (const item of items) {
    const raw = rawValueSum(item, ctx);
    const cap = applyValueSum20Cap(raw);
    if (cap.capped) anyCapped = true;
    futureWon += Math.floor(item.costWon * cap.appliedSum * (1 - (item.priorRatio ?? 0)));
  }
  return { futureWon, anyCapped };
}

/** 치료비 항목이 비었으면 null 반환. */
export function computeTreatment(
  input: TreatmentInput,
  ctx: OtherDamagesContext,
): TreatmentResult | null {
  const pastItems = input.past ?? [];
  const futureItems = input.future ?? [];
  if (pastItems.length === 0 && futureItems.length === 0) {
    return null;
  }

  let pastWon = 0;
  for (const item of pastItems) {
    pastWon += Math.floor(item.costWon * (1 - (item.priorRatio ?? 0)));
  }

  const { futureWon, anyCapped } = computeFutureList(futureItems, ctx);

  return {
    pastWon,
    futureWon,
    subtotalWon: pastWon + futureWon,
    valueSum20Capped: anyCapped,
  };
}

/** 보조구 — 향후(일시금) 항목만. 비었으면 null 반환. */
export function computeAppliance(
  items: readonly TreatmentFutureInput[],
  ctx: OtherDamagesContext,
): TreatmentResult | null {
  if (items.length === 0) {
    return null;
  }
  const { futureWon, anyCapped } = computeFutureList(items, ctx);
  return {
    pastWon: 0,
    futureWon,
    subtotalWon: futureWon,
    valueSum20Capped: anyCapped,
  };
}
