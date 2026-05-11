/**
 * Public domain types for the lawcalc-kr litigation-cost calculation engine.
 *
 * 근거: G1~G5 research notes 의 cross-validation 결과를 본 PR 1 의 type 으로 정합.
 * 적용 조항:
 *   - §1 Stamp Duty: 「민사소송 등 인지법」 제2조 (누진표) · 제3조 (항소 1.5, 상고 2) · 제7조 (지급명령 1/10, 화해 1/5) · 제16조 (전자소송 9/10)
 *   - §2 Delivery Fee: 「송달료규칙」 + 「송달료규칙의 시행에 따른 업무처리요령 (재일 87-4)」 별표 1
 *   - §3 Lawyer Fee: 「변호사보수의 소송비용 산입에 관한 규칙」 별표 + 제3조 · 제5조 · 제6조
 *   - §4 Case Types: 「사건별 부호문자의 부여에 관한 예규」 (재판예규 제1677호, 2017-12-21)
 *
 * 적용 시점: v0.3.0 = 현행 단일 슬라이스 (시기별 슬라이스는 PR 2/3/4 의 dataset history_note 로).
 */

import type { IsoDate } from "../types";

// ===== Shared =====

/**
 * 도메인 식별자. 소송비용 산정의 3 sub-domain.
 */
export type Domain = "stampDuty" | "deliveryFee" | "lawyerFee";

// ===== Stamp Duty (§1) =====
// 「민사소송 등 인지법」 + 「민사소송 등 인지규칙」

/**
 * 심급. 인지법 제3조 — 항소 1.5배, 상고 2배. 1심 = 1.0.
 */
export type AppealsLevel = "firstInstance" | "appeal" | "supreme";

/**
 * 인지대 누진표 한 구간. 누진 산식: amount = baseAmount + (caseValue - scopeStart) × rate.
 * scopeEnd null = 무한대 (마지막 구간, 인지법 제2조 제4호 "10억원 이상").
 */
export interface StampDutyBracket {
  name: string;
  sortOrder: number;
  scopeStart: number;
  scopeEnd: number | null;
  baseAmount: number;
  rate: number;
  rateText: string;
}

/**
 * 인지대 반올림 정책. 인지법 제2조 ②항 — 1,000원 미만은 1,000원 (floor), 1,000원 이상이면 100원 미만 절사.
 */
export interface StampDutyRoundingPolicy {
  floorMinimumWon: number;
  truncateBelowWon: number;
}

/**
 * 인지대 입력.
 *
 * 심급 + 특별절차 (지급명령/화해) + 전자소송 + 재심 prefix 조합.
 * G4 권고 옵션 2 (`isRetrial` flag) — 재심 prefix 는 case_type 폭발 대신 별도 flag 로 처리.
 */
export interface StampDutyInput {
  caseValue: number;
  caseType: CaseType;
  appealsLevel: AppealsLevel;
  isPaymentOrder?: boolean;
  isSettlement?: boolean;
  isElectronicFiling?: boolean;
  isRetrial?: boolean;
}

