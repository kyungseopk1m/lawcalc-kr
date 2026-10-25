export type {
  CompensationLifeExpectancyInput,
  LifeExpectancyDeps,
  LifeExpectancyInput,
  LifeExpectancyResult,
  LifeExpectancyWarning,
  LifeShortening,
} from "./types";
export { computeLifeExpectancy, fullAge } from "./compute";
export { validateLifeExpectancyInput } from "./validators";
