/**
 * 소송비용 분배 helper.
 *
 * 정책:
 *   - 모든 입력은 원 단위 정수로 검증한다.
 *   - 균등 분배: floor(total / partyCount) 후 잔여원은 앞 당사자부터 1원씩 배정.
 *     (전원 잔여 분수가 동일해 최대잉여법과 동치.)
 *   - 안분: 각 당사자별 floor(total × partyValue / sum(partyValues)) 후 잔여원은
 *     **최대잉여법** — 소수 잉여(정확 유리수 나머지)가 큰 당사자부터 1원씩 배정.
 *     동률이면 기준액 큰 당사자 우선, 그것도 같으면 입력 순 (결정적 tie-break —
 *     당사자 입력 순서를 바꿔도 같은 당사자가 같은 금액을 받는다).
 */

export interface LitigationCostDistributionParts {
  perParty: number[];
  remainder: number;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
  );
}

function isPositiveInteger(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value > 0
  );
}

export function validateDistributeEqualInput(totalWon: number, partyCount: number): void {
  if (!isNonNegativeInteger(totalWon)) {
    throw new RangeError(
      `분배 입력 검증 실패: 총액은 0 이상 정수여야 합니다 (입력: ${String(totalWon)})`,
    );
  }
  if (!isPositiveInteger(partyCount)) {
    throw new RangeError(
      `분배 입력 검증 실패: 당사자수는 양의 정수여야 합니다 (입력: ${String(partyCount)})`,
    );
  }
}

export function validateDistributeProportionalInput(
  totalWon: number,
  partyValuesWon: ReadonlyArray<number>,
): void {
  if (!isNonNegativeInteger(totalWon)) {
    throw new RangeError(
      `분배 입력 검증 실패: 총액은 0 이상 정수여야 합니다 (입력: ${String(totalWon)})`,
    );
  }
  if (!Array.isArray(partyValuesWon) || partyValuesWon.length === 0) {
    throw new RangeError("분배 입력 검증 실패: 안분 기준액 배열은 비어 있을 수 없습니다");
  }
  for (const [index, value] of partyValuesWon.entries()) {
    if (!isPositiveInteger(value)) {
      throw new RangeError(
        `분배 입력 검증 실패: 안분 기준액[${index}] 은 양의 정수여야 합니다 (입력: ${String(value)})`,
      );
    }
  }
}

export function divideEqually(
  totalWon: number,
  partyCount: number,
): LitigationCostDistributionParts {
  validateDistributeEqualInput(totalWon, partyCount);

  const quotient = Math.floor(totalWon / partyCount);
  const remainder = totalWon % partyCount;
  const perParty = Array.from({ length: partyCount }, (_, index) =>
    index < remainder ? quotient + 1 : quotient,
  );

  return { perParty, remainder };
}

export function divideProportionally(
  totalWon: number,
  partyValuesWon: number[],
): LitigationCostDistributionParts {
  validateDistributeProportionalInput(totalWon, partyValuesWon);

  // BigInt — totalWon × partyValue 가 2^53 을 넘는 고액 소가에서도 몫·나머지를 정확히 계산.
  const basisTotalBig = partyValuesWon.reduce((sum, value) => sum + BigInt(value), 0n);
  const totalBig = BigInt(totalWon);
  const products = partyValuesWon.map((value) => totalBig * BigInt(value));
  const baseShares = products.map((product) => Number(product / basisTotalBig));
  const allocated = baseShares.reduce((sum, value) => sum + value, 0);
  const remainder = totalWon - allocated;

  // 최대잉여법: 소수 잉여 내림차순 → 동률 시 기준액 큰 당사자 → 입력 순.
  const extraRecipients = products
    .map((product, index) => ({ index, fraction: product % basisTotalBig }))
    .sort((a, b) => {
      if (a.fraction !== b.fraction) return a.fraction > b.fraction ? -1 : 1;
      const valueDiff = partyValuesWon[b.index]! - partyValuesWon[a.index]!;
      if (valueDiff !== 0) return valueDiff;
      return a.index - b.index;
    })
    .slice(0, remainder);

  const perParty = [...baseShares];
  for (const { index } of extraRecipients) {
    perParty[index] = perParty[index]! + 1;
  }

  return { perParty, remainder };
}
