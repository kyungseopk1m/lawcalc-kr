/**
 * 치료비(기왕 + 향후) + 보조구 계산. 매뉴얼 제6조-나·다.
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

/**
 * 같은 지출을 두 항목으로 쪼갠 것으로 의심되는 조합을 찾는다 (계산은 바꾸지 않는다).
 *
 * 수치합계 상한(20)이 항목별로 걸리므로, 월 1회 30년 1건을 월 1회 15년
 * 2건으로 나누면 상한 여력이 두 배가 된다. 상한이 항목별인지 손해 항목 전체인지는 정책
 * 판단이 필요하고, 정당하게 분리된 항목(다른 부위·다른 치료)을 합산하면 그것대로 오답이
 * 되므로 감지만 하고 금액은 그대로 둔다.
 *
 * 오탐을 줄이려고 조건을 좁게 잡는다 — 같은 목록 안에서 (1) 둘 다 반복 지출이고
 * (2) `costWon` 과 `lifespanMonths` 가 동일하며 (3) 지출 기간이 겹치거나 한 주기 이내로
 * 인접할 때만이다.
 *
 * 겹침을 날짜 비교로 한 번에 본다. 종전에는 "기간이 완전히 같은 경우" 와 "`gap >= 0` 인
 * 인접" 두 갈래만 봤는데, 그 사이에 있는 **부분 겹침과 포함 관계**가 빠져나갔다
 * (`monthsBetween(a.lastDate, b.firstDate)` 가 음수라 인접 조건에 걸리지 않는다).
 * 완전 일치는 겹침의 특수한 경우라 따로 볼 필요가 없다.
 */
function detectSplitSuspicion(items: readonly TreatmentFutureInput[]): boolean {
  const recurring = items.filter((item) => item.kind === "recurring");
  for (let i = 0; i < recurring.length; i++) {
    for (let j = 0; j < recurring.length; j++) {
      if (i === j) continue;
      const a = recurring[i]!;
      const b = recurring[j]!;
      if (a.costWon !== b.costWon || a.lifespanMonths !== b.lifespanMonths) continue;
      // ISO 날짜는 사전순 비교가 곧 시간순 비교다. 완전 일치·부분 겹침·포함을 모두 덮는다.
      if (a.firstDate <= b.lastDate && b.firstDate <= a.lastDate) return true;
      const lifespan = a.lifespanMonths as number;
      const gap = monthsBetween(a.lastDate, b.firstDate);
      if (gap >= 0 && gap <= lifespan) return true;
    }
  }
  return false;
}

/** 향후 일시금 항목 목록(치료비 향후 또는 보조구)의 합 + cap 발생 여부. */
function computeFutureList(
  items: readonly TreatmentFutureInput[],
  ctx: OtherDamagesContext,
): { futureWon: number; anyCapped: boolean; splitSuspected: boolean } {
  let futureWon = 0;
  let anyCapped = false;
  for (const item of items) {
    const raw = rawValueSum(item, ctx);
    const cap = applyValueSum20Cap(raw);
    if (cap.capped) anyCapped = true;
    futureWon += Math.floor(item.costWon * cap.appliedSum * (1 - (item.priorRatio ?? 0)));
  }
  return { futureWon, anyCapped, splitSuspected: detectSplitSuspicion(items) };
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

  const { futureWon, anyCapped, splitSuspected } = computeFutureList(futureItems, ctx);

  return {
    pastWon,
    futureWon,
    subtotalWon: pastWon + futureWon,
    valueSum20Capped: anyCapped,
    ...(splitSuspected ? { splitSuspected: true } : {}),
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
  const { futureWon, anyCapped, splitSuspected } = computeFutureList(items, ctx);
  return {
    pastWon: 0,
    futureWon,
    subtotalWon: futureWon,
    valueSum20Capped: anyCapped,
    ...(splitSuspected ? { splitSuspected: true } : {}),
  };
}
