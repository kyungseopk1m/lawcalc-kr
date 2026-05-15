export type IsoDate = string;
export type MoneyWon = number;

export const APPROPRIATION_DATA_VERSION = "appropriation/policy-v1";

export type AppropriationAllocationType =
  | "agreement"
  | "debtorDesignation"
  | "creditorDesignation"
  | "legal";

export interface AllocationTarget {
  claimId: string;
  amount: MoneyWon;
}

export type AppropriationAllocationDirective =
  | { type: "agreement"; targets: AllocationTarget[] }
  | { type: "debtorDesignation"; targets: AllocationTarget[] }
  | { type: "creditorDesignation"; targets: AllocationTarget[] }
  | { type: "legal" };

export interface AppropriationClaimInput {
  id: string;
  name?: string;
  costBalance?: MoneyWon;
  interestBalance?: MoneyWon;
  principalBalance: MoneyWon;
  dueAt: IsoDate;
  debtorBenefitRank?: number;
}

export interface AppropriationPaymentInput {
  amount: MoneyWon;
  allocation: AppropriationAllocationDirective;
}

export interface AppropriationInput {
  claims: AppropriationClaimInput[];
  payment: AppropriationPaymentInput;
  computedAt?: IsoDate;
}

export interface AppropriationProportionalShare {
  numerator: MoneyWon;
  denominator: MoneyWon;
}

export interface AppropriationStatutoryRank {
  dueReached: boolean;
  debtorBenefitRank: number;
  dueAt: IsoDate;
  proportionalShare?: AppropriationProportionalShare;
  priorityLabel: string;
}

export interface AppropriationClaimResult {
  claimId: string;
  name?: string;
  costApplied: MoneyWon;
  interestApplied: MoneyWon;
  principalApplied: MoneyWon;
  costBalanceAfter: MoneyWon;
  interestBalanceAfter: MoneyWon;
  principalBalanceAfter: MoneyWon;
  totalApplied: MoneyWon;
  statutoryRank?: AppropriationStatutoryRank;
}

export interface AppropriationPaymentResult {
  amount: MoneyWon;
  allocationType: AppropriationAllocationType;
  appliedAmount: MoneyWon;
  unappliedAmount: MoneyWon;
}

export interface AppropriationTotals {
  totalCostApplied: MoneyWon;
  totalInterestApplied: MoneyWon;
  totalPrincipalApplied: MoneyWon;
  remainingCost: MoneyWon;
  remainingInterest: MoneyWon;
  remainingPrincipal: MoneyWon;
  remainingGrandTotal: MoneyWon;
}

export interface AppropriationResult {
  claims: AppropriationClaimResult[];
  payment: AppropriationPaymentResult;
  totals: AppropriationTotals;
  dataVersion: string;
  disclaimer: string;
  computedAt: IsoDate;
}
