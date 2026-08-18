import { STANDARD_DISCLAIMER } from "../disclaimers";
// 원 단위 잔여 배분 규칙(최대잉여법)의 단일 출처. 도메인 지식이 없는 순수 산술
// 헬퍼라 소송비용 쪽 구현을 그대로 쓴다 — 복제하면 한쪽만 고쳐지는 결함이 생긴다.
import { divideProportionally } from "../litigation-cost/distribute";

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
  // 변제기 도래 판정 기준일. 민법 제477조 1호는 **변제 시점** 을 본다 — 계산을 언제 돌렸는지가
  // 아니다. `computedAt` 은 계산 시각 메타로만 남기고 의미를 겸용하지 않는다.
  const dueAsOf = input.payment.paidAt ?? computedAt;
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
    remaining = applyLegalAllocation(works, input.payment.amount, dueAsOf);
  } else {
    remaining = applyExplicitDirective(input.payment.allocation, input.payment.amount, workMap);
    // 지정(합의·채무자·채권자) 대상 합계보다 변제액이 크면, 잉여는 민법 제477조 법정충당
    // 순서로 잔여 채권 (지정 대상의 잔액 포함) 에 cascade 한다 (통설).
    if (remaining > 0) {
      remaining = applyLegalAllocation(works, remaining, dueAsOf, "잉여 ");
    }
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

function applyLegalAllocation(
  works: ClaimWork[],
  paymentAmount: number,
  asOf: IsoDate,
  labelPrefix = "",
): number {
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
    const priorityLabel = labelPrefix + formatPriorityLabel(priorityIndex, dueReached, topGroup);
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
      // 민법 제477조 제4호 비례 안분. 소송비용 분배와 같은 최대잉여법을 쓴다
      // (`divideProportionally` = BigInt 정확 나머지 + 결정적 tie-break).
      // 직접 floor + 마지막 채권에 잔여 몰아주기를 하면 (a) 그 채권이 자기 잔액에
      // 걸릴 때 차액이 어느 채권에도 충당되지 않고 사라지고 (b) 채권 입력 순서에
      // 따라 결과가 달라진다.
      const claimTotals = topGroup.map((w) => totalRemaining(w));
      const denominator = claimTotals.reduce((sum, value) => sum + value, 0);
      // 안분 대상 총액은 잔액 합을 넘지 않는다. 각 배분액이 해당 채권 잔액을
      // 초과하지 않음이 보장되므로 (배분액 ≤ ceil(pool × 잔액 / 합) ≤ 잔액),
      // 전액이 그대로 흡수되고 재분배 루프가 필요 없다.
      const groupPool = Math.min(pool, denominator);
      const { perParty } = divideProportionally(groupPool, claimTotals);

      let allocatedSum = 0;
      for (const [i, w] of topGroup.entries()) {
        allocatedSum += absorbIntoClaim(w, perParty[i]!);
        w.statutoryRank = {
          dueReached,
          debtorBenefitRank: w.input.debtorBenefitRank ?? 0,
          dueAt: w.input.dueAt,
          proportionalShare: { numerator: claimTotals[i]!, denominator },
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

/**
 * 충당 순위 라벨. 결과 표에 그대로 노출되므로 사용자 문구로 쓴다 (영어 식별자·기호 금지).
 */
function formatPriorityLabel(index: number, dueReached: boolean, group: ClaimWork[]): string {
  const tier = dueReached ? "변제기 도래" : "변제기 미도래";
  const rank = group[0]!.input.debtorBenefitRank ?? 0;
  const parts = [tier, `변제이익 순위 ${rank}`];
  if (group.length > 1) {
    parts.push("비례 안분");
  }
  return `법정충당 ${index + 1}순위 (${parts.join(", ")})`;
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
