/**
 * Public domain types for the lawcalc-kr compensation (자×부상 손해배상) engine.
 *
 * 근거: 외부 reference 매뉴얼 (private). 적용 조항을 직접 명시한다.
 * 적용 조항: 민법 제393조 (손해배상의 범위) / 제396조 (과실상계) / 제763조 (불법행위 책임) /
 * 자동차손해배상 보장법 / 대법원 2018다248909 (가동연한 60→65세).
 *
 * 적용 범위: v0.5.0 자×부상 single slice. 자×사망 / 산재 / 기타손해 (개호비 등) 는 별 cycle.
 */

import type { STANDARD_DISCLAIMER, IsoDate, LegalRatePreset } from "@lawcalc-kr/core-engine";
import type { OtherDamagesInput, OtherDamagesResult } from "../other-damages/types";

/** 노동능력상실률 영구장해 항목. `ratio` 는 0~1. `department` 는 표시용. */
export interface PermanentDisabilityInput {
  /** 진료과 (예: "정형외과"). 표시용 라벨, 계산에 영향 없음. */
  department?: string;
  /** 노동능력상실률 (0~1). 0 거부, 1 거부. */
  ratio: number;
}

/** 노동능력상실률 한시장해 항목. `years` 동안 `ratio` 적용. */
export interface TemporaryDisabilityInput {
  department?: string;
  /** 한시장해 노동능력상실률 (0~1). */
  ratio: number;
  /** 한시장해 기간 (년). 양수 정수 또는 양수 실수 허용. */
  years: number;
}

/** 손해배상 기초사항. */
export interface CompensationBaseInput {
  /** 피해자 생년월일. */
  birthDate: IsoDate;
  /** 사고일자. */
  accidentDate: IsoDate;
  /** 입원치료 종료일. 사고일 이상이어야 함. v0.5.0 은 일실수입 segment 계산에 직접 영향 없음 (가동연한까지 segment). */
  treatmentEndDate: IsoDate;
  /** 성별. 가동연한 default + 향후 생명표 lookup. */
  sex: "male" | "female";
  /**
   * 가동연한 (만 나이, 정수).
   * default = 65 (대법원 2018다248909).
   * 사고일 기준 만 나이 + (retirementAge - currentAge) 가 가동연한 종료까지 잔여 기간.
   */
  retirementAge?: number;
  /** 법정이율 프리셋. default "civil" (호프만 5%/년 정합). */
  legalRatePreset?: LegalRatePreset;
}

/** 노동능력상실률 입력. 영구 + 한시 + 기왕증. */
export interface CompensationLossRateInput {
  permanent?: PermanentDisabilityInput[];
  temporary?: TemporaryDisabilityInput[];
  /** 기왕증 기여도 (0~1). default 0. 본 v0.5.0 정원 안에서는 deduction 산출에 사용 안 함 (별 항). */
  priorImpairmentRatio?: number;
}

/** 일실수입 입력. occupation lookup 또는 directWageWon raw override. */
export interface CompensationLostIncomeInput {
  /**
   * 직종 식별자 (예: "보통인부"). `labor-rates/v1.0.0` dataset 의 slice 별 `rates` 키와 일치해야 한다.
   * lookup miss 또는 dataset 단가 자체가 stale 한 경우 `directWageWon` 으로 fall through.
   */
  occupation?: string;
  /**
   * 사용자 raw 일당 override (원/일, 정수, 양수).
   * `occupation` 미지정이거나 dataset lookup 이 `undefined` 를 반환할 때 사용.
   */
  directWageWon?: number;
  /** 할인 방식. v0.5.0 = "hoffman" only. 라이프니츠는 v0.6+ wire-up 정원. */
  discountMethod?: "hoffman";
  /** 월 가동일수. default 22 (대법원 표준 일실수입 산정 정원). 1~31 정수. */
  workingDaysPerMonth?: number;
}

/** 비율공제 항목 (기왕증 + 과실비율 외 추가 비율공제). */
export interface CompensationRatioDeduction {
  label?: string;
  /** 0~1. */
  ratio: number;
}

/** 전액공제 항목 (치료비 / 선급금 등). */
export interface CompensationAbsoluteDeduction {
  label?: string;
  /** 원 단위 정수, ≥ 0. */
  amount: number;
}

export interface CompensationDeductionsInput {
  ratio?: CompensationRatioDeduction[];
  absolute?: CompensationAbsoluteDeduction[];
}

/**
 * 사건종류. `"auto"` = 손해배상(자, 자동차) / `"industrial"` = 손해배상(산, 산업재해).
 *
 * 사건유형(부상/사망)과 직교한다. 산재는 자동차 산식과 동일하되 공제 단계에
 * 산재보험급여(부상=장해급여 / 사망=유족급여) 1줄이 과실상계 후 추가 차감된다 (매뉴얼 §11).
 */
export type CompensationAccidentType = "auto" | "industrial";

/** 산재(부상) 보험급여 공제 입력. `accidentType === "industrial"` 일 때만 의미. */
export interface CompensationIndustrialInsuranceInjury {
  /** 장해급여 (원, ≥ 0 정수). 과실상계 후 전액 공제. default 0. */
  disabilityBenefitWon?: number;
}

