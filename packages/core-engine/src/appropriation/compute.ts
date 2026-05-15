import { STANDARD_DISCLAIMER } from "../disclaimers";

import type {
  AllocationTarget,
  AppropriationClaimInput,
  AppropriationClaimResult,
  AppropriationInput,
  AppropriationResult,
  AppropriationStatutoryRank,
  AppropriationTotals,
  IsoDate,
} from "./types";
import { APPROPRIATION_DATA_VERSION } from "./types";
import { validateAppropriationInput } from "./validators";

interface MutableBalance {
  cost: number;
  interest: number;
  principal: number;
  costApplied: number;
  interestApplied: number;
  principalApplied: number;
}

interface ClaimWork {
  input: AppropriationClaimInput;
  balance: MutableBalance;
  statutoryRank?: AppropriationStatutoryRank;
}

interface ExplicitDirective {
  type: "agreement" | "debtorDesignation" | "creditorDesignation";
  targets: AllocationTarget[];
}

export function computeAppropriation(input: AppropriationInput): AppropriationResult {
  validateAppropriationInput(input);

  const computedAt = input.computedAt ?? todayIso();
  const works: ClaimWork[] = input.claims.map((claim) => ({
    input: claim,
    balance: {
      cost: claim.costBalance ?? 0,
      interest: claim.interestBalance ?? 0,
      principal: claim.principalBalance,
      costApplied: 0,
      interestApplied: 0,
      principalApplied: 0,
    },
  }));
  const workMap = new Map<string, ClaimWork>(works.map((w) => [w.input.id, w]));

  let remaining: number;
  if (input.payment.allocation.type === "legal") {
    remaining = applyLegalAllocation(works, input.payment.amount, computedAt);
  } else {
    remaining = applyExplicitDirective(input.payment.allocation, input.payment.amount, workMap);
  }

  const totals = buildTotals(works);
  return {
    claims: works.map(toClaimResult),
    payment: {
      amount: input.payment.amount,
      allocationType: input.payment.allocation.type,
      appliedAmount: input.payment.amount - remaining,
      unappliedAmount: remaining,
    },
    totals,
    dataVersion: APPROPRIATION_DATA_VERSION,
    disclaimer: STANDARD_DISCLAIMER,
    computedAt,
  };
}

function applyExplicitDirective(
  directive: ExplicitDirective,
  paymentAmount: number,
  workMap: Map<string, ClaimWork>,
): number {
  let pool = paymentAmount;
  for (const target of directive.targets) {
    if (pool <= 0) break;
    const work = workMap.get(target.claimId);
    if (!work) continue;
    const availableForTarget = Math.min(target.amount, pool);
    const used = absorbIntoClaim(work, availableForTarget);
    pool -= used;
  }
  return pool;
}

function applyLegalAllocation(works: ClaimWork[], paymentAmount: number, asOf: IsoDate): number {
  let pool = paymentAmount;
  let priorityIndex = 0;

  while (pool > 0) {
    const open = works.filter((w) => totalRemaining(w) > 0 && w.statutoryRank === undefined);
    if (open.length === 0) break;

    const due = open.filter((w) => w.input.dueAt <= asOf);
    const notDue = open.filter((w) => w.input.dueAt > asOf);
    const tier = due.length > 0 ? due : notDue;
    const dueReached = due.length > 0;

    const groups = rankLegal(tier);
    const topGroup = groups[0]!;
    const priorityLabel = formatPriorityLabel(priorityIndex, dueReached, topGroup);
    priorityIndex += 1;

    if (topGroup.length === 1) {
      const w = topGroup[0]!;
      w.statutoryRank = {
        dueReached,
        debtorBenefitRank: w.input.debtorBenefitRank ?? 0,
        dueAt: w.input.dueAt,
        priorityLabel,
      };
      const used = absorbIntoClaim(w, pool);
      pool -= used;
    } else {
      const denominator = topGroup.reduce((sum, w) => sum + totalRemaining(w), 0);
      let allocatedSum = 0;
      for (let i = 0; i < topGroup.length; i++) {
        const w = topGroup[i]!;
        const claimTotal = totalRemaining(w);
        const proposed =
          i === topGroup.length - 1
            ? pool - allocatedSum
            : Math.floor((pool * claimTotal) / denominator);
        const cap = Math.min(proposed, claimTotal);
        const allocated = cap > 0 ? cap : 0;
        const used = absorbIntoClaim(w, allocated);
        allocatedSum += used;
        w.statutoryRank = {
          dueReached,
          debtorBenefitRank: w.input.debtorBenefitRank ?? 0,
          dueAt: w.input.dueAt,
          proportionalShare: { numerator: claimTotal, denominator },
          priorityLabel,
        };
      }
      pool -= allocatedSum;
      if (allocatedSum === 0) break;
    }
  }
  return pool;
}

