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

export { calculateInterest } from "./interest";
export { countDays } from "./days";
export { resolveSegments } from "./segments";
export { loadLegalRates } from "./legal-rates";
