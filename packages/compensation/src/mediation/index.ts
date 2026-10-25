/**
 * 조정 모드 보조 계산. 조정 시나리오의 책임비율 목록과, 조정안에 함께 적는 "사고일부터 조정일까지
 * 연 5% 이자를 더한 금액" 을 낸다. 시나리오 금액 자체는 과실비율만 바꿔 손해배상 엔진을 다시 돌린 값이다
 * (공제·위자료·상속분 절사가 기준 비율과 같은 경로로 계산되도록).
 *
 * 조정일은 이자 기간의 끝으로만 쓴다. 일실수입 현가(호프만)의 기준 시점은 사고일 그대로다.
 * 이자가 사고일부터 붙는 금액은 사고 당시 현가여야 하므로, 현가 기준을 조정일로 옮기면
 * 사고일~조정일 구간에서 중간이자 공제와 지연이자가 함께 빠지거나 겹친다.
 */

import type { IsoDate } from "@lawcalc-kr/core-engine";

import { computeDelayDamages } from "../delay-damages/compute";
import type { DelayDamagesDeps } from "../delay-damages/types";

/** 기본 가감 폭 (책임비율 %p). */
export const MEDIATION_DEFAULT_SPREAD_PERCENT = 5;

/**
 * 조정 시나리오 책임비율(%) 목록: `[기준, 기준 - 폭, 기준 + 폭]`. 기준 = `(1 - 과실비율) × 100` 을
 * % 소수 2자리로 맞춘 값. 0~100 밖이거나 기준과 같은 값은 뺀다.
 */
export function mediationResponsibilityPercents(
  faultRatio: number,
  spreadPercent: number = MEDIATION_DEFAULT_SPREAD_PERCENT,
): number[] {
  if (!Number.isFinite(spreadPercent) || spreadPercent < 0 || spreadPercent > 100) {
    throw new RangeError("조정 시나리오 계산 실패: 가감 폭은 0~100 사이여야 합니다.");
  }
  const base = Math.round((1 - faultRatio) * 10000) / 100;
  const out = [base];
  for (const p of [base - spreadPercent, base + spreadPercent]) {
    const pct = Math.round(p * 100) / 100;
    if (pct >= 0 && pct <= 100 && !out.includes(pct)) out.push(pct);
  }
  return out;
}

/** 책임비율(%)을 엔진 입력 과실비율로. `(100 - pct) / 100` 이라 85% 가 0.15 그대로 나온다. */
export function faultRatioOfResponsibilityPercent(pct: number): number {
  return (100 - pct) / 100;
}

export interface MediationInterestResult {
  /** 이자 (원, 원 미만 절사). 원금 0 이면 0. */
  interestWon: number;
  /** 원금 + 이자. */
  totalWon: number;
}

/**
 * 사고일부터 조정일까지 민법 연 5% 이자. 지연손해금 계산과 같은 방식(기간식, 초일 산입, 원 미만 절사,
 * `DELAY_DAMAGES_DEFAULT_OPTIONS`)이고 소송촉진 등에 관한 특례법 구간은 없다.
 */
export function computeMediationInterest(
  principalWon: number,
  accidentDate: IsoDate,
  mediationDate: IsoDate,
  deps?: DelayDamagesDeps,
): MediationInterestResult {
  if (principalWon <= 0) return { interestWon: 0, totalWon: principalWon };
  const r = computeDelayDamages(
    {
      principalWon,
      startDate: accidentDate,
      judgmentDate: mediationDate,
      endDate: mediationDate,
    },
    deps,
  );
  return { interestWon: r.totalInterest, totalWon: r.grandTotal };
}
