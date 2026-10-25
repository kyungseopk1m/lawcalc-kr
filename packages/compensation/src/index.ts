export type {
  CompensationClaimantRounding,
  CompensationInjuryClaimant,
  CompensationInjuryClaimantsInput,
  CompensationAbsoluteDeduction,
  CompensationAccidentType,
  CompensationBaseInput,
  CompensationDataVersions,
  CompensationDeductionsInput,
  CompensationDeductionsResult,
  CompensationFaultOffset,
  CompensationIndustrialBenefitResult,
  CompensationIndustrialInsuranceInjury,
  CompensationInput,
  CompensationLossRateInput,
  CompensationLostIncomeInput,
  CompensationRatioDeduction,
  CompensationLegacyRatioDeduction,
  CompensationResult,
  CompensationSegment,
  ComputeCompensationDeps,
  Hoffman240CapTable,
  LaborRateEffectiveRule,
  CompensationWarning,
  PermanentDisabilityInput,
  TemporaryDisabilityInput,
} from "./auto-injury";
export { computeCompensation, validateCompensationInput } from "./auto-injury";

export type {
  CompensationClaimantSolatium,
  CompensationDeathOtherClaimant,
  CompensationDeathOtherClaimantInput,
  CompensationDeathClaimantsInput,
  CompensationAutoDeathInput,
  CompensationAutoDeathResult,
  CompensationDeathBaseInput,
  CompensationHeirsInput,
  CompensationIndustrialInsuranceDeath,
  CompensationInheritanceShare,
  CompensationSurvivorBenefitRecipient,
} from "./auto-death";
export { computeCompensationDeath, validateCompensationDeathInput } from "./auto-death";

export type {
  AttendantCareInput,
  AttendantCareResult,
  AttendantFutureSegmentInput,
  AttendantPastInput,
  OtherDamagesInput,
  OtherDamagesResult,
  TreatmentFutureInput,
  TreatmentInput,
  TreatmentPastInput,
  TreatmentResult,
} from "./other-damages";
export {
  applyValueSum20Cap,
  computeOtherDamages,
  singlePaymentHoffman,
  validateOtherDamagesInput,
  type OtherDamagesContext,
} from "./other-damages";

export type { DelayDamagesDeps, DelayDamagesInput, DelayDamagesResult } from "./delay-damages";
export {
  buildDelayDamagesOrderText,
  computeDelayDamages,
  DELAY_DAMAGES_DEFAULT_OPTIONS,
  validateDelayDamagesInput,
} from "./delay-damages";

export type {
  CompensationLifeExpectancyInput,
  LifeExpectancyDeps,
  LifeExpectancyInput,
  LifeExpectancyResult,
  LifeExpectancyWarning,
  LifeShortening,
} from "./life-expectancy";
export { computeLifeExpectancy, validateLifeExpectancyInput } from "./life-expectancy";

export type {
  LostRetirementInput,
  LostRetirementMethod,
  LostRetirementResult,
  LostRetirementWarning,
} from "./lost-retirement";
export { computeLostRetirement, validateLostRetirementInput } from "./lost-retirement";

export { combineDisabilityRatesPercent } from "./internal";

export type { MediationInterestResult } from "./mediation";
export {
  computeMediationInterest,
  faultRatioOfResponsibilityPercent,
  MEDIATION_DEFAULT_SPREAD_PERCENT,
  mediationResponsibilityPercents,
} from "./mediation";
