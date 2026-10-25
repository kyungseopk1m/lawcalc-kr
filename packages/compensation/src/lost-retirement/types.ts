/**
 * 일실퇴직금 타입.
 *
 * 정년까지 근무했으면 받았을 퇴직금과 사고로 받게 된(받을) 퇴직금의 차이를 사고일 현가로 구한다.
 * 현가는 단리 일시금 호프만 계수 `1 / (1 + 0.05 × n/12)` 를 소수 4자리에서 버린 값이다.
 */

import type { IsoDate } from "@lawcalc-kr/core-engine";

/** 현가 방식. 법원 손해배상 프로그램의 ①②③. */
export type LostRetirementMethod =
  "presentValueMinusReceived" | "differenceDiscounted" | "bothDiscounted";

/**
 * 일실퇴직금 입력.
 * - `direct`: 금액을 그대로 쓴다.
 * - ① `presentValueMinusReceived`: floor(정년 퇴직금 × f(정년)) − 사고일(기수령) 퇴직금.
 * - ② `differenceDiscounted`: floor((정년 퇴직금 − 사고일 퇴직금) × f(정년)).
 * - ③ `bothDiscounted`: floor(정년 퇴직금 × f(정년)) − floor(사고일 퇴직금 × f(퇴직)).
 * 그 뒤 floor(× 상실률). 사망 손해배상에서는 `lossRatePercent` 를 무시하고 100 으로 계산한다.
 */
export type LostRetirementInput =
  | { method: "direct"; amountWon: number }
  | {
      method: LostRetirementMethod;
      /** 정년예정일 (마지막 근무일). */
      retirementDate: IsoDate;
      /** 정년예정일 기준 퇴직금 (원, ≥ 0 정수). */
      payAtRetirementWon: number;
      /** 사고일 또는 실제 퇴직일. 사고일 이상, 정년예정일 이하. */
      separationDate: IsoDate;
      /** 사고일 기준 퇴직금 또는 기수령 퇴직금 (원, ≥ 0 정수). */
      payAtSeparationWon: number;
      /** 노동능력상실률 (%, 0 초과 100 이하, 소수 둘째 자리까지). */
      lossRatePercent: number;
    };

export interface LostRetirementWarning {
  /** `negativeClamped`: 현가 차이가 음수라 0 으로 두었다. */
  code: "negativeClamped";
  message: string;
}

export interface LostRetirementResult {
  method: LostRetirementInput["method"];
  /** 사고일부터 정년예정일 다음 날까지 월수. `direct` 에는 없다. */
  retirementMonths?: number;
  /** 사고일부터 퇴직일까지 월수. ③ 에만. */
  separationMonths?: number;
  /** 정년 현가계수 (소수 4자리 절사). */
  retirementFactor?: number;
  /** 퇴직 현가계수 (소수 4자리 절사). ③ 에만. */
  separationFactor?: number;
  /** 정년 퇴직금 현가 (①③) 또는 차액 현가 (②) (원). */
  retirementPresentValueWon?: number;
  /** 퇴직 퇴직금 현가 (③) (원). */
  separationPresentValueWon?: number;
  /** 상실률 곱하기 전 금액 (원, 0 하한). */
  baseWon: number;
  /** 적용 상실률 (%). */
  lossRatePercent: number;
  /** 일실퇴직금 (원). */
  amountWon: number;
  /** 산식 설명 (한국어). */
  formulaText: string;
  warnings: LostRetirementWarning[];
}
