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
} from "./types";
export { computeCompensationDeath } from "./compute";
export { validateCompensationDeathInput } from "./validators";
