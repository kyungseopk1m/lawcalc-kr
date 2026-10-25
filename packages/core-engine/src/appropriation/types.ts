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
  /**
   * 약정 연이율 (예: 0.12). 있으면 `interestFrom` 부터 각 변제일까지 원본 잔액에 이자를 붙인다
   * (여러 번 변제 시 변제와 변제 사이 이자 발생). 없으면 이자를 붙이지 않는다 (종전 동작).
   * 일수 계산은 법원 이자계산 방식(기간식, 윤년 366, 초일 산입, 원 미만 절사)으로 고정한다.
   */
  interestRate?: number;
  /** 이자 기산일 (포함). `interestRate` 나 선이자를 넣으면 필수. */
  interestFrom?: IsoDate;
  /**
   * 이자제한법 적용 (금전대차). 있으면 약정일에 시행 중인 최고이자율로 약정이율을 제한한다.
   * 이자제한법 제2조 제1항·제2항(최고이자율은 약정한 때의 이자율)·제3항(초과 부분 무효)·
   * 제5항(대차원금 10만원 미만 적용 제외), 제3조(선이자 사전공제).
   */
  interestLimitAct?: AppropriationInterestLimitInput;
}

export interface AppropriationInterestLimitInput {
  /** 약정일 (이자제한법 제2조 제2항). 이 날 시행 중인 최고이자율을 적용한다. */
  agreedAt: IsoDate;
  /**
   * 사전공제한 선이자. 채무자가 실제 받은 금액 = `principalBalance` - 이 값.
   * 이자제한법 제3조: 실제 받은 금액을 원본으로 최고이자율에 따라 `interestFrom`~`dueAt`
   * 이자를 계산하고, 선이자가 그보다 크면 초과분은 원본에 충당한 것으로 본다.
   * 선이자가 덮는 기간(`interestFrom`~`dueAt`)에는 이자를 다시 붙이지 않는다.
   */
  prepaidInterest?: MoneyWon;
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
  /**
   * 변제 종류. "setoff" 는 상계(민법 제492조). 상계의 의사표시는 각 채무가 상계할 수 있는 때에
   * 대등액에 관하여 소멸한 것으로 보므로(제493조 제2항) `paidAt` 에 상계적상일을 넣는다. 충당은
   * 제499조가 제476조~제479조를 준용하므로 변제와 같다. 미지정이면 변제.
   */
  kind?: "payment" | "setoff";
}

export interface AppropriationInput {
  claims: AppropriationClaimInput[];
  payment: AppropriationPaymentInput;
  /**
   * `payment` 뒤에 이어지는 변제·상계. 있으면 모든 변제에 `paidAt` 이 필요하고, 날짜 순
   * (같은 날은 입력 순)으로 하나씩 충당한다. 각 변제 직전까지 이자가 붙는다.
   */
  additionalPayments?: AppropriationPaymentInput[];
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

/** 변제 1건 안에서 채권 1건의 변화. */
export interface AppropriationEventClaimResult {
  claimId: string;
  name?: string;
  /** 직전 변제(또는 이자 기산일)부터 이 변제일까지 새로 붙은 이자. */
  interestAccrued: MoneyWon;
  /** 이자를 붙인 기간. 붙인 이자가 없으면 없다. */
  accruedFrom?: IsoDate;
  accruedTo?: IsoDate;
  costApplied: MoneyWon;
  interestApplied: MoneyWon;
  principalApplied: MoneyWon;
  costBalanceAfter: MoneyWon;
  interestBalanceAfter: MoneyWon;
  principalBalanceAfter: MoneyWon;
  statutoryRank?: AppropriationStatutoryRank;
}

export interface AppropriationEventResult {
  paidAt: IsoDate;
  kind: "payment" | "setoff";
  amount: MoneyWon;
  allocationType: AppropriationAllocationType;
  appliedAmount: MoneyWon;
  unappliedAmount: MoneyWon;
  claims: AppropriationEventClaimResult[];
}

/** 이자제한법 검토 결과 (채권별). */
export interface AppropriationInterestLimitResult {
  claimId: string;
  agreedAt: IsoDate;
  /** 약정일에 시행 중인 최고이자율 (2007-06-30 전 약정은 그날 시행 최고이자율). 데이터 범위 밖이면 null. */
  capRate: number | null;
  /** 약정이율. 이율을 넣지 않았으면 없다. */
  agreedRate?: number;
  /** 실제 적용한 이율. */
  appliedRate?: number;
  /** 약정이율이 최고이자율로 제한되었는가. */
  capped: boolean;
  /** 선이자 검토 (제3조). 선이자를 넣었을 때만 있다. */
  prepaid?: {
    prepaidInterest: MoneyWon;
    receivedAmount: MoneyWon;
    /** 실제 받은 금액 × 최고이자율 × 기간. */
    allowedInterest: MoneyWon;
    /** 원본에 충당한 것으로 보는 초과분. */
    excessToPrincipal: MoneyWon;
    principalAfter: MoneyWon;
  };
  notice: string;
}

export interface AppropriationResult {
  claims: AppropriationClaimResult[];
  payment: AppropriationPaymentResult;
  totals: AppropriationTotals;
  dataVersion: string;
  disclaimer: string;
  computedAt: IsoDate;
  /**
   * 변제별 경과. 여러 번 변제·이자·상계·이자제한법 중 하나라도 쓰면 생긴다. 이때 `payment` 는
   * 모든 변제의 합계(충당 방식은 첫 변제의 것)이고, `claims[]` 는 누적 충당액과 마지막 잔액이며
   * 충당 순위(`statutoryRank`)는 변제마다 다르므로 `events[].claims[]` 에만 둔다.
   */
  events?: AppropriationEventResult[];
  /** 이자제한법 검토. 채권에 `interestLimitAct` 를 넣었을 때만 있다. */
  interestLimits?: AppropriationInterestLimitResult[];
  /** 충당 순서 안내 (민법 제479조 다수 채무, 대법원 2022다239896). 해당할 때만 있다. */
  interpretationNotices?: string[];
  /** 이자제한법 최고이자율 데이터셋 식별자. `interestLimits` 와 함께 있다. */
  interestLimitsDataVersion?: string;
}
