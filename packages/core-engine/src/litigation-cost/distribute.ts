/**
 * 소송비용 분배 helper.
 *
 * 정책:
 *   - 모든 입력은 원 단위 정수로 검증한다.
 *   - 균등 분배: floor(total / partyCount) 후 잔여원은 앞 당사자부터 1원씩 배정.
 *   - 안분: 각 당사자별 floor(total × partyValue / sum(partyValues)) 후 잔여원은 앞 당사자부터 1원씩 배정.
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

  const basisTotal = partyValuesWon.reduce((sum, value) => sum + value, 0);
  const baseShares = partyValuesWon.map((value) => Math.floor((totalWon * value) / basisTotal));
  const allocated = baseShares.reduce((sum, value) => sum + value, 0);
  const remainder = totalWon - allocated;
  const perParty = baseShares.map((value, index) => (index < remainder ? value + 1 : value));

  return { perParty, remainder };
}
