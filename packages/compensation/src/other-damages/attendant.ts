/**
 * 개호비(기왕 + 향후) 계산. 매뉴얼 제6조-가.
 *
 * - 기왕: 현가 산정 없이 `일당 × 총일수` (실지출 입력 시 `min`) × `(1 - 기왕증)`.
 * - 향후: 연금형 → 월개호비 `round(일당 × daysPerMonth) × 인원` × 연금현가율(호프만 240 cap) × `(1 - 기왕증)`.
 *   240 cap 은 개호 향후 segment 전체에서 시작 월수 순으로 누적 (일실수입과 별개 독립 풀).
 *   계산 기준일이 있으면 직종 단가 구간을 노임 변경일마다 나눈다 (일실수입과 같은 규칙).
 */

import type { IsoDate } from "@lawcalc-kr/core-engine";
import { applyHoffman240Cap } from "@lawcalc-kr/datasets-compensation";
import {
  dropUnchangedLaborRates,
  floorTimesComplements,
  laborRateChanges,
  laborRateDateAt,
} from "../internal";
import type { AttendantCareInput, AttendantCareResult } from "./types";
import {
  getCumulativeHoffmanClamped,
  monthsBetween,
  resolveDailyWage,
  type OtherDamagesContext,
} from "./internal";

// 매일 개호의 월 환산은 365/12 일이다. 광주고법(전주) 2016. 7. 21. 선고 2015나100421 의
// 월 개호비 2,636,699원 = 일용노임 86,686원 × 365/12 (외부 reference 매뉴얼 개호비 계산표도 같음).
const DEFAULT_ATTENDANT_DAYS_PER_MONTH = 365 / 12;

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
    pastWon += floorTimesComplements(base, [item.priorRatio ?? 0]);
  }

  // 2. 향후개호비: 연금형, 240 cap 을 향후 segment 전체에서 누적.
  // - 대법원 1985. 10. 22. 선고 85다카819: 단리연금현가율이 240 을 넘는 중간이자 공제기간의 현가는
  //   수치표상 현가율이 얼마인지 불문하고 240 을 적용한다(판결요지 나). 이 사건은 이어진 두 금액
  //   구간의 개호비에 240 을 넘는 현가율을 적용한 원심을 법리 오해로 파기했다. 그래서 입력 구간이
  //   달라도 합산한다.
  // - 대법원 1995. 2. 28. 선고 94다31334: 총기간이 414개월을 넘더라도 개호비를 청구하지 않는 기간을
  //   공제한 후의 현가율의 수치가 240 을 넘지 않는다면 그에 해당하는 수치를 적용하여 현가를 산정할
  //   수 있다고 했다. 이에 따라 빈 기간은 빼고 각 조각의 `H[끝] - H[시작]` 만 누적한다.
  // 개호 시작월이 늦으면 끝 월수가 480개월을 넘어도 합이 240 미만일 수 있어 표를 1,440개월까지 쓴다.
  // 조회는 일실수입과 같은 `getCumulativeHoffmanClamped` 다 (표 범위를 넘는 월수만 clamp 하는 안전장치).
  //
  // 계산 기준일이 있으면 직종 단가 구간을 노임 변경일마다 나누고, 나뉜 조각은 그 초일에 적용되는
  // 단가(기준일 이후면 기준일까지 공표된 마지막 단가)를 쓴다. 일당 직접 입력 구간은 나누지 않는다.
  // 기준일이 없으면 사고일 단가 하나.
  const changes =
    ctx.calculationDate === undefined
      ? []
      : laborRateChanges(
          ctx.laborRates,
          ctx.accidentDate,
          ctx.calculationDate,
          ctx.laborRateEffectiveRule,
        );
  const parts: { itemIndex: number; startMonth: number; endMonth: number; rateDate: IsoDate }[] =
    [];
  for (let i = 0; i < futureItems.length; i++) {
    const seg = futureItems[i]!;
    const split = changes.length > 0 && seg.directDailyWageWon === undefined;
    // 단가가 직전과 같은 변경일은 나누지 않는다 (직종이 뒤 조사에서 빠져 마지막 단가를 이어 쓸 때).
    const rateAt = (date: IsoDate) =>
      resolveDailyWage(
        ctx,
        seg.occupation,
        undefined,
        `개호비 향후[${i}]`,
        laborRateDateAt(changes, date, ctx.accidentDate),
      );
    const points = [
      seg.startDate,
      ...(split
        ? dropUnchangedLaborRates(
            changes.filter((c) => c.date > seg.startDate && c.date < seg.endDate),
            rateAt,
            seg.startDate,
          ).map((c) => c.date)
        : []),
      seg.endDate,
    ];
    for (let k = 0; k < points.length - 1; k++) {
      parts.push({
        itemIndex: i,
        startMonth: monthsBetween(ctx.accidentDate, points[k]!),
        endMonth: monthsBetween(ctx.accidentDate, points[k + 1]!),
        rateDate: split ? laborRateDateAt(changes, points[k]!, ctx.accidentDate) : ctx.accidentDate,
      });
    }
  }

  // 240 누적은 시작 월수 순(같으면 입력 순, 안정 정렬). 85다카819 는 240 을 넘는 뒤쪽 기간에
  // 240 을 적용하므로 입력 순서와 무관하게 시간상 뒤 조각이 잘린다.
  // 열린 질문: 시작월이 같은 겹치는 조각(동시 개호 2명 등)은 입력 순서에 따라 240 배분이 달라진다 (판례 근거 미확인).
  parts.sort((a, b) => a.startMonth - b.startMonth);
  const rawHoffmanList: number[] = [];
  for (const part of parts) {
    const raw =
      getCumulativeHoffmanClamped(ctx.hoffman, part.endMonth) -
      getCumulativeHoffmanClamped(ctx.hoffman, part.startMonth);
    rawHoffmanList.push(Math.max(0, raw));
  }
  const capResult = applyHoffman240Cap(rawHoffmanList);

  let futureWon = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const seg = futureItems[part.itemIndex]!;
    const dailyWage = resolveDailyWage(
      ctx,
      seg.occupation,
      seg.directDailyWageWon,
      `개호비 향후[${part.itemIndex}]`,
      part.rateDate,
    );
    const daysPerMonth = seg.daysPerMonth ?? DEFAULT_ATTENDANT_DAYS_PER_MONTH;
    // 365/12 환산은 원 미만이 생기므로 1인 월 개호비를 원 단위로 반올림한다 (매뉴얼 계산표 기준).
    // 정수 일수 입력은 반올림해도 값이 같다.
    const monthlyAttendant = Math.round(dailyWage * daysPerMonth) * seg.personCount;
    const appliedHoffman = capResult.appliedHoffman[i] as number;
    futureWon += Math.floor(monthlyAttendant * appliedHoffman * (1 - (seg.priorRatio ?? 0)));
  }
  // 표 범위를 넘어 clamp 된 조각이 240 한도 전이면 계수가 실제보다 작다. 한도가 그 조각이나
  // 그 앞에서 걸렸으면 clamp 해도 적용 계수가 같아 경고하지 않는다.
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k]!;
    const reduced = capResult.cappedAtIndex === null || capResult.cappedAtIndex > k;
    if (part.endMonth > ctx.hoffman.monthsCovered && reduced) {
      const label = `개호비 향후[${part.itemIndex}]`;
      const warnings = ctx.warnings ?? [];
      if (
        !warnings.some((w) => w.code === "hoffmanCoverageClamped" && w.message.startsWith(label))
      ) {
        warnings.push({
          code: "hoffmanCoverageClamped",
          message: `${label} 기간이 호프만표 범위(사고일부터 ${ctx.hoffman.monthsCovered}개월)를 넘어 그 뒤는 현가율에 넣지 못했습니다. 금액이 실제보다 적습니다.`,
        });
      }
    }
  }
  // cap 인덱스는 입력 구간 기준으로 돌려준다 (나뉜 조각 인덱스가 아니다).
  const cappedAtIndex =
    capResult.cappedAtIndex === null ? null : parts[capResult.cappedAtIndex]!.itemIndex;

  return {
    pastWon,
    futureWon,
    subtotalWon: pastWon + futureWon,
    hoffman240CappedAtIndex: cappedAtIndex,
  };
}
