import { addDays } from "../days";
import { STANDARD_DISCLAIMER } from "../disclaimers";
import { calculateInterest } from "../interest";
import { getCapAt, interestLimitsVersionTag, loadInterestLimits } from "../interest-limits";
// 원 단위 잔여 배분 규칙(최대잉여법)의 단일 출처. 도메인 지식이 없는 순수 산술
// 헬퍼라 소송비용 쪽 구현을 그대로 쓴다 — 복제하면 한쪽만 고쳐지는 결함이 생긴다.
import { divideProportionally } from "../litigation-cost/distribute";

import type {
  AllocationTarget,
  AppropriationClaimInput,
  AppropriationClaimResult,
  AppropriationEventClaimResult,
  AppropriationEventResult,
  AppropriationInput,
  AppropriationInterestLimitResult,
  AppropriationPaymentInput,
  AppropriationResult,
  AppropriationStatutoryRank,
  AppropriationTotals,
  IsoDate,
} from "./types";
import { APPROPRIATION_DATA_VERSION } from "./types";
import { isExtendedAppropriationInput, validateAppropriationInput } from "./validators";

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
  // 새 키(여러 번 변제·이자·상계·이자제한법)가 없으면 종전 경로를 그대로 탄다. 결과가 바이트 단위로 같아야
  // 기존 골든과 저장 파일이 흔들리지 않는다.
  if (isExtendedAppropriationInput(input)) {
    return computeAppropriationSchedule(input);
  }

  const computedAt = input.computedAt ?? todayIso();
  // 변제기 도래 판정 기준일. 민법 제477조 제1호는 **변제 시점** 을 본다 — 계산을 언제 돌렸는지가
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

/**
 * 법원 이자계산 방식 (기간식, 윤년 366, 초일 산입, 원 미만 절사). 이자 탭의 "법원 방식 적용" 과 같다.
 * 변제일 당일까지 이자를 붙이고 다음 이자는 그 다음 날부터 붙인다.
 */
const ACCRUAL_OPTIONS = {
  mode: "period",
  leapYear: "actual",
  includeFirstDay: true,
  rounding: "floor",
} as const;

/** 이자제한법 제2조 제5항: 대차원금 10만원 미만은 제1항(최고이자율)을 적용하지 않는다. */
const INTEREST_LIMIT_MIN_PRINCIPAL = 100_000;

