/**
 * Public domain types for the lawcalc-kr litigation-cost calculation engine.
 *
 * 근거: G1~G5 research notes 의 cross-validation 결과를 본 PR 1 의 type 으로 정합.
 * 적용 조항:
 *   - 제1조 Stamp Duty: 「민사소송 등 인지법」 제2조 (누진표) · 제3조 (항소 1.5, 상고 2) · 제7조 (지급명령 1/10, 화해 1/5) · 제16조 (전자소송 9/10)
 *   - 제2조 Delivery Fee: 「송달료규칙」 + 「송달료규칙의 시행에 따른 업무처리요령 (재일 87-4)」 별표 1
 *   - 제3조 Lawyer Fee: 「변호사보수의 소송비용 산입에 관한 규칙」 별표 + 제3조 · 제5조 · 제6조
 *   - 제4조 Case Types: 「사건별 부호문자의 부여에 관한 예규」 (재판예규 제1677호, 2017-12-21)
 *
 * 적용 시점: v0.3.0 = 현행 단일 슬라이스 (시기별 슬라이스는 PR 2/3/4 의 dataset history_note 로).
 */

import type { IsoDate } from "../types";

// ===== Shared =====

/**
 * 도메인 식별자. 소송비용 산정의 3 sub-domain.
 */
export type Domain = "stampDuty" | "deliveryFee" | "lawyerFee";

// ===== Stamp Duty (제1조) =====
// 「민사소송 등 인지법」 + 「민사소송 등 인지규칙」

/**
 * 심급. 인지법 제3조 — 항소 1.5배, 상고 2배. 1심 = 1.0.
 */
export type AppealsLevel = "firstInstance" | "appeal" | "supreme";

/**
 * 인지대 구간 (인지법 제2조 제1항). 산식: amount = caseValue × rate + baseAmount —
 * **소가 전체**에 구간 요율을 곱하고 보정 상수를 더하는 연속 보정식이다 (변호사보수
 * 별표의 "…까지 부분" 구간별 누진식과 다름). scopeStart/scopeEnd 는 구간 매칭 전용.
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
 * 인지대 반올림 정책. 인지법 제2조 제2항 — 1,000원 미만은 1,000원 (floor), 1,000원 이상이면 100원 미만 절사.
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
  /**
   * 보전처분(가압류·가처분, caseType `provisionalMeasure*`) 인지 분기. 근거는 인지법 제9조 제2항.
   *   - `general` (기본): 가압류·다툼대상 가처분 = 정액 1만원.
   *   - `provisionalStatus`: 임시의 지위를 정하기 위한 가처분 = 본안 인지액의 1/2 (상한 50만원).
   * 보전 사건구분이 아닌 경우 무시된다. 미지정 시 `general` 로 간주.
   */
  provisionalMeasureType?: "general" | "provisionalStatus";
  /**
   * 소가 산정 기준 (「민사소송 등 인지규칙」제18조의2).
   *
   *   - `"amount"` (기본): `caseValue` 를 그대로 소가로 쓴다.
   *   - `"unascertainable"`: 소가를 산출할 수 없는 재산권상의 소 / 비재산권을 목적으로 하는
   *     소송 → 소가 5천만원으로 간주. 이때 `caseValue` 는 무시된다.
   *   - `"unascertainableHighTier"`: 위 중 규칙 제15조 제1항부터 제3항까지·제15조의2·제17조의2·제18조에
   *     정한 소송(회사관계·특허·무체재산권 등) → 1억원으로 간주.
   *
   * 이 필드가 없던 동안 비재산권 소송에 소가 0 을 넣으면 인지액이 1,000원(하한)으로
   * 나왔다 (정답 230,000원).
   */
  caseValueBasis?: "amount" | "unascertainable" | "unascertainableHighTier";
  /**
   * 항고·재항고(라/마) 전용. 인지법 제11조 제1항 대상일 때 원신청서에 붙인 인지액.
   *
   * 제9조·제10조 신청에 관한 재판에 대한 항고는 "해당 신청서에 붙인 인지액의 2배"라
   * 원신청서 금액을 알아야 한다. 미지정 시 제11조 제2항의 2천원 정액을 적용한다.
   * 다른 사건구분에서는 무시된다.
   */
  underlyingApplicationStampDutyWon?: number;
  /**
   * 항소·상고 사건의 **전체 소가**. 계산에는 쓰지 않는다.
   *
   * 「민사소송 등 인지규칙」제25조에 따라 상소심 인지액은 불복 범위를 기준으로 산정하므로
   * 그 사건의 `caseValue` 는 불복 범위다. 그러면 전체 소가가 어디에도 남지 않아 `.lcalc` 을
   * 다시 열었을 때 복원할 수 없고, 심급을 1심으로 되돌리면 불복 범위를 소가로 착각해 조용히
   * 과소 계산된다. 그 유실을 막기 위한 보존용 필드다.
   */
  fullCaseValue?: number;
  /**
   * 접수일 — 전자소송 감액 (제16조) 적용 여부 분기.
   * 제16조 시행일 (dataset `electronicFilingDiscount.effectiveFrom`, 2011-10-19) 이전 접수는
   * 감액 미적용. 미지정 시 현행 사건으로 간주해 감액을 적용한다 (송달료 슬라이스와 동일 정책).
   */
  filingDate?: IsoDate;
}

