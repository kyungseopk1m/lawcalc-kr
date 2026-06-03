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
  Hoffman240CapTable,
  PermanentDisabilityInput,
  TemporaryDisabilityInput,
} from "./types";
export { computeCompensation, type ComputeCompensationDeps } from "./compute";
export { validateCompensationInput } from "./validators";
