/**
 * 판결 주문형 지연손해금. core-engine 이자 모듈(`resolveSegments`, `calculateInterest`,
 * `formatCourtDate`)과 법정이율 데이터셋을 재사용한다.
 *
 * 적용 조항: 민법 제379조 (연 5%), 소송촉진 등에 관한 특례법 제3조제1항과
 * 같은 항 본문의 법정이율에 관한 규정 (연 20% 2003. 6. 1. / 15% 2015. 10. 1. / 12% 2019. 6. 1. 시행).
 *
 * 소촉법 이율은 제1심 변론종결일에 시행 중인 이율 하나다. 이율 규정 개정령
 * (2015. 9. 25. 대통령령 제26553호, 2019. 5. 21. 제29768호) 부칙 제2조제1항은 시행 당시
 * 제1심 변론이 종결된 사건에 종전 이율을 유지하고, 같은 조 제2항은 변론 미종결 사건의
 * 시행일 전 발생분에만 종전 이율을 쓴다. 소촉법 구간은 선고일 다음 날부터라 언제나
 * 변론종결일보다 뒤이므로, 두 항을 합치면 구간 전체가 변론종결일 시점 이율이 된다.
 * 앞으로의 개정도 같은 경과조치를 둔다고 가정한다.
 */

import {
  addDays,
  calculateInterest,
  formatCourtDate,
  formatPercent,
  resolveSegments,
  type CalcOptions,
  type IsoDate,
  type LegalRateCode,
  type RateSegment,
} from "@lawcalc-kr/core-engine";

import type { DelayDamagesDeps, DelayDamagesInput, DelayDamagesResult } from "./types";
import { validateDelayDamagesInput } from "./validators";

/** 법원 이자계산 매뉴얼 방식. 불법행위 당일부터 지연손해금이 생기므로 초일 산입. */
export const DELAY_DAMAGES_DEFAULT_OPTIONS: CalcOptions = {
  mode: "period",
  leapYear: "actual",
  includeFirstDay: true,
  rounding: "floor",
};

export function lawSegments(
  principal: number,
  code: LegalRateCode,
  startDate: IsoDate,
  endDate: IsoDate,
  deps?: DelayDamagesDeps,
): RateSegment[] {
  return resolveSegments(
    {
      principal,
      startDate,
      endDate,
      legalRatePreset: code,
      options: DELAY_DAMAGES_DEFAULT_OPTIONS,
    },
    deps,
  );
}

/** 제1심 변론종결일(미입력 시 선고일)에 시행 중인 소촉법 이율. */
function promotionRate(
  input: Pick<DelayDamagesInput, "principalWon" | "judgmentDate" | "firstInstanceClosingDate">,
  deps?: DelayDamagesDeps,
): number {
  const closing = input.firstInstanceClosingDate ?? input.judgmentDate;
  return lawSegments(input.principalWon, "promotion", closing, closing, deps)[0]!.rate;
}

export function computeDelayDamages(
  input: DelayDamagesInput,
  deps?: DelayDamagesDeps,
): DelayDamagesResult {
  validateDelayDamagesInput(input);
  const { principalWon, startDate, judgmentDate, endDate } = input;
  const civilEnd = endDate < judgmentDate ? endDate : judgmentDate;
  const segments = lawSegments(principalWon, "civil", startDate, civilEnd, deps);
  if (endDate > judgmentDate) {
    segments.push({
      from: addDays(judgmentDate, 1),
      to: endDate,
      rate: promotionRate(input, deps),
    });
  }
  return calculateInterest(
    {
      principal: principalWon,
      startDate,
      endDate,
      segments,
      options: input.options ?? DELAY_DAMAGES_DEFAULT_OPTIONS,
    },
    deps,
  );
}

/**
 * 판결 주문형 문구. 예:
 * "289,813,253원 및 이에 대하여 2025. 3. 1.부터 2026. 9. 30.까지는 민법이 정한 연 5%,
 * 그 다음 날부터 다 갚는 날까지는 소송촉진 등에 관한 특례법이 정한 연 12%의 각 비율로 계산한 돈"
 *
 * 소촉법 이율은 `computeDelayDamages` 와 같은 규칙(제1심 변론종결일 시점 이율)이다.
 */
export function buildDelayDamagesOrderText(
  input: Pick<
    DelayDamagesInput,
    "principalWon" | "startDate" | "judgmentDate" | "firstInstanceClosingDate"
  >,
  deps?: DelayDamagesDeps,
): string {
  const { principalWon, startDate, judgmentDate } = input;
  validateDelayDamagesInput({ ...input, endDate: judgmentDate });
  const civil = lawSegments(principalWon, "civil", startDate, startDate, deps)[0]!;
  const principal = `${principalWon.toLocaleString("ko-KR")}원`;
  return (
    `${principal} 및 이에 대하여 ${formatCourtDate(startDate)}부터 ${formatCourtDate(judgmentDate)}까지는 ` +
    `민법이 정한 연 ${formatPercent(civil.rate)}, 그 다음 날부터 다 갚는 날까지는 ` +
    `소송촉진 등에 관한 특례법이 정한 연 ${formatPercent(promotionRate(input, deps))}의 각 비율로 계산한 돈`
  );
}
