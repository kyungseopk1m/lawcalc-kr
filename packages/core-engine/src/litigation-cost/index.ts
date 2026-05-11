export type {
  AppealsLevel,
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
} from "./types";

export { CASE_TYPE_META } from "./types";

export type { ApplyLawyerFeeDiscountsResult } from "./helpers";

export {
  applyLawyerFeeDiscounts,
  appliedDomains,
  caseCode,
  caseNameKo,
  isCaseType,
  isCivilOrFamily,
  KLAC_DEFAULT_RATE,
  LAWYER_FEE_MULTIPLIER_MAX,
  LAWYER_FEE_MULTIPLIER_MIN,
  lawyerFeeDiscountMultiplier,
  listCaseTypes,
} from "./helpers";

export {
  validateDeliveryFeeInput,
  validateKlacDiscountScope,
  validateLawyerFeeInput,
  validateStampDutyInput,
} from "./validators";
