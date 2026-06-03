export type {
  CompensationAbsoluteDeduction,
  CompensationAccidentType,
  CompensationBaseInput,
  CompensationDataVersions,
  CompensationDeductionsInput,
  CompensationDeductionsResult,
  CompensationFaultOffset,
  CompensationIndustrialInsuranceInjury,
  CompensationInput,
  CompensationLossRateInput,
  CompensationLostIncomeInput,
  CompensationRatioDeduction,
  CompensationResult,
  CompensationSegment,
  ComputeCompensationDeps,
  Hoffman240CapTable,
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
} from "./auto-death";
export { computeCompensationDeath, validateCompensationDeathInput } from "./auto-death";

export const COMPENSATION_CAPABILITY_ID = "compensation@1" as const;
