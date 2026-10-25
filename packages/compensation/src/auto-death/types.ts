/**
 * Public domain types for the lawcalc-kr compensation (자×사망 손해배상) engine.
 *
 * 근거: 외부 reference 매뉴얼 (private). 적용 조항을 직접 명시한다.
 * 적용 조항: 민법 제393조 (손해배상의 범위) / 제396조 (과실상계) / 제763조 (불법행위 책임) /
 * 제1000조·제1003조·제1009조 (상속분) / 자동차손해배상 보장법 / 대법원 2018다248909 (가동연한 60→65세).
 *
 * 적용 범위: v0.6.0 자×사망 single slice (capability id `compensation@2`). 산재 / 기타손해 는 별 cycle.
 * 부상 전용 필드(입원치료 종료일·노동능력상실률·여명단축)는 사망 모드에서 제외된다.
 * 사망은 노동능력 100% 상실을 전제로 일실수입을 산정한 뒤 생계비를 공제한다.
 */

import type {
  IsoDate,
  InheritanceInput,
  InheritanceShare,
  STANDARD_DISCLAIMER,
} from "@lawcalc-kr/core-engine";
import type {
  CompensationAccidentType,
  CompensationClaimantRounding,
  CompensationDataVersions,
  CompensationDeductionsInput,
  CompensationDeductionsResult,
  CompensationFaultOffset,
  CompensationIndustrialBenefitResult,
  CompensationLostIncomeInput,
  CompensationSegment,
  Hoffman240CapTable,
} from "../auto-injury/types";
import type { OtherDamagesInput, OtherDamagesResult } from "../other-damages/types";
import type { CompensationWarning, LaborRateEffectiveRule } from "../internal";
import type {
  CompensationLifeExpectancyInput,
  LifeExpectancyResult,
} from "../life-expectancy/types";
import type { LostRetirementInput, LostRetirementResult } from "../lost-retirement/types";

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
  /**
   * 법원 예시 절사. default false (종전 결과 그대로). 일실수입에만 적용한다.
   * 누적 호프만 계수를 소수 4자리에서 버린 뒤 구간 계수 `H[끝] - H[시작]` 을 내고, 구간 금액은
   * `floor(월급여 × 계수 × (1 - 생계비비율))` 을 정수·분수로 정확히 계산한다 (생계비 1/3 은 정확히 2/3,
   * 생계비 공제 후 월소득을 먼저 버리지 않는다). 근거: 광주지법 1994. 7. 22. 선고 93가합9479
   * (54.0738 = 185.2966 - 131.2228, H[175] = 131.2228909 를 반올림하지 않고 버림).
   */
  courtTruncation?: boolean;
  /**
   * 원 미만 절사 시점. default false = 구간 금액을 마지막에 한 번 버린다 (종전 결과 그대로).
   * `true` 면 월급여에 계수(노동능력상실률, 생계비 공제 후 비율, 호프만 계수)를 하나씩 곱할 때마다
   * 원 미만을 버린다 (예: 사망 월급여 × 2/3 을 먼저 버린 뒤 × 호프만). 일실수입 구간 금액에만 적용한다.
   * 근거 판결을 찾지 못해 기본값으로 두지 않는다 (생계비 선절사 보류 결정).
   */
  truncateEachStep?: boolean;
}

/** 상속인 입력. inheritance 도메인 입력을 그대로 재사용한다 (1991-01-01 이후 사망 대상). */
export type CompensationHeirsInput = InheritanceInput;

/** 산재(사망) 보험급여 공제 입력. `accidentType === "industrial"` 일 때만 의미. */
export interface CompensationIndustrialInsuranceDeath {
  /**
   * 유족급여 (원, ≥ 0 정수). 일실수입(생계비 공제 후, 소극손해) 한도에서 과실상계 전에
   * 공제 (2021다241618 전합). default 0.
   */
  survivorBenefitWon?: number;
  /**
   * 유족급여 수급권자별 지급액. 지정하면 `heirs` 가 필요하고 `survivorBenefitWon` 은 쓰지 않는다.
   * 대법원 2009. 5. 21. 선고 2008다13104 전원합의체: 유족급여는 수급권자가 상속한 일실수입
   * 채권을 한도로 그 채권에서만 공제한다. `heirName` 이 없으면 (사실혼 배우자 등 상속인 아닌
   * 수급권자) 어느 상속인 몫에서도 공제하지 않는다. `heirName` 이 상속인 이름과 맞지 않으면 거부한다.
   * 장례비·위자료·전액공제는 상속분대로 나눈다 (고유 위자료·장례비 지출 원고 귀속은 `claimants`).
   */
  recipients?: CompensationSurvivorBenefitRecipient[];
  /**
   * 장의비(산업재해보상보험법 제71조 장례비 급여, 원, ≥ 0 정수). `claimants.funeralPayer` 가 있어야 한다.
   * 장례비를 지출한 원고의 장례비 손해(책임비율 반영 후)에서만 그 금액을 한도로 공제하고, 넘는 부분은
   * 다른 손해에서 빼지 않는다 (대법원 2022. 3. 24. 선고 2021다241618 전원합의체: 장의비는 장례비와만 대응).
   */
  funeralBenefitWon?: number;
}