function simpleInterest(principal: number, rate: number, from: IsoDate, to: IsoDate): number {
  if (principal <= 0 || rate <= 0 || to < from) return 0;
  return calculateInterest({
    principal,
    startDate: from,
    endDate: to,
    legalRatePreset: { customRate: rate },
    options: ACCRUAL_OPTIONS,
  }).totalInterest;
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString("ko-KR", { maximumFractionDigits: 10 })}%`;
}

interface ScheduleClaim {
  work: ClaimWork;
  /** 다음 이자 기산일. 이자를 붙이지 않는 채권은 null. */
  accrualFrom: IsoDate | null;
  rate: number;
  costApplied: number;
  interestApplied: number;
  principalApplied: number;
}

/**
 * 이자제한법 검토 (제2조·제3조). 원본 잔액 조정(선이자 초과분)과 적용 이율을 돌려준다.
 */
function reviewInterestLimit(
  claim: AppropriationClaimInput,
  dataset: ReturnType<typeof loadInterestLimits>,
): AppropriationInterestLimitResult {
  const limit = claim.interestLimitAct!;
  const agreedRate = claim.interestRate;
  const base: AppropriationInterestLimitResult = {
    claimId: claim.id,
    agreedAt: limit.agreedAt,
    capRate: null,
    ...(agreedRate === undefined ? {} : { agreedRate, appliedRate: agreedRate }),
    capped: false,
    notice: "",
  };
  const prepaid = limit.prepaidInterest ?? 0;
  // 제3조 검토를 하지 않는 두 경우에도 선이자는 이미 받은 이자다. 원본은 그대로 두고, 선이자가
  // 덮는 기간(이자 기산일~이행기)에는 이자를 다시 붙이지 않는다(기산일 이동은 호출부).
  const prepaidOnlyNote =
    prepaid > 0
      ? ` 선이자 ${prepaid.toLocaleString("ko-KR")}원은 이자 기산일 ${claim.interestFrom}~이행기 ${claim.dueAt} 이자를 ` +
        "미리 받은 것으로만 보아 그 기간 이자를 다시 붙이지 않았고, 원본은 조정하지 않았습니다."
      : "";
  // 제2조 제5항 "대차원금이 10만원 미만인 대차의 이자에 관하여는 제1항을 적용하지 아니한다."
  // 선이자도 그 대차의 이자이고, 제3조는 "제2조제1항에서 정한 최고이자율" 을 넘는 부분만 원본에
  // 충당하므로 최고이자율이 미치지 않는 대차에는 제3조 검토도 하지 않는다.
  if (claim.principalBalance < INTEREST_LIMIT_MIN_PRINCIPAL) {
    base.notice =
      "대차원금이 10만원 미만이라 이자제한법 최고이자율을 적용하지 않았습니다 (제2조 제5항)." +
      (prepaid > 0
        ? " 최고이자율이 미치지 않으므로 선이자 사전공제(제3조) 검토도 하지 않았습니다."
        : "") +
      prepaidOnlyNote;
    return base;
  }
  // 제2조 제2항: 최고이자율은 약정한 때의 이자율. 시행령 부칙도 "시행 이후 계약을 체결하거나 갱신하는 분부터".
  const cap = getCapAt(dataset, "interestLimitAct", limit.agreedAt);
  if (cap === undefined) {
    base.notice =
      `약정일 ${limit.agreedAt} 에 적용할 최고이자율 데이터가 없어 제한하지 않았습니다 ` +
      "(데이터는 2007-06-30 이후 약정만 담고 있습니다)." +
      // 현행 이자제한법(법률 제8322호)은 2007-06-30 시행이고, 구 이자제한법은 1998-01-13 폐지(법률 제5507호).
      (prepaid > 0 && limit.agreedAt < "2007-06-30"
        ? " 현행 이자제한법(법률 제8322호)은 2007-06-30 시행이라 그 전 약정에는 적용되지 않아 선이자 사전공제(제3조) 검토도 하지 않았습니다."
        : prepaid > 0
          ? " 선이자 사전공제(제3조) 검토도 하지 않았습니다."
          : "") +
      prepaidOnlyNote;
    return base;
  }
  base.capRate = cap;
  const notes: string[] = [];
  // 제2조 제3항: 최고이자율을 초과하는 부분은 무효.
  if (agreedRate !== undefined && agreedRate > cap) {
    base.appliedRate = cap;
    base.capped = true;
    notes.push(
      `약정이율 연 ${formatPercent(agreedRate)} 가 약정일 최고이자율 연 ${formatPercent(cap)} 를 넘어 ` +
        `연 ${formatPercent(cap)} 로 계산했습니다 (이자제한법 제2조 제3항).`,
    );
  } else {
    notes.push(`약정일 최고이자율은 연 ${formatPercent(cap)} 입니다.`);
  }
  if (prepaid > 0) {
    // 제3조: 실제 받은 금액을 원본으로 최고이자율에 따라 계산한 금액을 넘는 선이자는 원본에 충당한 것으로 본다.
    const receivedAmount = claim.principalBalance - prepaid;
    const allowedInterest = simpleInterest(receivedAmount, cap, claim.interestFrom!, claim.dueAt);
    const excessToPrincipal = Math.max(0, prepaid - allowedInterest);
    base.prepaid = {
      prepaidInterest: prepaid,
      receivedAmount,
      allowedInterest,
      excessToPrincipal,
      principalAfter: claim.principalBalance - excessToPrincipal,
    };
    notes.push(
      excessToPrincipal > 0
        ? `선이자 ${excessToPrincipal.toLocaleString("ko-KR")}원이 한도를 넘어 원본에 충당한 것으로 보았습니다 (이자제한법 제3조).`
        : "선이자가 한도 안이라 원본을 조정하지 않았습니다 (이자제한법 제3조).",
    );
  }
  base.notice = notes.join(" ");
  return base;
}

/**
 * 여러 번 변제·이자 발생·상계·이자제한법을 반영한 충당 (민법 제476조~제479조, 제499조 준용).
 *
 * 변제를 날짜 순으로 하나씩 처리한다. 각 변제 직전에 그 변제일까지의 이자를 붙이고, 그 변제는
 * 종전 단일 변제와 같은 규칙(지정 → 잉여는 제477조 법정충당, 채권 안에서는 제479조 비용·이자·원본 순)
 * 으로 충당한다. 이자는 원본에만 붙고 이자에 이자를 붙이지 않는다.
 */
function computeAppropriationSchedule(input: AppropriationInput): AppropriationResult {
  const computedAt = input.computedAt ?? todayIso();
  const needsLimits = input.claims.some((c) => c.interestLimitAct !== undefined);
  const dataset = needsLimits ? loadInterestLimits() : undefined;
  const interestLimits: AppropriationInterestLimitResult[] = [];

  const states: ScheduleClaim[] = input.claims.map((claim) => {
    let principal = claim.principalBalance;
    let rate = claim.interestRate ?? 0;
    let accrualFrom: IsoDate | null = claim.interestRate === undefined ? null : claim.interestFrom!;
    if (claim.interestLimitAct && dataset) {
      const review = reviewInterestLimit(claim, dataset);
      interestLimits.push(review);
      if (review.appliedRate !== undefined) rate = review.appliedRate;
      if (review.prepaid) principal = review.prepaid.principalAfter;
    }
    // 선이자는 이자 기산일~변제기 이자를 미리 받은 것이므로 그 다음 날부터 이자를 붙인다.
    // 이자제한법 제3조 검토 여부(10만원 미만, 2007-06-30 전 약정)와 상관없이 이중으로 붙이지 않는다.
    if ((claim.interestLimitAct?.prepaidInterest ?? 0) > 0 && accrualFrom !== null) {
      accrualFrom = addDays(claim.dueAt, 1);
    }
    return {
      work: {
        input: claim,
        balance: {
          cost: claim.costBalance ?? 0,
          interest: claim.interestBalance ?? 0,
          principal,
          costApplied: 0,
          interestApplied: 0,
          principalApplied: 0,
        },
      },
      accrualFrom,
      rate,
      costApplied: 0,
      interestApplied: 0,
      principalApplied: 0,
    };
  });
  const works = states.map((s) => s.work);
  const workMap = new Map<string, ClaimWork>(works.map((w) => [w.input.id, w]));

  // 같은 날은 입력 순서를 지킨다 (Array.prototype.sort 는 안정 정렬).
  const payments: AppropriationPaymentInput[] = [
    input.payment,
    ...(input.additionalPayments ?? []),
  ];
  const ordered = [...payments].sort((a, b) => a.paidAt!.localeCompare(b.paidAt!));

  const events: AppropriationEventResult[] = ordered.map((payment) => {
    const paidAt = payment.paidAt!;
    const accrued = states.map((s) => {
      if (s.accrualFrom === null || s.accrualFrom > paidAt) return null;
      const from = s.accrualFrom;
      const amount = simpleInterest(s.work.balance.principal, s.rate, from, paidAt);
      s.work.balance.interest += amount;
      s.accrualFrom = addDays(paidAt, 1);
      return { from, to: paidAt, amount };
    });
    for (const w of works) {
      w.balance.costApplied = 0;
      w.balance.interestApplied = 0;
      w.balance.principalApplied = 0;
      delete w.statutoryRank;
    }

    const kindLabel = payment.kind === "setoff" ? "상계 " : "";
    let remaining: number;
    if (payment.allocation.type === "legal") {
      remaining = applyLegalAllocation(works, payment.amount, paidAt, kindLabel);
    } else {
      remaining = applyExplicitDirective(payment.allocation, payment.amount, workMap);
      if (remaining > 0) {
        remaining = applyLegalAllocation(works, remaining, paidAt, `${kindLabel}잉여 `);
      }
    }

    const claims = states.map((s, i): AppropriationEventClaimResult => {
      const b = s.work.balance;
      s.costApplied += b.costApplied;
      s.interestApplied += b.interestApplied;
      s.principalApplied += b.principalApplied;
      const a = accrued[i];
      const row: AppropriationEventClaimResult = {
        claimId: s.work.input.id,
        interestAccrued: a?.amount ?? 0,
        costApplied: b.costApplied,
        interestApplied: b.interestApplied,
        principalApplied: b.principalApplied,
        costBalanceAfter: b.cost,
        interestBalanceAfter: b.interest,
        principalBalanceAfter: b.principal,
      };
      if (s.work.input.name !== undefined) row.name = s.work.input.name;
      if (a && a.amount > 0) {
        row.accruedFrom = a.from;
        row.accruedTo = a.to;
      }
      if (s.work.statutoryRank) row.statutoryRank = s.work.statutoryRank;
      return row;
    });

    return {
      paidAt,
      kind: payment.kind ?? "payment",
      amount: payment.amount,
      allocationType: payment.allocation.type,
      appliedAmount: payment.amount - remaining,
      unappliedAmount: remaining,
      claims,
    };
  });

  for (const s of states) {
    s.work.balance.costApplied = s.costApplied;
    s.work.balance.interestApplied = s.interestApplied;
    s.work.balance.principalApplied = s.principalApplied;
    delete s.work.statutoryRank;
  }

  const amount = events.reduce((sum, e) => sum + e.amount, 0);
  const unapplied = events.reduce((sum, e) => sum + e.unappliedAmount, 0);
  const result: AppropriationResult = {
    claims: works.map(toClaimResult),
    payment: {
      amount,
      allocationType: input.payment.allocation.type,
      appliedAmount: amount - unapplied,
      unappliedAmount: unapplied,
    },
    totals: buildTotals(works),
    dataVersion: APPROPRIATION_DATA_VERSION,
    disclaimer: STANDARD_DISCLAIMER,
    computedAt,
    events,
  };
  if (dataset) {
    result.interestLimits = interestLimits;
    result.interestLimitsDataVersion = interestLimitsVersionTag(dataset);
  }
  return result;
}

function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
