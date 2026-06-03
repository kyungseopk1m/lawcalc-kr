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
  ValueSumCapInfo,
} from "./types";
export { computeOtherDamages, type OtherDamagesContext } from "./compute";
export { validateOtherDamagesInput } from "./validators";
export {
  applyValueSum20Cap,
  singlePaymentHoffman,
  SINGLE_PAYMENT_DISCOUNT_RATE,
  VALUE_SUM_CAP,
  type ValueSum20CapResult,
} from "./caps";