/** 유족급여 수급권자 1명. */
export interface CompensationSurvivorBenefitRecipient {
  /** `heirs` 결과의 상속인 이름. 없으면 상속인 아닌 수급권자(공제 없음), 목록에 없는 이름은 거부. */
  heirName?: string;
  /** 지급액 (원, ≥ 0 정수). */
  survivorBenefitWon: number;
}

/**
 * 원고별 귀속 입력. 지정하면 판결의 원고별 계산 방식으로 바꾼다 (`heirs` 필요):
 * 망인 손해(재산상 손해 × 책임비율 - 공제 + 망인 위자료) = 상속대상, 상속인별 floor(상속대상 × 상속분)
 * (나머지 원은 배정하지 않는다), 여기에 고유 위자료와 장례비(지출한 원고)를 더한다.
 * 공제는 상속대상에서 뺀다. 비율공제·지급치료비는 재산상 손해 한도까지만, 전액공제는 모자라면 망인 위자료까지 깎는다.
 * 예: 서울중앙지법 2009. 7. 9. 선고 2008가단245503, 2005. 8. 3. 선고 2003가단361721.
 */
export interface CompensationDeathClaimantsInput {
  /**
   * 상속인별 고유 위자료. 목록에 없는 상속인은 0. 위자료라 책임비율을 곱하지 않는다
   * (보험약관 지급기준 `applyFaultToSolatium` 이면 floor(위자료 × (1 - 과실))).
   */
  ownSolatium?: CompensationClaimantSolatium[];
  /**
   * 상속인이 아닌 유족(예: 후순위 직계존속·형제자매·사실혼 배우자)의 고유 위자료. 결과 `otherClaimants` 행이 되고
   * `finalWon` 에 들어간다. 이름은 상속인 이름과 겹치면 안 된다. 과실 처리는 `ownSolatium` 과 같다.
   */
  otherClaimants?: CompensationDeathOtherClaimantInput[];
  /** 장례비를 지출한 상속인 이름. 미지정이면 장례비 손해도 상속분대로 나눈다. */
  funeralPayer?: string;
  /** 원고별 최종액 절사. default `"won"`. */
  finalRounding?: CompensationClaimantRounding;
}

/** 상속인이 아닌 유족 1명의 고유 위자료 입력. */
export interface CompensationDeathOtherClaimantInput {
  /** 원고 이름 (상속인 이름과 달라야 한다). */
  name: string;
  /** 위자료 (원, ≥ 0 정수). */
  solatiumWon: number;
}

/** 상속인이 아닌 유족 원고 1명의 결과 행. */
export interface CompensationDeathOtherClaimant {
  name: string;
  /** 고유 위자료 (원). 약관 기준이면 floor(입력 × (1 - 과실)), 아니면 입력 그대로. 절사 전. */
  solatiumWon: number;
  /** 최종액 (원). `solatiumWon` 에 `finalRounding` 적용. */
  amountWon: number;
}

/** 고유 위자료 1건. */
export interface CompensationClaimantSolatium {
  /** `heirs` 결과의 상속인 이름. */
  heirName: string;
  /** 위자료 (원, ≥ 0 정수). */
  solatiumWon: number;
}

/**
 * 자×사망 손해배상 입력.
 *
 * `mode: "death"` discriminator 로 부상 입력(`CompensationInput`)과 구분한다.
 * `accidentType === "industrial"` 이면 산×사망: 산식은 자×사망과 동일하되 유족급여를
 * 같은 성질의 손해인 일실수입에서 먼저 공제한 뒤 과실상계 한다 (대법원 2022. 3. 24.
 * 선고 2021다241618 전원합의체 — 위자료·장례비·기타손해는 잠식하지 않는다).
 */
