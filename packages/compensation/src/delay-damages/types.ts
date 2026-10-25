/**
 * 판결 주문형 지연손해금 타입.
 *
 * 원금에 대하여 기산일(통상 불법행위일)부터 판결 선고일까지는 민법 제379조 연 5%,
 * 그 다음 날부터는 소송촉진 등에 관한 특례법 제3조 이율(제1심 변론종결일 시점, 데이터셋 연혁)을
 * 적용한다. 원고별 금액마다 따로 호출할 수 있도록 원금은 숫자 하나다.
 */

import type {
  CalcOptions,
  InterestResult,
  IsoDate,
  LegalRateDataset,
} from "@lawcalc-kr/core-engine";

export interface DelayDamagesInput {
  /** 원금(원). 양의 정수. */
  principalWon: number;
  /** 기산일. 통상 사고일(불법행위일). */
  startDate: IsoDate;
  /** 판결 선고일. 이 날까지 민법 이율, 다음 날부터 소송촉진 등에 관한 특례법 이율. */
  judgmentDate: IsoDate;
  /**
   * 제1심 변론종결일. 소촉법 이율은 이 날 시행 중인 이율이다 (이율 개정령 부칙 경과조치).
   * 미지정 시 `judgmentDate`. 변론종결은 선고보다 앞서거나 같으므로 선고일이 개정 시행일
   * 전이면 미지정이어도 판정이 같다.
   */
  firstInstanceClosingDate?: IsoDate;
  /** 계산 기준일(종료일). 선고일보다 앞서면 민법 구간만 계산한다. */
  endDate: IsoDate;
  /** 미지정 시 `DELAY_DAMAGES_DEFAULT_OPTIONS` (법원 이자계산 매뉴얼 방식, 초일 산입). */
  options?: CalcOptions;
}

/** `calculateInterest` 결과 그대로. 구간은 민법 구간 1개 + 소촉법 연혁 구간들. */
export type DelayDamagesResult = InterestResult;

export interface DelayDamagesDeps {
  /** 법정이율 데이터셋 주입. 미지정 시 core-engine 기본 데이터셋. */
  dataset?: LegalRateDataset;
}