function rankLegal(tier: ClaimWork[]): ClaimWork[][] {
  const sorted = [...tier].sort((a, b) => {
    const ra = a.input.debtorBenefitRank ?? 0;
    const rb = b.input.debtorBenefitRank ?? 0;
    if (ra !== rb) return ra - rb;
    return a.input.dueAt.localeCompare(b.input.dueAt);
  });
  const groups: ClaimWork[][] = [];
  let current: ClaimWork[] = [];
  let cursor = "";
  for (const w of sorted) {
    const key = `${w.input.debtorBenefitRank ?? 0}|${w.input.dueAt}`;
    if (key !== cursor) {
      if (current.length > 0) groups.push(current);
      current = [w];
      cursor = key;
    } else {
      current.push(w);
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

function formatPriorityLabel(index: number, dueReached: boolean, group: ClaimWork[]): string {
  const tier = dueReached ? "변제기 도래" : "변제기 미도래";
  const rank = group[0]!.input.debtorBenefitRank ?? 0;
  const proportional = group.length > 1 ? " (비례 안분)" : "";
  return `법정충당 ${index + 1}순위 — ${tier}, 변제이익 rank ${rank}${proportional}`;
}

function absorbIntoClaim(work: ClaimWork, available: number): number {
  if (available <= 0) return 0;
  let pool = available;

  const usedCost = Math.min(pool, work.balance.cost);
  work.balance.cost -= usedCost;
  work.balance.costApplied += usedCost;
  pool -= usedCost;
  if (pool <= 0) return available - pool;

  const usedInterest = Math.min(pool, work.balance.interest);
  work.balance.interest -= usedInterest;
  work.balance.interestApplied += usedInterest;
  pool -= usedInterest;
  if (pool <= 0) return available - pool;

  const usedPrincipal = Math.min(pool, work.balance.principal);
  work.balance.principal -= usedPrincipal;
  work.balance.principalApplied += usedPrincipal;
  pool -= usedPrincipal;
  return available - pool;
}

function totalRemaining(work: ClaimWork): number {
  return work.balance.cost + work.balance.interest + work.balance.principal;
}

function toClaimResult(work: ClaimWork): AppropriationClaimResult {
  const base: AppropriationClaimResult = {
    claimId: work.input.id,
    costApplied: work.balance.costApplied,
    interestApplied: work.balance.interestApplied,
    principalApplied: work.balance.principalApplied,
    costBalanceAfter: work.balance.cost,
    interestBalanceAfter: work.balance.interest,
    principalBalanceAfter: work.balance.principal,
    totalApplied:
      work.balance.costApplied + work.balance.interestApplied + work.balance.principalApplied,
  };
  if (work.input.name !== undefined) {
    base.name = work.input.name;
  }
  if (work.statutoryRank) {
    base.statutoryRank = work.statutoryRank;
  }
  return base;
}

function buildTotals(works: ClaimWork[]): AppropriationTotals {
  const totals: AppropriationTotals = {
    totalCostApplied: 0,
    totalInterestApplied: 0,
    totalPrincipalApplied: 0,
    remainingCost: 0,
    remainingInterest: 0,
    remainingPrincipal: 0,
    remainingGrandTotal: 0,
  };
  for (const w of works) {
    totals.totalCostApplied += w.balance.costApplied;
    totals.totalInterestApplied += w.balance.interestApplied;
    totals.totalPrincipalApplied += w.balance.principalApplied;
    totals.remainingCost += w.balance.cost;
    totals.remainingInterest += w.balance.interest;
    totals.remainingPrincipal += w.balance.principal;
  }
  totals.remainingGrandTotal =
    totals.remainingCost + totals.remainingInterest + totals.remainingPrincipal;
  return totals;
}

function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
