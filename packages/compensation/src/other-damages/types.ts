/**
 * Public domain types for the lawcalc-kr compensation 기타손해 (개호비·치료비·보조구) engine.
 *
 * 근거: 외부 reference 매뉴얼 (private) §6-가·나·다. 적용 조항을 직접 명시한다.
 * 적용 조항: 민법 제393조 (손해배상의 범위) / 제763조 (불법행위 책임).
 *
 * 적용 범위: v0.8.0 기타손해 (capability id `compensation@4`). 일실퇴직금(§6-라)은 deferred.
 * 부상·사망 양 경로 공통. 사건종류(자/산)·사건유형(부상/사망)과 독립한 손해 풀이다.
 *
 * 두 cap 의 자연 구분:
 * - 개호비 향후 = 연금형(매일 지속 발생) → 연금현가율 누적 + 호프만 240 cap.
 * - 치료비/보조구 향후 = 일시금형(주기적 일시 지출) → 단리 일시금 현가계수 합("수치합계") + 20 cap.
 */

import type { IsoDate } from "@lawcalc-kr/core-engine";

/** 기왕개호비 1건. 현가 산정 없이 일당 × 총일수 (실지출 입력 시 min 적용). */
export interface AttendantPastInput {
  /** 직종 (labor-rates 사고일 단가). occupation 또는 directDailyWageWon 중 하나 필요. */
  occupation?: string;
  /** 사용자 raw 일당 override (원/일, 양의 정수). */
  directDailyWageWon?: number;
  /** 총 개호일수 (양수). */
  totalDays: number;
  /** 실제지출 개호비 (원, ≥ 0 정수). 입력 시 `min(계산값, 실지출)` 적용 (매뉴얼 §6-가-(1)). */
  actualSpentWon?: number;
  /** 기왕증 기여도 (0~1). default 0. `(1 - priorRatio)` 곱. */
  priorRatio?: number;
}

/** 향후개호비 segment 1건 (기간별 인원). 연금형 → 호프만 240 cap (개호 항목 독립 풀). */
export interface AttendantFutureSegmentInput {
  occupation?: string;
  directDailyWageWon?: number;
  /** 개호 시작일 (사고일 이상). */
  startDate: IsoDate;
  /** 개호 종료일 (시작일 이상). */
  endDate: IsoDate;
  /** 인원 (예: 1 / 1.5 / 0.5). 양수. */
  personCount: number;
  /** 월 개호일수. default 30 (매일 개호 월환산). 1~31. */
  daysPerMonth?: number;
  /** 기왕증 기여도 (0~1). default 0. */
  priorRatio?: number;
}

/** 개호비 입력 (기왕 + 향후). */
export interface AttendantCareInput {
  past?: AttendantPastInput[];
  future?: AttendantFutureSegmentInput[];
}

/** 기왕치료비 1건. 현가 산정 없이 비용 × `(1 - 기왕증)`. */
export interface TreatmentPastInput {
  label?: string;
  /** 비용 (원, ≥ 0 정수). */
  costWon: number;
  /** 기왕증 기여도 (0~1). default 0. */
  priorRatio?: number;
}

/**
 * 향후치료비/보조구 1건. 일시금형 → 단리 일시금 현가계수 합 + 20 cap.
 *
 * - `kind === "oneTime"`: 단일 발생 (firstDate = lastDate, lifespanMonths 무시).
 * - `kind === "recurring"`: firstDate ~ lastDate 를 lifespanMonths 주기로 발생.
 */
export interface TreatmentFutureInput {
  label?: string;
  /** 1회 비용 / 보조구 단가 (원, ≥ 0 정수). */
  costWon: number;
  kind: "oneTime" | "recurring";
  /** 최초 필요일 (사고일 이상). */
  firstDate: IsoDate;
  /** 최종 필요일 (최초 이상). 1회성이면 최초와 동일. */
  lastDate: IsoDate;
  /** 반복 주기 (수명, 월). `kind === "recurring"` 일 때 필수 (양의 정수). */
  lifespanMonths?: number;
  /** 기왕증 기여도 (0~1). default 0. */
  priorRatio?: number;
}

/** 치료비 입력 (기왕 + 향후). */
export interface TreatmentInput {
  past?: TreatmentPastInput[];
  future?: TreatmentFutureInput[];
}

/** 기타손해 입력. 전부 optional — 미지정 시 회귀 0. */
export interface OtherDamagesInput {
  attendantCare?: AttendantCareInput;
  treatment?: TreatmentInput;
  /** 보조구. 치료비 향후(일시금)와 동형 (단가/필요일/수명/기왕증), 20 cap. */
  appliance?: TreatmentFutureInput[];
}

/** 수치합계 20 cap 적용 정보 (transparency). */
export interface ValueSumCapInfo {
  /** cap 전 수치합계 (단리 현가계수 합). */
  rawSum: number;
  /** cap 후 적용 수치합계. */
  appliedSum: number;
  /** cap 발생 여부 (UI 빨간 표시 trigger). */
  capped: boolean;
}

/** 개호비 결과 (transparency). */
export interface AttendantCareResult {
  /** 기왕개호비 합 (원). */
  pastWon: number;
  /** 향후개호비 합 (원, 240 cap 적용 후). */
  futureWon: number;
  /** 개호비 소계 (원). */
  subtotalWon: number;
  /** 향후개호비 240 cap 적용 segment 의 0-based 인덱스 (미적용 null). */
  hoffman240CappedAtIndex: number | null;
}

/** 치료비/보조구 결과 (transparency). */
export interface TreatmentResult {
  /** 기왕 합 (원). 보조구는 0. */
  pastWon: number;
  /** 향후 합 (원, 20 cap 적용 후). */
  futureWon: number;
  /** 소계 (원). */
  subtotalWon: number;
  /** 향후 항목 중 하나라도 수치합계 20 cap 이 적용됐는지 (UI 빨간 표시). */
  valueSum20Capped: boolean;
}

/** 기타손해 계산 결과. */
export interface OtherDamagesResult {
  /** 개호비 소계 (원). */
  attendantCareWon: number;
  /** 치료비 소계 (원). */
  treatmentWon: number;
  /** 보조구 소계 (원). */
  applianceWon: number;
  /** 기타손해 총계 = 개호비 + 치료비 + 보조구 (원). 재산상 손해 pool 에 과실상계 전 합산. */
  subtotalWon: number;
  /** 개호비 상세 (입력 시에만). */
  attendantCare?: AttendantCareResult;
  /** 치료비 상세 (입력 시에만). */
  treatment?: TreatmentResult;
  /** 보조구 상세 (입력 시에만). */
  appliance?: TreatmentResult;
}
