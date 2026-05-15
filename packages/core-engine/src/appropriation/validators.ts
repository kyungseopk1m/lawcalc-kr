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
const PREFIX = "변제충당 입력 검증 실패";

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

function assertNonNegativeInteger(value: number, label: string): void {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    !Number.isFinite(value)
  ) {
    throw new RangeError(`${label} 는 0 이상 정수여야 합니다.`);
  }
}
