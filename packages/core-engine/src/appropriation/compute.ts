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
  return withInterpretationNotices(
    {
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
    },
    input,
  );
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

/**
 * 법정충당 (민법 제477조·제479조, 상계는 제499조 준용).
 *
 * 변제가 모든 채무를 소멸시키지 못하면 합의가 없는 한 모든 채무의 비용, 모든 채무의 이자·지연손해금,
 * 원본 순으로 충당한다 (제479조, 대법원 2022. 8. 31. 선고 2022다239896 판결). 각 단계 안에서 채무 사이
 * 순서는 제477조 (도래 → 변제이익 → 이행기, 모두 같으면 그 단계 잔액에 비례 안분) 를 따른다.
 */
function applyLegalAllocation(
  works: ClaimWork[],
  paymentAmount: number,
  asOf: IsoDate,
  labelPrefix = "",
): number {
  const open = works.filter((w) => totalRemaining(w) > 0);
  const ranked = [
    ...rankLegal(open.filter((w) => w.input.dueAt <= asOf)).map((g) => ({ g, dueReached: true })),
    ...rankLegal(open.filter((w) => w.input.dueAt > asOf)).map((g) => ({ g, dueReached: false })),
  ];
  let pool = paymentAmount;

  for (const part of ["cost", "interest", "principal"] as const) {
    for (const [index, { g, dueReached }] of ranked.entries()) {
      if (pool <= 0) return pool;
      const members = g.filter((w) => w.balance[part] > 0);
      if (members.length === 0) continue;
      const balances = members.map((w) => w.balance[part]);
      const denominator = balances.reduce((sum, value) => sum + value, 0);
      // 민법 제477조 제4호 비례 안분. 소송비용 분배와 같은 최대잉여법을 쓴다
      // (`divideProportionally` = BigInt 정확 나머지 + 결정적 tie-break). 안분 총액이 잔액 합을
      // 넘지 않으므로 각 배분액은 그 채무 잔액 이하이고 전액 흡수된다.
      const amounts =
        members.length === 1
          ? [Math.min(pool, denominator)]
          : divideProportionally(Math.min(pool, denominator), balances).perParty;
      const priorityLabel = labelPrefix + formatPriorityLabel(index, dueReached, members);
      for (const [i, w] of members.entries()) {
        const used = amounts[i]!;
        w.balance[part] -= used;
        w.balance[`${part}Applied`] += used;
        pool -= used;
        w.statutoryRank = {
          dueReached,
          debtorBenefitRank: w.input.debtorBenefitRank ?? 0,
          dueAt: w.input.dueAt,
          ...(members.length > 1
            ? { proportionalShare: { numerator: balances[i]!, denominator } }
            : {}),
          priorityLabel,
        };
      }
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

/**
 * 이자제한법(법률 제8322호) 시행일. 부칙 제2항 "이 법 시행 전에 성립한 대차관계에 관한 계약상의
 * 이자율에 관하여도 이 법 시행일 이후부터는 이 법에 따라 이자율을 계산한다." (법률 제10925호 부칙
 * 제2항도 같은 취지). 그 전날까지의 이자는 제한하지 않는다 (구 이자제한법은 1998-01-13 폐지).
 */
const INTEREST_LIMIT_ACT_EFFECTIVE = "2007-06-30";
const INTEREST_LIMIT_ACT_PRE_LAST_DAY = "2007-06-29";

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
  /** 시행 전 약정이 제한된 경우 2007-06-29 까지 쓰는 약정이율. 그 밖에는 없다. */
  preActRate?: number;
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
  // 제2조 제2항: 최고이자율은 약정한 때의 이자율. 시행령 개정 부칙(제25376호·제28413호·제31593호 각
  // 제2조)은 "시행 후(이후) 계약을 체결하거나 갱신하는 분부터" 적용하므로, 시행 전 약정에는 2007-06-30
  // 시행 최고이자율(대통령령 제20118호, 부칙은 시행일만 정함)이 그대로 미친다 (법률 제8322호 부칙 제2항).
  const preAct = limit.agreedAt < INTEREST_LIMIT_ACT_EFFECTIVE;
  const cap = getCapAt(
    dataset,
    "interestLimitAct",
    preAct ? INTEREST_LIMIT_ACT_EFFECTIVE : limit.agreedAt,
  );
  if (cap === undefined) {
    base.notice =
      `약정일 ${limit.agreedAt} 에 적용할 최고이자율 데이터가 없어 제한하지 않았습니다.` +
      (prepaid > 0 ? " 선이자 사전공제(제3조) 검토도 하지 않았습니다." : "") +
      prepaidOnlyNote;
    return base;
  }
  base.capRate = cap;
  const notes: string[] = [];
  if (preAct) {
    notes.push(
      `약정일 ${limit.agreedAt} 이 이자제한법(법률 제8322호) 시행일 2007-06-30 전이라 2007-06-29 까지 이자는 ` +
        "약정이율로, 2007-06-30 부터 이자는 그날 시행한 최고이자율로 계산했습니다 (법률 제8322호 부칙 제2항). " +
        "이후 최고이자율 개정령은 그 시행 후 체결·갱신한 계약부터 적용합니다 (각 개정령 부칙 제2조).",
    );
  }
  const capLabel = preAct ? "2007-06-30 시행" : "약정일";
  // 해석 안내: 2014 개정령 부칙은 "시행 후" 로 적혀 있으나 시행일 당일 약정도 새 최고이자율로 본다.
  if (dataset.slices.some((s) => s.law === "interestLimitAct" && s.from === limit.agreedAt)) {
    notes.push(
      `약정일 ${limit.agreedAt} 은 최고이자율 변경 시행일입니다. 시행일 당일 약정은 새 최고이자율을 적용한 것으로 보았습니다 (해석, 2014 개정령 부칙은 "시행 후" 로 적혀 있어 당일을 종전 이율로 읽는 견해도 있습니다).`,
    );
  }
  // 제2조 제3항: 최고이자율을 초과하는 부분은 무효.
  if (agreedRate !== undefined && agreedRate > cap) {
    base.appliedRate = cap;
    base.capped = true;
    notes.push(
      `약정이율 연 ${formatPercent(agreedRate)} 가 ${capLabel} 최고이자율 연 ${formatPercent(cap)} 를 넘어 ` +
        `연 ${formatPercent(cap)} 로 계산했습니다 (이자제한법 제2조 제3항).`,
    );
  } else {
    notes.push(`${capLabel} 최고이자율은 연 ${formatPercent(cap)} 입니다.`);
  }
  if (prepaid > 0 && claim.interestFrom! < INTEREST_LIMIT_ACT_EFFECTIVE) {
    // 선이자는 이자 기산일(대여일)에 공제한 것으로 본다. 공제가 시행 전이면 제3조를 적용하지 않는다.
    notes.push(
      `이자 기산일 ${claim.interestFrom} 이 이자제한법 시행일 2007-06-30 전이라 선이자 사전공제(제3조) 검토는 하지 않았습니다.` +
        (claim.dueAt >= INTEREST_LIMIT_ACT_EFFECTIVE
          ? " 선이자 기간 중 시행일 이후 부분이 최고이자율을 넘는지는 검토하지 않았습니다 (미검토)."
          : "") +
        prepaidOnlyNote,
    );
  } else if (prepaid > 0) {
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
 * 종전 단일 변제와 같은 규칙(지정 → 잉여는 법정충당: 모든 채무의 비용·이자 먼저, 원본은 제477조 순)
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
    let preActRate: number | undefined;
    if (claim.interestLimitAct && dataset) {
      const review = reviewInterestLimit(claim, dataset);
      interestLimits.push(review);
      if (review.appliedRate !== undefined) rate = review.appliedRate;
      if (review.capped && claim.interestLimitAct.agreedAt < INTEREST_LIMIT_ACT_EFFECTIVE) {
        preActRate = claim.interestRate;
      }
      if (review.prepaid) principal = review.prepaid.principalAfter;
    }
    // 선이자는 이자 기산일~변제기 이자를 미리 받은 것이므로 그 다음 날부터 이자를 붙인다.
    // 이자제한법 제3조 검토 여부(10만원 미만, 2007-06-30 전 공제)와 상관없이 이중으로 붙이지 않는다.
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
      ...(preActRate === undefined ? {} : { preActRate }),
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
      const principal = s.work.balance.principal;
      // 시행 전 약정은 2007-06-29 까지 약정이율, 시행일부터 최고이자율 (법률 제8322호 부칙 제2항).
      const amount =
        s.preActRate !== undefined && from < INTEREST_LIMIT_ACT_EFFECTIVE
          ? simpleInterest(
              principal,
              s.preActRate,
              from,
              paidAt < INTEREST_LIMIT_ACT_EFFECTIVE ? paidAt : INTEREST_LIMIT_ACT_PRE_LAST_DAY,
            ) + simpleInterest(principal, s.rate, INTEREST_LIMIT_ACT_EFFECTIVE, paidAt)
          : simpleInterest(principal, s.rate, from, paidAt);
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
  return withInterpretationNotices(result, input);
}

const ORDER_479_NOTICE =
  "채무가 여러 개이고 변제가 전부를 소멸시키지 못하면 모든 채무의 비용, 모든 채무의 이자·지연손해금을 " +
  "먼저 충당하고 원본은 민법 제477조 순서로 충당했습니다 (민법 제479조, 대법원 2022. 8. 31. 선고 " +
  "2022다239896 판결).";

/** 제479조 다수 채무 충당 순서 안내: 비용·이자가 있는 채무가 둘 이상이고 법정충당이 쓰일 때만 필드를 붙인다. */
function withInterpretationNotices(
  result: AppropriationResult,
  input: AppropriationInput,
): AppropriationResult {
  const withCostOrInterest = input.claims.filter(
    (c) => (c.costBalance ?? 0) > 0 || (c.interestBalance ?? 0) > 0 || c.interestRate !== undefined,
  );
  if (withCostOrInterest.length < 2) return result;
  const usesLegal = [input.payment, ...(input.additionalPayments ?? [])].some(
    (p) =>
      p.allocation.type === "legal" ||
      p.amount > p.allocation.targets.reduce((sum, t) => sum + t.amount, 0),
  );
  if (usesLegal) result.interpretationNotices = [ORDER_479_NOTICE];
  return result;
}

function todayIso(): IsoDate {
  return new Date().toISOString().slice(0, 10);
}
