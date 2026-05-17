/**
 * Compensation 도메인 re-export. **본 모듈 내부 전용** 정원이며 v0.5.0 트랙 A 시점에서는
 * `packages/core-engine/src/index.ts` package-level export 진입을 의도적으로 보류한다.
 * UI scaffold + capability id `compensation@1` 등록은 트랙 5 U 정원
 * (`docs/plans/v0.5-cycle-plan-2026-05-16.md §6 트랙 5 5-1`).
 */
export type {
  CompensationAbsoluteDeduction,
  CompensationBaseInput,
  CompensationDataVersions,
  CompensationDeductionsInput,
  CompensationDeductionsResult,
  CompensationFaultOffset,
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