export interface CompensationAutoDeathInput {
  mode: "death";
  /** 사건종류. default "auto" (자동차). */
  accidentType?: CompensationAccidentType;
  base: CompensationDeathBaseInput;
  lostIncome: CompensationLostIncomeInput;
  /** 생계비 공제 비율 (0~1). default 1/3. 일실수입에 `(1 - ratio)` 가 곱해진다. */
  livingCostDeductionRatio?: number;
  /** 장례비 (원, ≥ 0 정수). default 5,000,000. 적극손해로 과실상계 대상에 포함 (대법원 판례). */
  funeralExpenseWon?: number;
  /** 위자료 (유족 위자료, 원 ≥ 0 정수). default 0. */
  solatiumWon?: number;
  /** 과실비율 (0~1). default 0. */
  faultRatio?: number;
  /**
   * 보험약관 지급기준. `true` 면 위자료도 과실상계·비율공제 대상에 넣는다 (이전 동작).
   * default false: 위자료는 과실상계·공제 뒤에 그대로 더한다.
   */
  applyFaultToSolatium?: boolean;
  deductions?: CompensationDeductionsInput;
  /** 산재보험급여(유족급여). `accidentType === "industrial"` 일 때만 적용. */
  industrialInsurance?: CompensationIndustrialInsuranceDeath;
  /**
   * 기타손해(개호비·치료비·보조구). v0.8.0 `compensation@4`.
   * 미지정 시 기존 경로 byte-identical (회귀 0). 생계비공제 후 일실수입 + 장례비와 같이 과실상계 전 합산.
   */
  otherDamages?: OtherDamagesInput;
  /**
   * 상속인 입력 (선택). 지정 시 최종액을 상속분으로 분배한다.
   * `industrialInsurance.recipients` 를 함께 주면 상속인별로 계산하는데, 이때도 장례비·위자료·
   * 전액공제·비율공제는 상속분대로 나눈다. 고유 위자료와 장례비 지출 원고 귀속은 `claimants` 로 한다.
   */
  heirs?: CompensationHeirsInput;
  /** 원고별 귀속 (선택). 미지정이면 종전 계산 그대로. */
  claimants?: CompensationDeathClaimantsInput;
  /**
   * 기대여명 (선택, 표시용). 결과 `lifeExpectancy` 에만 실리고 금액은 바뀌지 않는다
   * (망인의 일실수입 기간은 여기서 기대여명으로 줄이지 않는다).
   */
  lifeExpectancy?: CompensationLifeExpectancyInput;
  /**
   * 일실퇴직금 (선택). 망인의 재산상 손해로 과실상계 전에 합산한다 (상속대상).
   * 사망은 노동능력 100% 상실이라 `lossRatePercent` 는 무시하고 100 으로 계산한다.
   */
  lostRetirement?: LostRetirementInput;
}

/**
 * 상속인(원고)별 분배 1건. 종전 방식은 floor 분배 + 잔여원 선순위 배정 결과다.
 * `claimants` 입력 시에는 원고별 귀속 결과이고 아래 원고별 항목이 함께 실린다.
 */
