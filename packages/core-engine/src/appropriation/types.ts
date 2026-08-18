export type IsoDate = string;
export type MoneyWon = number;

export const APPROPRIATION_DATA_VERSION = "appropriation/policy-v1";

export type AppropriationAllocationType =
  "agreement" | "debtorDesignation" | "creditorDesignation" | "legal";

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
  /**
   * 변제일. 민법 제477조 제1호의 변제기 도래/미도래는 **변제 시점** 기준으로 갈린다.
   *
   * 미지정 시 `computedAt`, 그것도 없으면 오늘 날짜를 쓴다 (종전 동작). 과거 변제의 충당
   * 순서를 재현하려면 이 값을 넣어야 한다. 넣지 않으면 `.lcalc` 를 저장했다 나중에 열었을 때
   * 그 사이 `dueAt` 이 지나 같은 파일이 다른 결과를 낸다.
   */
  paidAt?: IsoDate;
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