/**
 * 청구취지 확장(청구변경신청) 인지액 입력. 인지법 제5조.
 *
 * 소가는 변경 전·후 두 값을 받는다. 심급은 제5조 고지가 제1심·제2심만 정하므로 두 값뿐이다.
 */
export interface ClaimAmendmentInput {
  caseType: CaseType;
  appealsLevel: "firstInstance" | "appeal";
  /** 변경 전 청구의 소가. `beforeStampDutyWon` 을 직접 넣으면 무시된다. */
  beforeCaseValue: number;
  /** 변경 후 청구의 소가. */
  afterCaseValue: number;
  /**
   * 변경 전 청구에 관하여 **실제로 납부한** 인지액. 제5조 문언이 "납부한 인지액" 이라,
   * 소가에서 역산한 값과 실제 납부액이 다를 때 (일부 면제·구조 결정 등) 이 값이 우선한다.
   */
  beforeStampDutyWon?: number;
  isElectronicFiling?: boolean;
  filingDate?: IsoDate;
}

export interface ClaimAmendmentResult {
  /** 추가로 붙일 인지액. 청구가 감축되면 0. */
  amount: number;
  /** 변경 후 청구 인지액 (종이 기준, 심급 배수 반영). */
  afterAmount: number;
  /** 변경 전 청구 인지액 (종이 기준). */
  beforeAmount: number;
  /** 전자소송 감액 적용 전 차액. */
  differenceAmount: number;
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

export interface StampDutyResult {
  amount: number;
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

// ===== Delivery Fee (제2조) =====
// 「송달료규칙」 + 「재일 87-4」 별표 1

/**
 * 송달 횟수 산식. 사건구분별 4 종 분기 (G3 제2조.4).
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
  | {
      kind: "simplePerParty";
      countPerParty: number;
      /**
       * 임시의 지위를 정하는 가처분일 때의 1인당 회수. 보전처분(카합/카단) 전용.
       *
       * 별표 1 은 같은 부호에 "가압류, 가처분사건 3회" 와 "임시의 지위를 정하는 가처분사건
       * 8회" 를 별도 행으로 둔다. 사건구분을 나누면 인지법 제9조 제2항 분기로 이미 있는
       * `provisionalMeasureType` 과 같은 개념이 두 군데로 갈리므로, 그 필드를 그대로 쓴다.
       * 미지정 사건구분에서는 `provisionalMeasureType` 이 와도 무시된다.
       */
      provisionalStatusCountPerParty?: number;
    }
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
    }
  | {
      kind: "perPartyPlusExtra";
      countPerParty: number;
      /** 가산분의 의미 라벨. 재산조회(카조) 의 "우편 조회대상 기관수" 처럼 당사자수와 별개인 가산 항목. */
      extraBasis: "inquiredInstitutions";
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
  /**
   * 보전처분(카합/카단) 전용. 인지대의 `StampDutyInput.provisionalMeasureType` 과 같은 값을 쓴다.
   * `provisionalStatus` 면 별표 1 의 "임시의 지위를 정하는 가처분사건" 행(8회)을 적용한다.
   * 미지정 시 `general` 로 간주.
   */
  provisionalMeasureType?: "general" | "provisionalStatus";
  /**
   * perPartyPlusExtra 분기 전용 가산분. 재산조회(카조) 의 "우편에 의하여 재산조회를 실시하는
   * 조회대상 기관의 수". 미지정 시 0 으로 간주한다 (기관 가산 없음).
   */
  extraCount?: number;
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

// ===== Lawyer Fee (제3조) =====
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
 * 심급별 적용 정책. 본 규칙 제3조 제1항·제3항 — 각 심급마다 별표 호출 (소가만 다르게).
 * 항소심/상고심 소가 = 상소로써 불복하는 범위 (제3조 제3항).
 *
 * G2 제4조 cross-validation 결과 spec 제3조 의 "1심 보수 × 0.5 가산" 표현은 오류로 확정.
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
  "admission" | "defaultAdmission" | "noOralHearing" | "orderForPerformance";

/**
 * 변호사보수 감액/조정 옵션. G5 final 5 variant.
 *
 *   - `noOralHearingOrAdmission`: 제5조 (×0.5)
 *   - `provisionalCase`: 제3조 제2항 (본문 ×0.5 / 신청사건 변론·심문 미거침이면 단서로 산입 불가 ×0)
 *   - `koreaLegalAid`: 대한법률구조공단 약정보수액 cap (별표 × 0.42 default, 민·가사 한정)
 *   - `courtDiscretion`: 제6조 (감액 0.0~1.0, 증액 1.0~1.5)
 *   - `customPercent`: 본 규칙 외 합의/특약
 *
 * 누적 (compound) 적용 정책 — 본 규칙 본문 구조 (사건구분 × 종결 사유 의 직교 조합) 에서 도출.
 * 최종 multiplier 는 clamp 0.0 ~ 1.5 (제6조 제2항 cap).
 */
export type LawyerFeeDiscount =
  | { kind: "noOralHearingOrAdmission"; reason: NoOralHearingReason }
  /**
   * 제3조 제2항. 본문은 보전 사건에 별표 산정액의 1/2 을 적용하고, 단서는 신청사건에 한해
   * 변론이나 심문을 거친 경우에만 산입하도록 제한한다. 이의·취소 신청사건은 단서 대상이 아니다.
   *
   * `applicationKind` 미지정은 신청사건으로 본다. `hasOralHearing` 미지정은 단서를 확인하지
   * 못한 상태라 본문만 적용한다 (×0.5). 신청사건에서 `false` 면 산입할 수 없어 ×0 이다.
   */
  | {
      kind: "provisionalCase";
      applicationKind?: "application" | "objectionOrCancellation";
      hasOralHearing?: boolean;
    }
  | { kind: "koreaLegalAid" }
  | { kind: "courtDiscretion"; multiplier: number }
  | { kind: "customPercent"; rate: number };

export interface LawyerFeeInput {
  caseValue: number;
  caseType: CaseType;
  /** 감액/조정 옵션. 빈 배열 = 별표 그대로 (×1.0). 누적 (compound) 적용 + clamp 0.0~1.5. */
  discounts: LawyerFeeDiscount[];
  /**
   * 대한법률구조공단 약정보수액 (의뢰인이 대한법률구조공단과 계약한 약정 금액).
   * `koreaLegalAid` variant 사용 시 cap 으로 작용 — 별표 × (koreaLegalAidAgreedFeeWon / baseFeeWon).
   * 미지정 시 0.42 default (대한법률구조공단 정본 source).
   */
  koreaLegalAidAgreedFeeWon?: number;
  /**
   * 지급보수액. 당사자가 보수계약으로 지급하였거나 지급할 실제 보수액이다 (본 규칙 제3조 제1항).
   * 소송비용에 산입되는 보수는 지급보수액의 범위 내에서 별표 기준으로 산정하므로, 지정 시
   * 최종 산입액 = min(별표 산정액, agreedFeeWon) 으로 cap 한다. 미지정 시 결과는 별표 상한액이며
   * 실제 산입액이 아니다. formulaText 로 그 사실을 따로 고지한다 (감사 F2).
   */
  agreedFeeWon?: number;
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
  /** 대한법률구조공단 적용 사건 범위 검증 결과 — 비차단 경고 (UI 측 노출용). */
  koreaLegalAidWarnings: KoreaLegalAidScopeWarning[];
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

/**
 * 대한법률구조공단 적용 사건 범위 위반 경고. RangeError 비차단 — UI 측 경고 채널로 전달.
 *
 *   - `koreaLegalAidScopeNotCivilOrFamily`: 대한법률구조공단 variant 가 민·가사 외 사건구분에 적용됨
 *   - `koreaLegalAidScopeOverridden`: 대한법률구조공단 variant 와 다른 multiplier 가 누적되어 이중 감액 risk
 *
 * G5 제3조.3 권고 — UI 측 경고로 노출, 차단 X.
 */
export interface KoreaLegalAidScopeWarning {
  caseType: CaseType;
  reason: "koreaLegalAidScopeNotCivilOrFamily" | "koreaLegalAidScopeOverridden";
  messageKo: string;
}

// ===== Case Types (제4조) =====
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
  | "paymentOrder"
  // 민사집행 (「민사집행법」 사건). 전자소송 소송비용계산 '민사집행' 탭 기준.
  | "executionAssetDisclosure"
  | "executionDebtorRegister"
  | "executionAssetInquiry"
  | "executionRealEstateAuction"
  | "executionClaimAttachment"
  | "executionOther"
  // 도산 (「채무자 회생 및 파산에 관한 법률」 사건). 전자소송 '회생파산' 탭 기준.
  | "rehabilitationIndividual"
  | "bankruptcyIndividual"
  | "bankruptcyDischarge"
  | "rehabilitationCorporate"
  | "insolvencyClaimDetermination"
  // 가사 (본안 1심 외). 전자소송 '가사' 탭 기준.
  | "familyRuiPetition"
  | "familyMaPetition"
  | "familyAppeal"
  | "familySupremeAppeal"
  | "familyMediation"
  | "familyInterlocutoryAppeal"
  | "familyApplication"
  // 행정 (1심 외). 전자소송 '행정' 탭 기준.
  | "administrativeAppeal"
  | "administrativeSupremeAppeal"
  | "administrativeInterlocutoryAppeal"
  | "administrativeApplication"
  // 특허. 전자소송 '특허' 탭 기준.
  | "patentFirstInstance"
  | "patentSupremeAppeal"
  | "patentInterlocutoryAppeal"
  | "patentApplication"
  // 과태료 · 비송. 전자소송 '과태료' / '비송' 탭 기준.
  | "fineObjection"
  | "nonContentious";

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
 *   - 보전 (카합/카단): 3종 모두 — 보수는 제3조 제2항 1/2 적용
 *   - 지급명령 (차): 인지 + 송달만 (실무상 보수 산입 외)
 *
 * `isCivilOrFamily` 결정 근거: 대한법률구조공단 정본 source ("민·가사 사건 등") — 행정·보전·지급명령 default 미적용.
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

  // ===== 민사집행 (전자소송 '민사집행' 탭). 인지대는 「민사집행법」·「민사접수서류에 붙일 인지액」
  // 예규가 정하는 정액이라 본 dataset 의 누진 산식 대상이 아니다 → deliveryFee 만 적용. =====
  executionAssetDisclosure: {
    code: "카명",
    codeNumber: "201",
    nameKo: "재산명시사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  executionDebtorRegister: {
    code: "카불",
    codeNumber: "236",
    nameKo: "채무불이행자명부 등재·말소사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  executionAssetInquiry: {
    code: "카조",
    codeNumber: "212",
    nameKo: "재산조회사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  executionRealEstateAuction: {
    code: "타경",
    codeNumber: "013",
    nameKo: "부동산등 경매사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  executionClaimAttachment: {
    code: "타채",
    codeNumber: "200",
    nameKo: "채권등 집행사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  executionOther: {
    code: "타기",
    codeNumber: "014",
    nameKo: "기타 집행사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },

  // ===== 도산 (전자소송 '회생파산' 탭). 인지대는 「채무자 회생 및 파산에 관한 법률」의 정액. =====
  rehabilitationIndividual: {
    code: "개회",
    codeNumber: "253",
    nameKo: "개인회생사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  bankruptcyIndividual: {
    code: "하단",
    codeNumber: "210",
    nameKo: "개인파산사건 (파산선고)",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  bankruptcyDischarge: {
    code: "하면",
    codeNumber: "214",
    nameKo: "면책사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  rehabilitationCorporate: {
    code: "회합/회단",
    codeNumber: "292/291",
    nameKo: "일반회생·법인회생·법인파산사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  insolvencyClaimDetermination: {
    code: "회확",
    codeNumber: "293",
    nameKo: "채권조사확정재판사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },

  // ===== 가사 본안 1심 외 (전자소송 '가사' 탭). 인지대는 「가사소송수수료규칙」 소관이라
  // 본 dataset 의 「민사소송 등 인지법」 누진 산식과 근거 규칙이 다르다 → deliveryFee 만 적용. =====
  familyRuiPetition: {
    code: "느단",
    codeNumber: "162",
    nameKo: "가사비송 라류사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },
  familyMaPetition: {
    code: "느합",
    codeNumber: "163",
    nameKo: "가사비송 마류사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },
  familyAppeal: {
    code: "르",
    codeNumber: "024",
    nameKo: "가사항소사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },
  familySupremeAppeal: {
    code: "므",
    codeNumber: "025",
    nameKo: "가사상고사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },
  familyMediation: {
    code: "너",
    codeNumber: "029",
    nameKo: "가사조정사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },
  familyInterlocutoryAppeal: {
    code: "브/스",
    codeNumber: "026/027",
    nameKo: "가사항고·재항고사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },
  familyApplication: {
    code: "즈단/즈합",
    codeNumber: "177/178",
    nameKo: "가사신청사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: true,
  },

  // ===== 행정 1심 외 (전자소송 '행정' 탭). =====
  administrativeAppeal: {
    code: "누",
    codeNumber: "034",
    nameKo: "행정항소사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  administrativeSupremeAppeal: {
    code: "두",
    codeNumber: "035",
    nameKo: "행정상고사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  administrativeInterlocutoryAppeal: {
    code: "루/무",
    codeNumber: "036/133",
    nameKo: "행정항고·재항고사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  administrativeApplication: {
    code: "아",
    codeNumber: "127",
    nameKo: "행정신청사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },

  // ===== 특허 (전자소송 '특허' 탭). =====
  patentFirstInstance: {
    code: "허",
    codeNumber: "129",
    nameKo: "특허1심사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  patentSupremeAppeal: {
    code: "후",
    codeNumber: "046",
    nameKo: "특허상고사건",
    appliedDomains: ["stampDuty", "deliveryFee", "lawyerFee"],
    isCivilOrFamily: false,
  },
  patentInterlocutoryAppeal: {
    code: "흐",
    codeNumber: "032",
    nameKo: "특허재항고사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  patentApplication: {
    code: "카허",
    codeNumber: "131",
    nameKo: "특허신청사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },

  // ===== 과태료 · 비송 (전자소송 '과태료' / '비송' 탭). =====
  fineObjection: {
    code: "과",
    codeNumber: "179",
    nameKo: "과태료 결정에 대한 이의신청사건",
    appliedDomains: ["deliveryFee"],
    isCivilOrFamily: false,
  },
  nonContentious: {
    code: "비단/비합",
    codeNumber: "216/215",
    nameKo: "비송사건 (과태료 제외)",
    appliedDomains: ["deliveryFee"],
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
  distribution?: LitigationCostDistributionDirective;
}

export type LitigationCostDistributionMode = "equal" | "proportional";

export interface LitigationCostDistributionDirective {
  mode: LitigationCostDistributionMode;
  /**
   * 균등 분배 전용. 미지정 시 deliveryFee.partyCount 를 사용한다.
   */
  partyCount?: number;
  /**
   * 안분 전용. 각 당사자의 소가 또는 부담 기준액. 합계 대비 비례 배분한다.
   */
  partyValuesWon?: number[];
}

export interface LitigationCostDistributionResult {
  mode: LitigationCostDistributionMode;
  totalWon: number;
  perParty: number[];
  remainder: number;
  basis: "partyCount" | "partyValuesWon";
}

export interface LitigationCostResult {
  stampDuty: StampDutyResult;
  deliveryFee: DeliveryFeeResult;
  lawyerFee: LawyerFeeResult;
  totalAmount: number;
  distribution?: LitigationCostDistributionResult;
  /** B11 단일 source — `STANDARD_DISCLAIMER` 그대로. */
  disclaimer: string;
  /** 도메인별 dataset 슬라이스 식별자. `.lcalc` envelope v3 의 `dataVersions` 에 그대로 hoist. */
  dataVersions: Record<string, string>;
  /** ISO 8601 datetime. */
  computedAt: string;
}