export interface CompensationInheritanceShare {
  /** 상속인 표시명. */
  name: string;
  /** 약분된 상속분 분자. */
  numerator: number;
  /** 약분된 상속분 분모. */
  denominator: number;
  /**
   * 배정 금액 (원, 정수). 합계는 finalWon 과 일치한다. `claimants` 입력 시에는 원고별 최종액
   * = `inheritedPecuniaryWon + inheritedSolatiumWon + ownSolatiumWon + funeralWon - funeralBenefitDeductedWon`
   * 에 `finalRounding` 을 적용한 값.
   */
  amountWon: number;
  /** 이 상속인 몫에서 공제한 유족급여 (원). `industrialInsurance.recipients` 입력 시에만 포함된다. */
  survivorBenefitDeductedWon?: number;
  /**
   * 상속한 재산상 손해 몫 (원). `claimants` 입력 시에만. floor(상속대상 × 상속분) 에서 위자료 몫을 뺀 값이고,
   * 유족급여 수급권자면 공제 후 과실상계로 줄어든 만큼 더 뺀다 (0 하한, 위자료 몫은 건드리지 않는다).
   */
  inheritedPecuniaryWon?: number;
  /** 상속한 망인 위자료 몫 = floor(공제 뒤 남은 망인 위자료 × 상속분) (원). `claimants` 입력 시에만. */
  inheritedSolatiumWon?: number;
  /** 고유 위자료 (원). `claimants` 입력 시에만. */
  ownSolatiumWon?: number;
  /** 장례비 손해(책임비율 반영 후, 장의비 공제 전, 원). `claimants` 입력 시에만. */
  funeralWon?: number;
  /** 장의비 공제 (원). `industrialInsurance.funeralBenefitWon` 입력 시 장례비 지출 원고 행에만. */
  funeralBenefitDeductedWon?: number;
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
  /** 일실수입 segment 목록 (단일 segment, 노동능력 100% 상실 전제 + 생계비 공제 반영). */
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
  /** 일실퇴직금 (원). `lostRetirement` 입력 시에만. 과실상계 대상 소계에 들어간다. */
  lostRetirementSubtotalWon?: number;
  /** 일실퇴직금 상세 (입력 시에만, 상실률 100). */
  lostRetirement?: LostRetirementResult;
  /** 기대여명 결과 (`lifeExpectancy` 입력 시에만, 표시용). */
  lifeExpectancy?: LifeExpectancyResult;
  /** 위자료 (원). */
  solatiumWon: number;
  /**
   * 산재보험급여 공제 (유족급여, 공제 후 과실상계 — 2021다241618 전합).
   * `accidentType === "industrial"` 일 때만 포함된다 (자동차 모드 키 생략 → 회귀 0).
   */
  industrialBenefit?: CompensationIndustrialBenefitResult;
  /**
   * 과실상계 대상 소계 = `일실수입 + otherDamagesSubtotalWon + lostRetirementSubtotalWon + funeralExpenseWon`
   * (`applyFaultToSolatium` 이면 `+ solatiumWon`).
   * 산재는 유족급여 공제 후 일실수입 (`industrialBenefit.lostIncomeAfterWon`) 기준.
   */
  pecuniaryDamagesSubtotalWon: number;
  /** 과실상계 결과. */
  faultOffset: CompensationFaultOffset;
  /** 장례비 (원). 적극손해로 과실상계 대상 소계에 포함 (대법원 판례). */
  funeralExpenseWon: number;
  /**
   * 공제 결과 (과실상계 후 base 에 적용). 공제 한도는 장례비를 뺀 재산상 손해다 (2026-10-25 결정):
   * 비율공제·지급치료비·구 비율공제는 그 한도를 넘는 몫을 버리고, 전액공제 초과분은 위자료만 깎는다.
   * 장례비 손해(과실상계 후)는 공제로 깎지 않는다.
   * - `afterWon`: 원고별 귀속이 없으면 장례비 뺀 공제 후 금액(음수 가능) + 장례비 손해. 초과가 없으면 종전 값과 같다.
   *   원고별 귀속이면 상속대상(장례비 제외)의 공제 후 금액이다.
   * - `solatiumReducedWon`·`absoluteExcessDroppedWon`: 총액 계산은 전액공제 초과가 있을 때만, 상속인별 계산(recipients)은 항상 싣는다.
   */
  deductions: CompensationDeductionsResult;
  /**
   * 최종 합계 = `max(0, 장례비 뺀 과실상계 후 - 공제 + 위자료) + 장례비 손해` → 100원 미만 절사 후 정수.
   * `claimants` 입력 시에는 원고별 최종액(상속인이 아닌 유족 행 포함)의 합 (상속분 곱의 원 미만 버림 때문에 상속대상보다 최대 상속인 수 - 1원 적을 수 있고, 장례비 지출 상속인을 정하지 않으면 장례비 쪽에서도 그만큼 더 적을 수 있다).
   */
  finalWon: number;
  /** 상속대상금액 = max(0, 재산상 손해 × 책임비율 - 공제 + 망인 위자료) (원). `claimants` 입력 시에만. */
  estateWon?: number;
  /**
   * 상속인이 아닌 유족 원고 행 (`claimants.otherClaimants` 입력 시에만). `finalWon` 은
   * `inheritanceShares` 와 이 행들의 `amountWon` 합이다.
   */
  otherClaimants?: CompensationDeathOtherClaimant[];
  /** 상속인별 분배 (heirs 입력 시에만). 합계 = finalWon (`otherClaimants` 가 있으면 그 합을 뺀 값). */
  inheritanceShares?: CompensationInheritanceShare[];
  /** 분배에 사용된 상속분 원본 (heirs 입력 시에만, transparency). */
  rawInheritanceShares?: InheritanceShare[];
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