/** 손해배상 입력. */
export interface CompensationInput {
  /** 사건종류. default "auto" (자동차). */
  accidentType?: CompensationAccidentType;
  base: CompensationBaseInput;
  lossRate: CompensationLossRateInput;
  lostIncome: CompensationLostIncomeInput;
  /** 위자료 (원, ≥ 0 정수). default 0. */
  solatiumWon?: number;
  /** 과실비율 (0~1). default 0. */
  faultRatio?: number;
  deductions?: CompensationDeductionsInput;
  /** 산재보험급여(장해급여). `accidentType === "industrial"` 일 때만 적용. */
  industrialInsurance?: CompensationIndustrialInsuranceInjury;
  /**
   * 기타손해(개호비·치료비·보조구). v0.8.0 `compensation@4`.
   * 미지정 시 기존 경로 byte-identical (회귀 0). 재산상 손해 pool 에 과실상계 전 합산.
   */
  otherDamages?: OtherDamagesInput;
}

/** 일실수입 segment 1건. */
export interface CompensationSegment {
  /** segment 시작 월수 (사고일 기준, 0-based 정수). */
  startMonth: number;
  /** segment 종료 월수 (사고일 기준, exclusive 의미상 H[end] - H[start] cumulative). */
  endMonth: number;
  /** 적용 lossRate (0~1). */
  lossRate: number;
  /** 일당 (원/일). */
  dailyWageWon: number;
  /** 월급여 (원/월, = dailyWage × workingDaysPerMonth). */
  monthlyWageWon: number;
  /** raw 호프만 (`H[endMonth] - H[startMonth]`, cap 미적용). */
  rawHoffman: number;
  /** 240 cap 적용 후 호프만. */
  appliedHoffman: number;
  /** segment 금액 = `monthlyWage × lossRate × appliedHoffman` 의 floor (원, 정수). */
  amountFloorWon: number;
}

export interface CompensationFaultOffset {
  ratio: number;
  beforeWon: number;
  afterWon: number;
}

export interface CompensationDeductionsResult {
  ratioSubtotalWon: number;
  absoluteSubtotalWon: number;
  /**
   * 공제된 산재보험급여 (부상=장해급여 / 사망=유족급여, 원).
   * `accidentType === "industrial"` 일 때만 포함된다 (자동차 모드는 키 생략 → 회귀 0).
   */
  industrialBenefitWon?: number;
  afterWon: number;
}

/** dataset 식별자 4종. `labor-rates/vX.Y.Z` 등. */
export interface CompensationDataVersions {
  laborRates: string;
  lifeExpectancy: string;
  hoffman: string;
  leibniz: string;
}

/** 240 cap 적용표 (segments 와 동일 길이). */
export interface Hoffman240CapTable {
  appliedHoffman: readonly number[];
  cappedAtIndex: number | null;
}

/** 손해배상 계산 결과. */
export interface CompensationResult {
  /**
   * 사건종류. `accidentType === "industrial"` 일 때만 포함된다.
   * 자동차 모드는 키 생략 → 기존 골든/`.lcalc` 결과 byte-identical (회귀 0).
   */
  accidentType?: CompensationAccidentType;
  /**
   * 최고 노동능력상실률 = 첫 segment lossRate (한시기간 포함 최고율).
   * 영구만 있을 때 = `1 - Π(1 - perm_i.ratio)`. transparency.
   */
  combinedLossRate: number;
  /** 일실수입 segment 목록. */
  segments: CompensationSegment[];
  /** 일실수입 소계 (segment amountFloorWon 합, 원). */
  lostIncomeSubtotalWon: number;
  /**
   * 기타손해 소계 (개호비+치료비+보조구, 원). `otherDamages` 입력 시에만 포함된다.
   * 미지정 시 키 생략 → 기존 골든/`.lcalc` byte-identical (회귀 0).
   */
  otherDamagesSubtotalWon?: number;
  /** 기타손해 상세 (입력 시에만, transparency). */
  otherDamages?: OtherDamagesResult;
  /** 위자료 (원). */
  solatiumWon: number;
  /** 과실상계 대상 소계 (위자료 포함) = `lostIncomeSubtotalWon + otherDamagesSubtotalWon + solatiumWon`. */
  pecuniaryDamagesSubtotalWon: number;
  /** 과실상계 결과. */
  faultOffset: CompensationFaultOffset;
  /** 공제 결과. */
  deductions: CompensationDeductionsResult;
  /** 최종 합계 = `max(0, deductions.afterWon)` → 100원 미만 절사 후 정수. */
  finalWon: number;
  /** 240 cap 적용표 (segments 와 동일 길이, transparency). */
  hoffman240Cap: Hoffman240CapTable;
  /** dataset 식별자 4종. */
  dataVersions: CompensationDataVersions;
  /** B11 단일 source — `STANDARD_DISCLAIMER`. */
  disclaimer: typeof STANDARD_DISCLAIMER;
  /** ISO 8601 datetime. */
  computedAt: string;
}
