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

export { calculateInterest } from "./interest";
export { addDays, addYears, containsLeapDay, countDays, daysInYear, isLeapYear } from "./days";
export { resolveSegments } from "./segments";
export { datasetVersionTag, getRateAt, rateHistoryFor } from "./legal-rates";
export { STANDARD_DISCLAIMER } from "./disclaimers";

export type {
  HeirNode,
  InheritanceInput,
  InheritanceResult,
  InheritanceShare,
} from "./inheritance";
export { calculateInheritance } from "./inheritance";
