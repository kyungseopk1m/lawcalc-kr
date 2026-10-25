import type {
  AllocationTarget,
  AppropriationAllocationDirective,
  AppropriationClaimInput,
  AppropriationInput,
  AppropriationPaymentInput,
} from "./types";

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CLAIMS = 50;
const MAX_NAME_LENGTH = 200;
const MAX_PAYMENTS = 200;
const PREFIX = "변제충당 입력 검증 실패";

/**
 * 새 키(여러 번 변제·상계·이자·이자제한법)가 하나라도 있는가. 없으면 종전 단일 변제 경로를 쓴다.
 */
export function isExtendedAppropriationInput(input: AppropriationInput): boolean {
  return (
    input.additionalPayments !== undefined ||
    input.payment.kind !== undefined ||
    input.claims.some(
      (c) =>
        c.interestRate !== undefined ||
        c.interestFrom !== undefined ||
        c.interestLimitAct !== undefined,
    )
  );
}

export function validateAppropriationInput(input: AppropriationInput): void {
  if (input === null || typeof input !== "object") {
    throw new RangeError(`${PREFIX}: 입력 객체가 필요합니다.`);
  }
  if (!Array.isArray(input.claims)) {
    throw new RangeError(`${PREFIX}: claims 배열이 필요합니다.`);
  }
  if (input.claims.length < 1) {
    throw new RangeError(`${PREFIX}: 채권은 최소 1건 입력해야 합니다.`);
  }
  if (input.claims.length > MAX_CLAIMS) {
    throw new RangeError(`${PREFIX}: 채권은 ${MAX_CLAIMS}건 이하로 입력해야 합니다.`);
  }

  const claimIds = new Set<string>();
  for (const claim of input.claims) {
    validateClaim(claim);
    if (claimIds.has(claim.id)) {
      throw new RangeError(`${PREFIX}: 채권 id "${claim.id}" 가 중복되었습니다.`);
    }
    claimIds.add(claim.id);
  }

  validatePayment(input.payment, claimIds);
  if (input.additionalPayments !== undefined) {
    if (!Array.isArray(input.additionalPayments)) {
      throw new RangeError(`${PREFIX}: additionalPayments 는 배열이어야 합니다.`);
    }
    if (input.additionalPayments.length + 1 > MAX_PAYMENTS) {
      throw new RangeError(`${PREFIX}: 변제는 ${MAX_PAYMENTS}건 이하로 입력해야 합니다.`);
    }
    for (const payment of input.additionalPayments) validatePayment(payment, claimIds);
  }
  if (isExtendedAppropriationInput(input)) {
    // 여러 번 변제·이자는 날짜 순서로만 의미가 있다.
    for (const payment of [input.payment, ...(input.additionalPayments ?? [])]) {
      if (payment.paidAt === undefined) {
        throw new RangeError(
          `${PREFIX}: 여러 번 변제·상계·이자 계산에는 모든 변제의 변제일(상계는 상계적상일)이 필요합니다.`,
        );
      }
    }
  }

  if (input.computedAt !== undefined && !ISO_DATE_PATTERN.test(input.computedAt)) {
    throw new RangeError(`${PREFIX}: computedAt 은 YYYY-MM-DD 형식이어야 합니다.`);
  }
}

