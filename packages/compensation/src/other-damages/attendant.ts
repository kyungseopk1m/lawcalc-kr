/**
 * 개호비(기왕 + 향후) 계산. 매뉴얼 §6-가.
 *
 * - 기왕: 현가 산정 없이 `일당 × 총일수` (실지출 입력 시 `min`) × `(1 - 기왕증)`.
 * - 향후: 연금형 → 월개호비 `일당 × daysPerMonth × 인원` × 연금현가율(호프만 240 cap) × `(1 - 기왕증)`.
 *   240 cap 은 개호 향후 segment 전체에서 누적 (일실수입과 별개 독립 풀).
 */

import { applyHoffman240Cap } from "@lawcalc-kr/datasets-compensation";
import type { AttendantCareInput, AttendantCareResult } from "./types";
import {
  getCumulativeHoffman,
  monthsBetween,
  resolveDailyWage,
  type OtherDamagesContext,
} from "./internal";

const DEFAULT_ATTENDANT_DAYS_PER_MONTH = 30;

/** 개호비 항목이 비었으면 (기왕·향후 모두 없음) null 반환. */
export function computeAttendantCare(
  input: AttendantCareInput,
  ctx: OtherDamagesContext,
): AttendantCareResult | null {
  const pastItems = input.past ?? [];
  const futureItems = input.future ?? [];
  if (pastItems.length === 0 && futureItems.length === 0) {
    return null;
  }

  // 1. 기왕개호비 — 현가 없음.
  let pastWon = 0;
  for (let i = 0; i < pastItems.length; i++) {
    const item = pastItems[i]!;
    const dailyWage = resolveDailyWage(
      ctx,
      item.occupation,
      item.directDailyWageWon,
      `개호비 기왕[${i}]`,
    );
    const computed = dailyWage * item.totalDays;
    const base =
      item.actualSpentWon !== undefined ? Math.min(computed, item.actualSpentWon) : computed;
    pastWon += Math.floor(base * (1 - (item.priorRatio ?? 0)));
  }

  // 2. 향후개호비 — 연금형, 240 cap 을 향후 segment 전체에서 누적.
  // 종신 개호(예: 젊은 피해자 평생 개호)는 개호기간이 호프만표 coverage(480개월)를 넘을 수 있다.
  // coverage 로 clamp 한다 — 240 cap 이 이미 그 이전에 적용되므로 결과 영향 없음 + RangeError 방지.
  const maxMonth = ctx.hoffman.monthsCovered;
  const clampMonth = (m: number) => Math.max(0, Math.min(m, maxMonth));
  const rawHoffmanList: number[] = [];
  for (const seg of futureItems) {
    const startMonth = clampMonth(monthsBetween(ctx.accidentDate, seg.startDate));
    const endMonth = clampMonth(monthsBetween(ctx.accidentDate, seg.endDate));
    const raw =
      getCumulativeHoffman(ctx.hoffman, endMonth) - getCumulativeHoffman(ctx.hoffman, startMonth);
    rawHoffmanList.push(Math.max(0, raw));
  }
  const capResult = applyHoffman240Cap(rawHoffmanList);

  let futureWon = 0;
  for (let i = 0; i < futureItems.length; i++) {
    const seg = futureItems[i]!;
    const dailyWage = resolveDailyWage(
      ctx,
      seg.occupation,
      seg.directDailyWageWon,
      `개호비 향후[${i}]`,
    );
    const daysPerMonth = seg.daysPerMonth ?? DEFAULT_ATTENDANT_DAYS_PER_MONTH;
    const monthlyAttendant = dailyWage * daysPerMonth * seg.personCount;
    const appliedHoffman = capResult.appliedHoffman[i] as number;
    futureWon += Math.floor(monthlyAttendant * appliedHoffman * (1 - (seg.priorRatio ?? 0)));
  }

  return {
    pastWon,
    futureWon,
    subtotalWon: pastWon + futureWon,
    hoffman240CappedAtIndex: capResult.cappedAtIndex,
  };
}
