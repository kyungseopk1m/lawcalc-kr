/**
 * 기타손해 compute 내부 공유 헬퍼.
 *
 * `monthsBetween` / `getCumulativeHoffman` 는 auto-injury·auto-death compute 와 동일 정원을
 * 재구현한다 (모듈 자급, 동일 산식 보장 — 부상·사망 일실수입과 같은 월수/현가율 기준).
 */

import {
  getHoffmanAt,
  getLaborRateAt,
  type HoffmanDataset,
  type LaborRatesDataset,
} from "@lawcalc-kr/datasets-compensation";
import type { IsoDate } from "@lawcalc-kr/core-engine";

/** `H[0] = 0` 정원 보강 (일실수입 compute 와 동일). */
export function getCumulativeHoffman(dataset: HoffmanDataset, month: number): number {
  if (month === 0) return 0;
  return getHoffmanAt(dataset, month);
}

/** 두 ISO 날짜 사이의 calendar month floor 차이 (일실수입 compute 와 동일 정원). */
export function monthsBetween(from: IsoDate, to: IsoDate): number {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return months;
}

/** 기타손해 계산 컨텍스트 — 호출자(injury/death compute)가 로드한 dataset + 사고일 주입. */
export interface OtherDamagesContext {
  accidentDate: IsoDate;
  laborRates: LaborRatesDataset;
  hoffman: HoffmanDataset;
}

/**
 * 일당 단가 해소. `directDailyWageWon` override 우선, 없으면 labor-rates 사고일 단가.
 * lookup miss 시 RangeError (UI 측에서 directDailyWageWon override 노출).
 */
export function resolveDailyWage(
  ctx: OtherDamagesContext,
  occupation: string | undefined,
  directDailyWageWon: number | undefined,
  label: string,
): number {
  if (directDailyWageWon !== undefined) {
    return directDailyWageWon;
  }
  if (occupation === undefined) {
    throw new RangeError(
      `기타손해 계산 실패: ${label} 의 occupation 또는 directDailyWageWon 중 하나는 필요합니다.`,
    );
  }
  const rate = getLaborRateAt(ctx.laborRates, occupation, ctx.accidentDate);
  if (rate === undefined) {
    throw new RangeError(
      `기타손해 계산 실패: ${label} 의 직종 "${occupation}" 단가를 사고일 ${ctx.accidentDate} 기준으로 찾을 수 없습니다. 일당을 직접 입력해 주세요.`,
    );
  }
  return rate;
}