function validateClaim(claim: AppropriationClaimInput): void {
  if (claim === null || typeof claim !== "object") {
    throw new RangeError(`${PREFIX}: 채권 객체가 필요합니다.`);
  }
  if (typeof claim.id !== "string" || !ID_PATTERN.test(claim.id)) {
    throw new RangeError(`${PREFIX}: 채권 id 는 1~64자의 영문/숫자/_/- 만 허용됩니다.`);
  }
  if (claim.name !== undefined) {
    if (typeof claim.name !== "string" || claim.name.length > MAX_NAME_LENGTH) {
      throw new RangeError(
        `${PREFIX}: 채권 ${claim.id} 의 name 은 ${MAX_NAME_LENGTH}자 이하 문자열이어야 합니다.`,
      );
    }
  }
  assertNonNegativeInteger(
    claim.principalBalance,
    `${PREFIX}: 채권 ${claim.id} 의 principalBalance`,
  );
  if (claim.costBalance !== undefined) {
    assertNonNegativeInteger(claim.costBalance, `${PREFIX}: 채권 ${claim.id} 의 costBalance`);
  }
  if (claim.interestBalance !== undefined) {
    assertNonNegativeInteger(
      claim.interestBalance,
      `${PREFIX}: 채권 ${claim.id} 의 interestBalance`,
    );
  }
  if (typeof claim.dueAt !== "string" || !ISO_DATE_PATTERN.test(claim.dueAt)) {
    throw new RangeError(`${PREFIX}: 채권 ${claim.id} 의 dueAt 은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (claim.debtorBenefitRank !== undefined) {
    if (
      typeof claim.debtorBenefitRank !== "number" ||
      !Number.isInteger(claim.debtorBenefitRank) ||
      claim.debtorBenefitRank < 0
    ) {
      throw new RangeError(
        `${PREFIX}: 채권 ${claim.id} 의 debtorBenefitRank 는 0 이상 정수여야 합니다.`,
      );
    }
  }
  validateClaimInterest(claim);
}

function validateClaimInterest(claim: AppropriationClaimInput): void {
  const label = `${PREFIX}: 채권 ${claim.id} 의`;
  if (claim.interestRate !== undefined) {
    if (
      typeof claim.interestRate !== "number" ||
      !Number.isFinite(claim.interestRate) ||
      claim.interestRate <= 0 ||
      claim.interestRate > 1
    ) {
      throw new RangeError(`${label} interestRate 는 0 초과 1 이하(연 100% 이하)여야 합니다.`);
    }
  }
  if (claim.interestFrom !== undefined && !ISO_DATE_PATTERN.test(claim.interestFrom)) {
    throw new RangeError(`${label} interestFrom 은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  const limit = claim.interestLimitAct;
  const prepaid = limit?.prepaidInterest;
  if (
    (claim.interestRate !== undefined || (prepaid ?? 0) > 0) &&
    claim.interestFrom === undefined
  ) {
    throw new RangeError(`${label} 이자 기산일(interestFrom)이 필요합니다.`);
  }
  if (limit === undefined) return;
  if (limit === null || typeof limit !== "object") {
    throw new RangeError(`${label} interestLimitAct 는 객체여야 합니다.`);
  }
  if (typeof limit.agreedAt !== "string" || !ISO_DATE_PATTERN.test(limit.agreedAt)) {
    throw new RangeError(`${label} 약정일(agreedAt)은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (prepaid !== undefined) {
    assertNonNegativeInteger(prepaid, `${label} prepaidInterest`);
    if (prepaid >= claim.principalBalance) {
      throw new RangeError(`${label} 선이자는 원본보다 작아야 합니다.`);
    }
    if (prepaid > 0 && claim.dueAt < claim.interestFrom!) {
      throw new RangeError(`${label} 선이자 검토에는 이행기가 이자 기산일 이후여야 합니다.`);
    }
  }
}

function validatePayment(payment: AppropriationPaymentInput, claimIds: Set<string>): void {
  if (payment === null || typeof payment !== "object") {
    throw new RangeError(`${PREFIX}: payment 객체가 필요합니다.`);
  }
  if (
    typeof payment.amount !== "number" ||
    !Number.isInteger(payment.amount) ||
    payment.amount <= 0 ||
    !Number.isSafeInteger(payment.amount)
  ) {
    throw new RangeError(`${PREFIX}: payment.amount 는 1 이상 정수여야 합니다.`);
  }
  if (payment.paidAt !== undefined && !ISO_DATE_PATTERN.test(payment.paidAt)) {
    throw new RangeError(`${PREFIX}: payment.paidAt 은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  if (payment.kind !== undefined && payment.kind !== "payment" && payment.kind !== "setoff") {
    throw new RangeError(`${PREFIX}: payment.kind 는 "payment" 또는 "setoff" 여야 합니다.`);
  }
  validateAllocationDirective(payment.allocation, payment.amount, claimIds);
}

function validateAllocationDirective(
  directive: AppropriationAllocationDirective,
  paymentAmount: number,
  claimIds: Set<string>,
): void {
  if (directive === null || typeof directive !== "object") {
    throw new RangeError(`${PREFIX}: allocation 객체가 필요합니다.`);
  }
  switch (directive.type) {
    case "legal":
      if ("targets" in (directive as Record<string, unknown>)) {
        throw new RangeError(`${PREFIX}: legal 충당은 targets 를 가질 수 없습니다.`);
      }
      return;
    case "agreement":
    case "debtorDesignation":
    case "creditorDesignation": {
      if (!Array.isArray(directive.targets) || directive.targets.length === 0) {
        throw new RangeError(`${PREFIX}: ${directive.type} 충당은 targets 최소 1건이 필요합니다.`);
      }
      let sum = 0;
      for (const target of directive.targets) {
        validateAllocationTarget(target, claimIds);
        sum += target.amount;
      }
      if (sum > paymentAmount) {
        throw new RangeError(
          `${PREFIX}: targets 금액 합계 (${sum}) 가 payment.amount (${paymentAmount}) 를 초과했습니다.`,
        );
      }
      return;
    }
    default:
      throw new RangeError(`${PREFIX}: 알 수 없는 allocation.type 입니다.`);
  }
}

function validateAllocationTarget(target: AllocationTarget, claimIds: Set<string>): void {
  if (target === null || typeof target !== "object") {
    throw new RangeError(`${PREFIX}: allocation target 객체가 필요합니다.`);
  }
  if (typeof target.claimId !== "string" || !claimIds.has(target.claimId)) {
    throw new RangeError(
      `${PREFIX}: allocation target 의 claimId "${target.claimId}" 가 채권 목록에 없습니다.`,
    );
  }
  if (
    typeof target.amount !== "number" ||
    !Number.isInteger(target.amount) ||
    target.amount <= 0 ||
    !Number.isSafeInteger(target.amount)
  ) {
    throw new RangeError(`${PREFIX}: allocation target.amount 는 1 이상 정수여야 합니다.`);
  }
}

/**
 * 채권 잔액 검증. `payment.amount` 와 같은 기준(`Number.isSafeInteger`)을 쓴다.
 *
 * 직전 구현은 `Number.isInteger` + `isFinite` 만 봐서 `1e300` 같은 값이 통과했다.
 * 잔액은 안분에서 `pool × 잔액` 곱에 들어가므로 2^53 을 넘으면 정확도가 깨진다.
 */
function assertNonNegativeInteger(value: number, label: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} 는 0 이상 안전 정수(2^53 미만)여야 합니다.`);
  }
}
