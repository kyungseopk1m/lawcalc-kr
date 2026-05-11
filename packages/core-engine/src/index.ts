export type {
  CalcOptions,
  InterestInput,
  InterestResult,
  InterestSegment,
  IsoDate,
  LegalRateCode,
  LegalRatePreset,
  RateSegment,
} from "./types";

export type { LegalRateDataset, LegalRateRecord } from "./legal-rates";
export type { CalculateInterestDeps } from "./interest";
export type { ResolveSegmentsDeps } from "./segments";
export type { InterestLimitDataset, InterestLimitLaw, InterestLimitSlice } from "./interest-limits";

export { calculateInterest } from "./interest";
export { addDays, addYears, containsLeapDay, countDays, daysInYear, isLeapYear } from "./days";
export { resolveSegments } from "./segments";
export { datasetVersionTag, getRateAt, rateHistoryFor } from "./legal-rates";
export {
  capHistoryFor,
  getCapAt,
  interestLimitsVersionTag,
  loadInterestLimits,
} from "./interest-limits";
export { STANDARD_DISCLAIMER } from "./disclaimers";

export type {
  HeirNode,
  InheritanceInput,
  InheritanceResult,
  InheritanceShare,
} from "./inheritance";
export { calculateInheritance } from "./inheritance";

export type {
  AppealsLevel,
  ApplyLawyerFeeDiscountsResult,
  CaseType,
  CaseTypeMeta,
  DeliveryCount,
  DeliveryFeeInput,
  DeliveryFeeResult,
  DeliveryFormula,
  Domain,
  KlacScopeWarning,
  LawyerFeeAppealsRule,
  LawyerFeeBracket,
  LawyerFeeDiscount,
  LawyerFeeInput,
  LawyerFeeResult,
  LitigationCostInput,
  LitigationCostResult,
  NoOralHearingReason,
  StampDutyBracket,
  StampDutyInput,
  StampDutyResult,
  StampDutyRoundingPolicy,
} from "./litigation-cost";
export {
  applyLawyerFeeDiscounts,
  appliedDomains,
  CASE_TYPE_META,
  caseCode,
  caseNameKo,
  isCaseType,
  isCivilOrFamily,
  KLAC_DEFAULT_RATE,
  LAWYER_FEE_MULTIPLIER_MAX,
  LAWYER_FEE_MULTIPLIER_MIN,
  lawyerFeeDiscountMultiplier,
  listCaseTypes,
  validateDeliveryFeeInput,
  validateKlacDiscountScope,
  validateLawyerFeeInput,
  validateStampDutyInput,
} from "./litigation-cost";
