/**
 * Public domain types for the lawcalc-kr compensation (자×사망 손해배상) engine.
 *
 * 근거: 외부 reference 매뉴얼 (private). 적용 조항을 직접 명시한다.
 * 적용 조항: 민법 제393조 (손해배상의 범위) / 제396조 (과실상계) / 제763조 (불법행위 책임) /
 * 제1000조·제1003조·제1009조 (상속분) / 자동차손해배상 보장법 / 대법원 2018다248909 (가동연한 60→65세).
 *
 * 적용 범위: v0.6.0 자×사망 single slice (capability id `compensation@2`). 산재 / 기타손해 는 별 cycle.
 * 부상 전용 필드(입원치료 종료일·노동력상실률·여명단축)는 사망 모드에서 제외된다.
 * 사망은 노동력 100% 상실을 전제로 일실수입을 산정한 뒤 생계비를 공제한다.
 */

import type {
  IsoDate,
  InheritanceInput,
  InheritanceShare,
  STANDARD_DISCLAIMER,
} from "@lawcalc-kr/core-engine";
import type {
  CompensationAccidentType,
  CompensationDataVersions,
  CompensationDeductionsInput,
  CompensationDeductionsResult,
  CompensationFaultOffset,
  CompensationLostIncomeInput,
  CompensationSegment,
  Hoffman240CapTable,
} from "../auto-injury/types";
import type { OtherDamagesInput, OtherDamagesResult } from "../other-damages/types";

/** 사망 손해배상 기초사항. 부상 모드와 달리 입원치료 종료일이 없다. */
export interface CompensationDeathBaseInput {
  /** 피해자(망인) 생년월일. */
  birthDate: IsoDate;
  /** 사고(사망)일자. */
  accidentDate: IsoDate;
  /** 성별. 가동연한 default. */
  sex: "male" | "female";
  /**
   * 가동연한 (만 나이, 정수).
   * default = 65 (대법원 2018다248909).
   */
  retirementAge?: number;
}

/** 상속인 입력. inheritance 도메인 입력을 그대로 재사용한다 (1991-01-01 이후 사망 대상). */
export type CompensationHeirsInput = InheritanceInput;

/** 산재(사망) 보험급여 공제 입력. `accidentType === "industrial"` 일 때만 의미. */
export interface CompensationIndustrialInsuranceDeath {
  /** 유족급여 (원, ≥ 0 정수). 과실상계·장례비 가산 후 전액 공제. default 0. */
  survivorBenefitWon?: number;
}

/**
 * 자×사망 손해배상 입력.
 *
 * `mode: "death"` discriminator 로 부상 입력(`CompensationInput`)과 구분한다.
 * `accidentType === "industrial"` 이면 산×사망: 산식은 자×사망과 동일하되 공제 단계에
 * 유족급여 1줄이 추가 차감된다 (매뉴얼 §11).
 */
export interface CompensationAutoDeathInput {
  mode: "death";
  /** 사건종류. default "auto" (자동차). */
  accidentType?: CompensationAccidentType;
  base: CompensationDeathBaseInput;
  lostIncome: CompensationLostIncomeInput;
  /** 생계비 공제 비율 (0~1). default 1/3. 일실수입에 `(1 - ratio)` 가 곱해진다. */
  livingCostDeductionRatio?: number;
  /** 장례비 (원, ≥ 0 정수). default 5,000,000. 과실상계 후 전액 가산. */
  funeralExpenseWon?: number;
  /** 위자료 (유족 위자료, 원 ≥ 0 정수). default 0. */
  solatiumWon?: number;
  /** 과실비율 (0~1). default 0. */
  faultRatio?: number;
  deductions?: CompensationDeductionsInput;
  /** 산재보험급여(유족급여). `accidentType === "industrial"` 일 때만 적용. */
  industrialInsurance?: CompensationIndustrialInsuranceDeath;
  /**
   * 기타손해(개호비·치료비·보조구). v0.8.0 `compensation@4`.
   * 미지정 시 기존 경로 byte-identical (회귀 0). 생계비공제 후 일실수입 + 위자료와 같이 과실상계 전 합산.
   */
  otherDamages?: OtherDamagesInput;
  /** 상속인 입력 (선택). 지정 시 최종액을 상속분으로 분배한다. */
  heirs?: CompensationHeirsInput;
}

/** 상속인별 분배 1건. floor 분배 + 잔여원 선순위 배정 결과. */
export interface CompensationInheritanceShare {
  /** 상속인 표시명. */
  name: string;
  /** 약분된 상속분 분자. */
  numerator: number;
  /** 약분된 상속분 분모. */
  denominator: number;
  /** 배정 금액 (원, 정수). 합계는 finalWon 과 일치한다. */
  amountWon: number;
}

/** 자×사망 손해배상 계산 결과. */
export interface CompensationAutoDeathResult {
  mode: "death";
  /**
   * 사건종류. `accidentType === "industrial"` 일 때만 포함된다.
   * 자동차 모드는 키 생략 → 기존 골든/`.lcalc` 결과 byte-identical (회귀 0).
   */
  accidentType?: CompensationAccidentType;
  /** 적용된 생계비 공제 비율. transparency. */
  livingCostDeductionRatio: number;
  /** 일실수입 segment 목록 (단일 segment, 노동력 100% 상실 전제 + 생계비 공제 반영). */
  segments: CompensationSegment[];
  /** 일실수입 소계 (생계비 공제 후, 원). */
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
  /** 재산상 손해 소계 = `lostIncomeSubtotalWon + otherDamagesSubtotalWon + solatiumWon`. */
  pecuniaryDamagesSubtotalWon: number;
  /** 과실상계 결과. */
  faultOffset: CompensationFaultOffset;
  /** 장례비 (원). 과실상계 후 전액 가산. */
  funeralExpenseWon: number;
  /** 공제 결과 (장례비 가산 후 base 에 적용). */
  deductions: CompensationDeductionsResult;
  /** 최종 합계 = `max(0, 과실상계 후 + 장례비 - 공제)` → 100원 미만 절사 후 정수. */
  finalWon: number;
  /** 상속인별 분배 (heirs 입력 시에만). 합계 = finalWon. */
  inheritanceShares?: CompensationInheritanceShare[];
  /** 분배에 사용된 상속분 원본 (heirs 입력 시에만, transparency). */
  rawInheritanceShares?: InheritanceShare[];
  /** 240 cap 적용표 (segments 와 동일 길이, transparency). */
  hoffman240Cap: Hoffman240CapTable;
  /** dataset 식별자 4종. */
  dataVersions: CompensationDataVersions;
  /** B11 단일 source — `STANDARD_DISCLAIMER`. */
  disclaimer: typeof STANDARD_DISCLAIMER;
  /** ISO 8601 datetime. */
  computedAt: string;
}
