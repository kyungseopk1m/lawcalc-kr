/**
 * 기타손해 compute 내부 공유 헬퍼.
 *
 * `monthsBetween` / `getCumulativeHoffman` 는 패키지 공용 `../internal` 의 단일 출처를
 * 그대로 재수출한다. 과거에는 여기에 복제본을 두어 부상·사망 compute 와 세 벌이 됐고,
 * coverage clamp 가 이 파일에만 적용되는 비대칭을 낳았다.
 */

import { getLaborRateAt, type LaborRatesDataset } from "@lawcalc-kr/datasets-compensation";
import type { HoffmanDataset } from "@lawcalc-kr/datasets-compensation";
import type { IsoDate } from "@lawcalc-kr/core-engine";

export { getCumulativeHoffman, getCumulativeHoffmanClamped, monthsBetween } from "../internal";

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
