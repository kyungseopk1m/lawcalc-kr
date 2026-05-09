/**
 * Public domain types for the lawcalc-kr interest calculation engine.
 *
 * 근거: 대법원 손해배상 등 계산프로그램 매뉴얼 (Interest.hwp / Calculator.hwp)
 * 공식 사이트: http://ejpc.scourt.go.kr/
 * 적용 조항: 민법 제379조 / 상법 제54조 / 소송촉진 등에 관한 특례법 제3조
 */

/** YYYY-MM-DD ISO 날짜. 시간/시간대 정보 없음. */
export type IsoDate = string;

export type LegalRateCode = "civil" | "commercial" | "promotion";

/**
 * 법정이율 프리셋. dropdown 매핑:
 * - "civil"      → 민법 제379조 (5%)
 * - "commercial" → 상법 제54조 (6%)
 * - "promotion"  → 소송촉진 등에 관한 특례법 제3조 (현행 12%)
 * - { customRate } → 사용자 직접 입력 (예: 0.04)
 */
export type LegalRatePreset = LegalRateCode | { customRate: number };

export interface RateSegment {
  /** 구간 시작일 (포함) */
  from: IsoDate;
  /** 구간 종료일 (포함) */
  to: IsoDate;
  /** 연이율 (예: 0.05 = 5%) */
  rate: number;
}

export interface CalcOptions {
  /**
   * - "period": 기간식 — 월/일 단위로 분할 후 합산 (법원 매뉴얼 기본)
   * - "totalDays": 총일수식 — 전체 일수에 대해 한 번에 계산
   */
  mode: "period" | "totalDays";
  /**
   * - "fixed365": 분모 365일 고정 (평년 기준)
   * - "actual": 실제 일수 반영 (윤년은 366일)
   */
  leapYear: "fixed365" | "actual";
  /** 초일 산입 여부. true면 시작일을 일수에 포함. */
  includeFirstDay: boolean;
  /**
   * 원 단위 끝수 처리. 미지정 시 "floor" (v1 default 와 동일).
   * - "floor": 절사 (채권자 보수, 매뉴얼 default)
   * - "ceil":  절상 (채무자 보수)
   * - "round": 사사오입
   *
   * 매뉴얼 매핑 — Calculator.hwp 의 끝수처리: 절사 / 절상 / 사사오입.
   */
  rounding?: "floor" | "ceil" | "round";
}

export interface InterestInput {
  /** 원금(원). 정수, 0 초과. */
  principal: number;
  /** 이자 기산일. */
  startDate: IsoDate;
  /** 종료일. startDate 이상이어야 함. */
  endDate: IsoDate;
  /**
   * 이자율 구간. 비어 있거나 생략하면 legalRatePreset이 startDate~endDate 전체에 적용된다.
   * 명시되면 startDate~endDate 안에서 분할 적용.
   */
  segments?: RateSegment[];
  /** 법정이율 프리셋. segments가 비어 있을 때 fallback으로 사용. */
  legalRatePreset?: LegalRatePreset;
  /** 계산 옵션. */
  options: CalcOptions;
  /** 자유 비고. PDF/CSV에 그대로 표시. */
  note?: string;
}

/** 계산 결과 한 구간. */
export interface InterestSegment {
  from: IsoDate;
  to: IsoDate;
  /** 옵션(초일 산입/윤년 처리)을 반영한 일수. */
  days: number;
  /** 적용된 연이율. */
  rate: number;
  /** 사람이 읽을 수 있는 적용 공식 (예: "1,000,000 × 0.05 × 30 / 365"). */
  formula: string;
  /** 해당 구간 이자(원). */
  interest: number;
}

/**
 * 이자 계산 최종 결과.
 *
 * `dataVersion`은 적용된 법정이율 데이터셋 버전 식별자다 (예: "legal-rates/v1.0.0").
 * 결과 재현성과 .lcalc 파일 호환성을 위해 항상 기록한다.
 */
export interface InterestResult {
  principal: number;
  segments: InterestSegment[];
  totalInterest: number;
  grandTotal: number;
  options: CalcOptions;
  dataVersion: string;
  /** ISO 8601 datetime (예: "2026-05-09T12:34:56+09:00"). */
  computedAt: string;
}
