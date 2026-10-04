export type {
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
