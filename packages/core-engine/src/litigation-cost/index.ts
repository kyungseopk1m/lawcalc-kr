export type {
  AppealsLevel,
  CaseType,
  CaseTypeMeta,
  DeliveryCount,
  DeliveryFeeInput,
  DeliveryFeeResult,
  DeliveryFormula,
  Domain,
  KoreaLegalAidScopeWarning,
  LawyerFeeAppealsRule,
  LawyerFeeBracket,
  LawyerFeeDiscount,
  LawyerFeeInput,
  LawyerFeeResult,
  LitigationCostDistributionDirective,
  LitigationCostDistributionMode,
  LitigationCostDistributionResult,
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
  KOREA_LEGAL_AID_DEFAULT_RATE,
  LAWYER_FEE_MULTIPLIER_MAX,
  LAWYER_FEE_MULTIPLIER_MIN,
  lawyerFeeDiscountMultiplier,
  listCaseTypes,
} from "./helpers";

export {
  validateDeliveryFeeInput,
  validateKoreaLegalAidDiscountScope,
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

export type {
  DeliveryCountMatrixEntry,
  DeliveryDataset,
  DeliveryHistoryNote,
  DeliveryMatrixDelegation,
  DeliveryRuleChange,
  DeliverySourceLaw,
  DeliveryUnitPriceHistoryEntry,
  DeliveryUnverifiedEntry,
} from "./delivery-dataset";

export {
  deliveryDatasetVersionTag,
  getDeliveryCount,
  getDeliveryUnitPriceAt,
  loadDeliveryDataset,
} from "./delivery-dataset";

export type { ComputeDeliveryFeeDeps } from "./compute-delivery-fee";

export { computeDeliveryFee } from "./compute-delivery-fee";

export type {
  LawyerFeeAppealsRuleMeta,
  LawyerFeeBracketTableChange,
  LawyerFeeCourtDiscretionModifier,
  LawyerFeeCustomPercentModifier,
  LawyerFeeDataset,
  LawyerFeeHistoryNote,
  LawyerFeeInterpretiveCases,
  LawyerFeeKoreaLegalAidModifier,
  LawyerFeeModifierChange,
  LawyerFeeModifiers,
  LawyerFeeNoOralHearingModifier,
  LawyerFeeNoOralHearingTrigger,
  LawyerFeeProvisionalModifier,
  LawyerFeeSourceLaw,
  LawyerFeeStackingPolicy,
} from "./lawyer-fee-dataset";

export {
  getLawyerFeeBracket,
  lawyerFeeDatasetVersionTag,
  loadLawyerFeeDataset,
} from "./lawyer-fee-dataset";

export type { ComputeLawyerFeeDeps } from "./compute-lawyer-fee";

export { computeLawyerFee } from "./compute-lawyer-fee";

export type { LitigationCostDistributionParts } from "./distribute";

export {
  divideEqually,
  divideProportionally,
  validateDistributeEqualInput,
  validateDistributeProportionalInput,
} from "./distribute";

export type { ComputeLitigationCostDeps } from "./compute-litigation-cost";

export { computeLitigationCost } from "./compute-litigation-cost";
