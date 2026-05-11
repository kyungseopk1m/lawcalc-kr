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

export type {
  StampDutyAppealsMultipliers,
  StampDutyDataset,
  StampDutyElectronicFilingDiscount,
  StampDutyHistoryNote,
  StampDutySourceLaw,
  StampDutySpecialProcedureEntry,
  StampDutySpecialProcedures,
} from "./stamp-duty-dataset";

export {
  getAppealsMultiplier,
  getStampDutyBracket,
  loadStampDutyDataset,
  stampDutyVersionTag,
} from "./stamp-duty-dataset";

export type { ComputeStampDutyDeps } from "./compute-stamp-duty";

export { applyStampDutyRounding, computeStampDuty } from "./compute-stamp-duty";
