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
import type { CompensationWarning, LaborRateEffectiveRule } from "../internal";

export type { CompensationWarning, LaborRateEffectiveRule } from "../internal";

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
  /**
   * 입원치료 종료일. 사고일 이상이어야 함.
   * 사고일부터 이 날까지(월 단위 내림)는 노동능력상실률 100% 로 일실수입을 계산한다
   * (`lossRate.hospitalizationFullLoss === false` 이면 적용하지 않는다).
   */
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
  /**
   * 계산 기준일(변론종결 예정일). 미지정이면 사고일 단가 하나 (이전 동작). 사고일 이상이어야 한다.
   * - 구간 분할: 사고일부터 이 날까지의 노임단가 변경일마다 일실수입 구간을 나눈다 (판결 이유의
   *   계산표, 예: 서울중앙지법 2020. 10. 21. 선고 2019나48259, 법원 손해배상 계산 프로그램 예시).
   *   직종 단가일 때만 나누며 일당 직접 입력은 나누지 않는다.
   * - 장래분 단가: 이 날 이후는 이 날까지 공표된 마지막 단가 (변론종결 당시의 일반노동임금,
   *   대법원 1995. 2. 28. 선고 94다31334).
   */
  calculationDate?: IsoDate;
  /**
   * 노임단가 적용일 규약. default `"published"`(공표 적용일 1/1·9/1).
   * `"survey"` 는 조사 시점(5/1·9/1)으로 같은 단가를 4개월 앞당긴다.
   */
  laborRateEffectiveRule?: LaborRateEffectiveRule;
}

/** 노동능력상실률 입력. 영구 + 한시 + 기왕증. */
export interface CompensationLossRateInput {
  permanent?: PermanentDisabilityInput[];
  temporary?: TemporaryDisabilityInput[];
  /** 기왕증 기여도 (0~1). default 0. 본 v0.5.0 정원 안에서는 deduction 산출에 사용 안 함 (별 항). */
  priorImpairmentRatio?: number;
  /**
   * 입원기간(사고일 ~ `base.treatmentEndDate`) 상실률 100% 적용 여부. default true.
   * `false` 면 입원기간에도 장해율을 적용한다 (이전 동작).
   * 입원기간 행에는 기왕증 기여도를 곱하지 않는다.
   */
  hospitalizationFullLoss?: boolean;
}

/** 일실수입 입력. occupation lookup 또는 directWageWon raw override. */
export interface CompensationLostIncomeInput {
  /**
   * 직종 식별자 (예: "보통인부"). `labor-rates/v1.1.0` dataset 의 slice 별 `rates` 키와 일치해야 한다.
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
  /**
   * 월 가동일수. 1~31 정수. default 20 (대법원 2024. 4. 25. 선고 2020다271650:
   * 도시 일용근로자의 월 가동일수를 20일을 초과하여 인정하기 어렵다).
   */
  workingDaysPerMonth?: number;
}

/**
 * 비율공제 항목 (법원 손해배상 계산 프로그램 방식).
 * 공제액 = `floor(amount × [1 - (1 - 기왕증)(1 - 과실)])`. 재산상 손해에서만 빼고 위자료를 잠식하지 않는다.
 */
export interface CompensationRatioDeduction {
  label?: string;
  /** 항목 금액 (원, ≥ 0 정수). */
  amount: number;
}

/**
 * 구 비율공제 (`compensation@4` 이하의 `ratio`). 공제액 = `floor(과실상계 후 금액 × Σ ratio)`.
 * 법원 산식 근거가 없어 새 입력에는 쓰지 않고, 저장 파일의 금액을 그대로 재현하기 위해 남긴다.
 */
export interface CompensationLegacyRatioDeduction {
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
  /** 비율공제 (항목 금액 × 기왕증·과실 계수). */
  ratio?: CompensationRatioDeduction[];
  /**
   * 지급치료비 (보험사가 직접 낸 치료비). 공제액 = `floor(amount × [1 - (1 - 기왕증)(1 - 과실)])`.
   * 이 금액을 기왕치료비에 넣지 않은 채 공제하는 방식이다 (서울고법 2022. 2. 18. 선고
   * 2020나2039267: 치료비 중 원고 과실비율 해당액 공제). 재산상 손해에서만 빼고 위자료를 잠식하지 않는다.
   */
  paidTreatment?: CompensationAbsoluteDeduction[];
  /** 전액공제 (선급금 등). 손해 전체 변제라 재산상 손해를 넘는 부분은 위자료에서 뺀다. */
  absolute?: CompensationAbsoluteDeduction[];
  /** 구 비율공제 (`compensation@4` 의 `ratio`). */
  legacyRatio?: CompensationLegacyRatioDeduction[];
}

/**
 * 사건종류. `"auto"` = 손해배상(자, 자동차) / `"industrial"` = 손해배상(산, 산업재해).
 *
 * 사건유형(부상/사망)과 직교한다. 산재는 자동차 산식과 동일하되 산재보험급여
 * (부상=장해급여 / 사망=유족급여) 를 같은 성질의 손해인 일실수입(소극손해)에서 **먼저 공제한 뒤
 * 과실상계** 한다 (대법원 2022. 3. 24. 선고 2021다241618 전원합의체 — "공제 후 과실상계",
 * 위자료·장례비·기타손해 등 다른 성질의 손해는 잠식하지 않는다).
 */