export interface StampDutyResult {
  amount: number;
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

// ===== Delivery Fee (§2) =====
// 「송달료규칙」 + 「재일 87-4」 별표 1

/**
 * 송달 횟수 산식. 사건구분별 4 종 분기 (G3 §2.4).
 *
 *   - `simplePerParty`: 민사 1심 합의/단독/소액/항소/상고, 가사 1심, 행정 1심, 조정 등.
 *     count = countPerParty × partyCount.
 *   - `partyOffsetTimesCount`: 부동산경매.
 *     count = (partyCount + partyOffset) × countPerParty.
 *   - `baseCountPlusCreditorMultiple`: 도산 (개인회생/파산).
 *     count = baseCount + creditorCount × creditorMultiple.
 *   - `range`: 항고/재항고. countMin ~ countMax 범위, 사용자 직접 입력.
 */
export type DeliveryFormula =
  | { kind: "simplePerParty"; countPerParty: number }
  | {
      kind: "partyOffsetTimesCount";
      countPerParty: number;
      partyOffset: number;
      partyBasis: "stakeholders";
    }
  | {
      kind: "baseCountPlusCreditorMultiple";
      baseCount: number;
      creditorMultiple: number;
    }
  | {
      kind: "range";
      countMin: number;
      countMax: number;
      partyBasis: "appellantPlusOpponent";
    };

/**
 * 송달 횟수 매트릭스 한 row. 「재일 87-4」 별표 1 의 사건구분별 row 1 개에 대응.
 */
export interface DeliveryCount {
  caseType: CaseType;
  labelKo: string;
  formula: DeliveryFormula;
}

export interface DeliveryFeeInput {
  caseType: CaseType;
  /** 당사자수. partyBasis 에 따라 의미 분기 (stakeholders / appellantPlusOpponent / parties). */
  partyCount: number;
  /** baseCountPlusCreditorMultiple 분기 전용. 도산 사건의 채권자수. */
  creditorCount?: number;
  /** range 분기 전용. 항고/재항고의 실제 송달 횟수 직접 입력. */
  customCount?: number;
  /** 회당 단가 override. 미지정 시 dataset 의 시기별 슬라이스 (filingDate 기준) 또는 현행 단가 사용. */
  perDeliveryUnitPriceWon?: number;
  /** 접수일 — 시기별 단가 슬라이스 분기용 (PR 3 wire-up). 미지정 시 dataset 의 현행 단가 사용. */
  filingDate?: IsoDate;
}

export interface DeliveryFeeResult {
  amount: number;
  deliveryCount: number;
  perDeliveryUnitPriceWon: number;
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

// ===== Lawyer Fee (§3) =====
// 「변호사보수의 소송비용 산입에 관한 규칙」

/**
 * 변호사보수 누진표 한 구간. 누진 산식 = 인지대와 동형 (baseAmount + (caseValue - scopeStart) × rate).
 * scopeEnd null = 마지막 구간 (8구간 "5억원 초과").
 */
export interface LawyerFeeBracket {
  name: string;
  sortOrder: number;
  scopeStart: number;
  scopeEnd: number | null;
  baseAmount: number;
  rate: number;
  rateText: string;
  label?: string;
}

/**
 * 심급별 적용 정책. 본 규칙 제3조 ①·③항 — 각 심급마다 별표 호출 (소가만 다르게).
 * 항소심/상고심 소가 = 상소로써 불복하는 범위 (제3조 ③항).
 *
 * G2 §4 cross-validation 결과 spec §3 의 "1심 보수 × 0.5 가산" 표현은 오류로 확정.
 * 본 type 으로 정책 명시.
 */
export type LawyerFeeAppealsRule = "perInstanceIndependent";

/**
 * 제5조 (보수 감액) 의 사유 라벨. 4 종 — 본 규칙 본문 단일이지만 사유 라벨로 산정 메타 보존.
 *
 *   - `admission`: 피고의 전부자백
 *   - `defaultAdmission`: 피고의 자백간주 (답변서 부제출 등)
 *   - `noOralHearing`: 무변론 판결
 *   - `orderForPerformance`: 이행권고결정 확정 (2020-12-28 이후 적용, 대법원규칙 제2936호)
 */
export type NoOralHearingReason =
  | "admission"
  | "defaultAdmission"
  | "noOralHearing"
  | "orderForPerformance";

/**
 * 변호사보수 감액/조정 옵션. G5 final 5 variant.
 *
 *   - `noOralHearingOrAdmission`: 제5조 (×0.5)
 *   - `provisionalCase`: 제3조 ②항 (×0.5 또는 ×1.0 — 변론·심문기일 분기)
 *   - `klac`: KLAC 약정보수액 cap (별표 × 0.42 default, 민·가사 한정)
 *   - `courtDiscretion`: 제6조 (감액 0.0~1.0, 증액 1.0~1.5)
 *   - `customPercent`: 본 규칙 외 합의/특약
 *
 * 누적 (compound) 적용 정책 — 본 규칙 본문 구조 (사건구분 × 종결 사유 의 직교 조합) 에서 도출.
 * 최종 multiplier 는 clamp 0.0 ~ 1.5 (제6조 ②항 cap).
 */
export type LawyerFeeDiscount =
  | { kind: "noOralHearingOrAdmission"; reason: NoOralHearingReason }
  | { kind: "provisionalCase"; hasOralHearing: boolean }
  | { kind: "klac" }
  | { kind: "courtDiscretion"; multiplier: number }
  | { kind: "customPercent"; rate: number };

export interface LawyerFeeInput {
  caseValue: number;
  caseType: CaseType;
  /** 감액/조정 옵션. 빈 배열 = 별표 그대로 (×1.0). 누적 (compound) 적용 + clamp 0.0~1.5. */
  discounts: LawyerFeeDiscount[];
  /**
   * KLAC 약정보수액 (의뢰인이 KLAC 와 계약한 약정 금액).
   * `klac` variant 사용 시 cap 으로 작용 — 별표 × (klacAgreedFeeWon / baseFeeWon).
   * 미지정 시 0.42 default (KLAC 정본 source).
   */
  klacAgreedFeeWon?: number;
  /** 접수일 — 시기별 슬라이스 분기용. PR 4 dataset 진입 시 wire-up. */
  filingDate?: IsoDate;
}

export interface LawyerFeeResult {
  amount: number;
  baseAmount: number;
  multiplier: number;
  /** clamp 전 누적 multiplier — `applyLawyerFeeDiscounts` 의 `rawMultiplier`. */
  rawMultiplier: number;
  /** clamp 0.0~1.5 적용 여부 — `applyLawyerFeeDiscounts` 의 `clamped`. */
  multiplierClamped: boolean;
  appliedDiscounts: LawyerFeeDiscount[];
  /** KLAC 적용 사건 범위 검증 결과 — 비차단 경고 (UI 측 노출용). */
  klacWarnings: KlacScopeWarning[];
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

/**
 * KLAC 적용 사건 범위 위반 경고. RangeError 비차단 — UI 측 경고 채널로 전달.
 *
 *   - `klacScopeNotCivilOrFamily`: KLAC variant 가 민·가사 외 사건구분에 적용됨
 *   - `klacScopeOverridden`: KLAC variant 와 다른 multiplier 가 누적되어 이중 감액 risk
 *
 * G5 §3.3 권고 — UI 측 경고로 노출, 차단 X.
 */
export interface KlacScopeWarning {
  caseType: CaseType;
  reason: "klacScopeNotCivilOrFamily" | "klacScopeOverridden";
  messageKo: string;
}

// ===== Case Types (§4) =====
// 「사건별 부호문자의 부여에 관한 예규」 (재판예규 제1677호, 2017-12-21)

/**
 * 사건구분 식별자. G4 권고 옵션 C — 13 variant (민사 + 가사 + 행정 + 보전 + 지급명령).
 *
 * 도산 (개인회생/파산 3 variant) 은 v0.3.1, 형사는 도메인 외 — 본 v0.3.0 미포함.
 */
export type CaseType =
  | "civilFirstInstanceCollegial"
  | "civilFirstInstanceSingle"
  | "civilSmallClaims"
  | "civilAppeal"
  | "civilSupremeAppeal"
  | "civilInterlocutoryAppeal"
  | "civilMediation"
  | "familyFirstInstanceCollegial"
  | "familyFirstInstanceSingle"
  | "administrativeFirstInstance"
  | "provisionalMeasureCollegial"
  | "provisionalMeasureSingle"
  | "paymentOrder";

/**
 * 사건구분 메타. caseCode / caseNameKo / appliedDomains / isCivilOrFamily lookup 의 source.
 * helpers.ts 의 함수들이 본 const 를 참조.
 */
export interface CaseTypeMeta {
  code: string;
  codeNumber: string;
  nameKo: string;
  appliedDomains: readonly Domain[];
  isCivilOrFamily: boolean;
}

/**
 * 사건구분 메타 lookup. 정본 source: 재판예규 제1677호.
 *
 * `appliedDomains` 결정 근거:
 *   - 본안 사건 (민사 1심·항소·상고, 가사 1심, 행정 1심): 3종 모두
 *   - 조정 (`civilMediation`): 3종 모두 — 보수는 제5조 modifier 영역
 *   - 항고/재항고 (`civilInterlocutoryAppeal`): 3종 모두 — 인지대 산식 별도 분기 (PR 2 engine 에서)
 *   - 보전 (카합/카단): 3종 모두 — 보수는 제3조 ②항 1/2 적용
 *   - 지급명령 (차): 인지 + 송달만 (실무상 보수 산입 외)
 *
 * `isCivilOrFamily` 결정 근거: KLAC 정본 source ("민·가사 사건 등") — 행정·보전·지급명령 default 미적용.
 */
export const CASE_TYPE_META: Readonly<Record<CaseType, CaseTypeMeta>> = {
  civilFirstInstanceCollegial: {
    code: "가합",
    codeNumber: "002",
    nameKo: "민사1심합의사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  civilFirstInstanceSingle: {
    code: "가단",
    codeNumber: "001",
    nameKo: "민사1심단독사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  civilSmallClaims: {
    code: "가소",
    codeNumber: "003",
    nameKo: "민사소액사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  civilAppeal: {
    code: "나",
    codeNumber: "004",
    nameKo: "민사항소사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  civilSupremeAppeal: {
    code: "다",
    codeNumber: "005",
    nameKo: "민사상고사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  civilInterlocutoryAppeal: {
    code: "라/마",
    codeNumber: "007/009",
    nameKo: "민사항고·재항고사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  civilMediation: {
    code: "머",
    codeNumber: "021",
    nameKo: "민사조정사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  familyFirstInstanceCollegial: {
    code: "드합",
    codeNumber: "151",
    nameKo: "가사1심합의사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  familyFirstInstanceSingle: {
    code: "드단",
    codeNumber: "150",
    nameKo: "가사1심단독사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: true,
  },
  administrativeFirstInstance: {
    code: "구",
    codeNumber: "033",
    nameKo: "행정1심사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  provisionalMeasureCollegial: {
    code: "카합",
    codeNumber: "071",
    nameKo: "민사가압류·가처분 등 합의사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  provisionalMeasureSingle: {
    code: "카단",
    codeNumber: "072",
    nameKo: "민사가압류·가처분 등 단독사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  paymentOrder: {
    code: "차",
    codeNumber: "012",
    nameKo: "독촉사건 (지급명령)",
    appliedDomains: ["stampDuty", "deliveryFee"],
    isCivilOrFamily: false,
  },
};

// ===== Top-level envelope (PR 5 wire-up) =====

/**
 * 소송비용 산정 envelope. PR 5 분배 모듈 진입 시 본 input 으로 인지/송달/변호사보수 + 분배 directive 통합.
 * 본 PR 1 에서는 type 만 정의, engine 미작성.
 */
export interface LitigationCostInput {
  stampDuty: StampDutyInput;
  deliveryFee: DeliveryFeeInput;
  lawyerFee: LawyerFeeInput;
}

export interface LitigationCostResult {
  stampDuty: StampDutyResult;
  deliveryFee: DeliveryFeeResult;
  lawyerFee: LawyerFeeResult;
  totalAmount: number;
  /** B11 단일 source — `STANDARD_DISCLAIMER` 그대로. */
  disclaimer: string;
  /** 도메인별 dataset 슬라이스 식별자. `.lcalc` envelope v3 의 `dataVersions` 에 그대로 hoist. */
  dataVersions: Record<string, string>;
  /** ISO 8601 datetime. */
  computedAt: string;
}