export type CompensationAccidentType = "auto" | "industrial";

/** 산재(부상) 보험급여 공제 입력. `accidentType === "industrial"` 일 때만 의미. */
export interface CompensationIndustrialInsuranceInjury {
  /**
   * 장해급여 (원, ≥ 0 정수). 일실수입(소극손해) 한도에서 과실상계 전에 공제 (2021다241618 전합).
   * default 0.
   */
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
  /**
   * 보험약관 지급기준. `true` 면 위자료도 과실상계·비율공제 대상에 넣는다 (이전 동작).
   * default false: 위자료는 과실상계·공제 뒤에 그대로 더한다 (재산상 손해 × (1 - 과실) - 공제 + 위자료).
   */
  applyFaultToSolatium?: boolean;
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
  /**
   * 구간 초일·말일 (판결 별지형 표용). `base.calculationDate` 를 지정했을 때만 포함된다.
   * 같은 월수에 겹친 경계는 가장 늦은 날짜를 초일로 쓴다.
   */
  startDate?: IsoDate;
  endDate?: IsoDate;
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
  /** 비율공제 소계 (항목별 floor 합, 재산상 손해 한도 적용 전). */
  ratioSubtotalWon: number;
  /** 지급치료비 공제 소계 (입력 시에만, 재산상 손해 한도 적용 전). */
  paidTreatmentSubtotalWon?: number;
  /** 구 비율공제 소계 (입력 시에만). */
  legacyRatioSubtotalWon?: number;
  /**
   * 비율공제·지급치료비 중 실제 공제된 합 (남은 재산상 손해 한도 적용 후, 상속인별 계산이면 상속인별 합).
   * 비율공제나 지급치료비 항목이 있을 때만 포함된다.
   */
  propertyOnlyAppliedWon?: number;
  /** 비율공제·지급치료비 중 재산상 손해 한도를 넘어 버린 합 (= 두 소계 합 - 실제 공제). */
  propertyOnlyDiscardedWon?: number;
  /**
   * 상속인별 계산(사망 `industrialInsurance.recipients`)일 때만: 전액공제 초과분이 위자료에서 빠진 합.
   * 최종액 = `afterWon + 위자료 + absoluteExcessDroppedWon - roundingWon`.
   */
  solatiumReducedWon?: number;
  /** 상속인별 계산일 때만: 전액공제가 위자료까지 넘어 버려진 합 (상속인 몫은 0 아래로 내려가지 않는다). */
  absoluteExcessDroppedWon?: number;
  /** 상속인별 계산일 때만: 상속분 나눗셈과 상속인별 100원 미만 절사로 생긴 차이 합. */
  roundingWon?: number;
  absoluteSubtotalWon: number;
  /**
   * legacy (≤ v0.9.x 저장 결과 표시 전용) — 과실상계 후 총액에서 차감하던 구 방식의
   * 산재보험급여. 신 결과는 이 키를 내보내지 않고 `CompensationResult.industrialBenefit`
   * (공제 후 과실상계, 2021다241618 전합) 을 사용한다. `.lcalc` 로 저장된 구 결과를
   * 그대로 렌더링하기 위해서만 유지.
   */
  industrialBenefitWon?: number;
  afterWon: number;
}

/**
 * 산재보험급여 공제 결과 (부상=장해급여 / 사망=유족급여).
 * `accidentType === "industrial"` 일 때만 포함된다.
 *
 * 대법원 2022. 3. 24. 선고 2021다241618 전원합의체 — 보험급여는 같은 성질의 손해
 * (일실수입=소극손해) 에서 **먼저 공제한 다음 과실상계** 하며("공제 후 과실상계"),
 * 다른 성질의 손해(위자료·장례비·기타손해)에서는 공제하지 않는다.
 */
export interface CompensationIndustrialBenefitResult {
  /** 입력한 보험급여 (원). */
  benefitWon: number;
  /** 실제 공제액 = `min(benefitWon, 일실수입 소계)` (원). 동질 손해 한도. */
  deductedWon: number;
  /** 공제 후 일실수입 = `일실수입 소계 - deductedWon` (원, ≥ 0). */
  lostIncomeAfterWon: number;
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
  /**
   * 산재보험급여 공제 (장해급여, 공제 후 과실상계 — 2021다241618 전합).
   * `accidentType === "industrial"` 일 때만 포함된다 (자동차 모드 키 생략 → 회귀 0).
   */
  industrialBenefit?: CompensationIndustrialBenefitResult;
  /**
   * 과실상계 대상 소계 = `일실수입 + otherDamagesSubtotalWon` (`applyFaultToSolatium` 이면 `+ solatiumWon`).
   * 산재는 산재보험급여 공제 후 일실수입 (`industrialBenefit.lostIncomeAfterWon`) 기준.
   */
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
  /**
   * 계산은 했지만 사용자가 알아야 할 대체 처리 (직종이 뒤 노임 조사에서 빠져 마지막 단가를 이어 씀,
   * 조사 시점 규약 단가가 없어 공표 단가를 씀). 있을 때만 포함된다.
   */
  warnings?: CompensationWarning[];
  /** B11 단일 source — `STANDARD_DISCLAIMER`. */
  disclaimer: typeof STANDARD_DISCLAIMER;
  /** ISO 8601 datetime. */
  computedAt: string;
}
