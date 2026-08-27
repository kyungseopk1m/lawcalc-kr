import {
  caseValueDatasetVersionTag,
  getCaseValueClaimKind,
  loadCaseValueDataset,
  type CaseValueDataset,
} from "./case-value-dataset";

/**
 * 부동산 소가 산정. 「민사소송 등 인지규칙」제10조·제12조·제13조.
 *
 *   소가 = floor(기준 가액 × 소의 종류별 계수)
 *
 * 기준 가액은 사용자가 넣는다. 무엇의 가액인지는 소의 종류마다 다르다 (소유권·인도명도·등기는
 * 목적물 가액, 지역권은 승역지 가액, 상린관계는 부담을 받는 이웃 토지 부분의 가액, 경계확정은
 * 다툼이 있는 범위의 토지부분 가액). 각 종류의 `objectLabelKo` 가 그 이름을 담는다. 공유지분을
 * 목적물로 하는 사건은 지분 비율을 곱한 뒤의 가액을 넣거나 `shareNumerator`/`shareDenominator`
 * 로 넘긴다.
 *
 * 담보물권·전세권 종류(`securedClaimLimited`)는 권리 가액이 "목적물 가액을 **한도**로 한
 * 피담보채권액(근저당권은 채권최고액) 또는 전세금액" 이라, 계수를 곱하기 전에
 * min(목적물 가액, 피담보채권액) 을 먼저 구한다. 피담보채권액이 없으면 목적물 가액으로 조용히
 * 넘어가지 않고 거부한다. 조용히 넘어가면 소가와 인지대가 과다 산출된다.
 *
 * 계수와 지분을 모두 정수 분자·분모로 다루고 **곱한 뒤 나눈다**. 1/3, 1/6, 1/12 를 부동소수로
 * 먼저 만들면 가액이 커질수록 원 단위가 어긋난다. 한도 비교도 지분 분모를 곱해 올린 정수끼리
 * 하므로 중간 절사가 생기지 않는다.
 */
export interface RealEstateCaseValueInput {
  /** 기준 가액 (원). 음이 아닌 정수. 소의 종류의 `objectLabelKo` 가 무엇의 가액인지 알려준다. */
  objectValueWon: number;
  /** 소의 종류 id (`data/case-value/v1.json` 의 `claimKinds[].id`). */
  claimKindId: string;
  /**
   * 피담보채권의 원본액 (근저당권은 채권최고액, 전세권은 전세금액). 원 단위 정수.
   * `securedClaimLimited` 종류에는 필수이고, 그 밖의 종류에 넘기면 거부한다.
   */
  securedClaimWon?: number;
  /** 공유지분 분자. 기본 1. */
  shareNumerator?: number;
  /** 공유지분 분모. 기본 1. */
  shareDenominator?: number;
}

export interface RealEstateCaseValueResult {
  /** 산출 소가 (원 단위 절사). 그대로 `computeStampDuty` 의 `caseValue` 로 넘길 수 있다. */
  caseValue: number;
  /** 지분 반영 후 기준 가액. */
  objectValueAfterShare: number;
  /** 계수를 곱하기 직전의 권리 가액. 담보물권·전세권은 한도를 적용한 값이라 위와 다를 수 있다. */
  rightValueBeforeCoefficient: number;
  claimKindLabelKo: string;
  /** 적용 계수 텍스트 (예: `"1/3"`). */
  coefficientText: string;
  formulaText: string;
  dataVersion: string;
  computedAt: string;
}

export interface ComputeRealEstateCaseValueDeps {
  dataset?: CaseValueDataset;
  computedAt?: string;
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new RangeError(`소가 산정: ${label}가 유효하지 않습니다 (입력: ${value})`);
  }
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 1 || !Number.isInteger(value)) {
    throw new RangeError(`소가 산정: ${label}가 유효하지 않습니다 (입력: ${value})`);
  }
}

export function computeRealEstateCaseValue(
  input: RealEstateCaseValueInput,
  deps?: ComputeRealEstateCaseValueDeps,
): RealEstateCaseValueResult {
  assertNonNegativeInt(input.objectValueWon, "기준 가액");
  const shareNumerator = input.shareNumerator ?? 1;
  const shareDenominator = input.shareDenominator ?? 1;
  assertPositiveInt(shareNumerator, "공유지분 분자");
  assertPositiveInt(shareDenominator, "공유지분 분모");
  if (shareNumerator > shareDenominator) {
    throw new RangeError(
      `소가 산정: 공유지분이 1 을 넘습니다 (${shareNumerator}/${shareDenominator})`,
    );
  }

  const dataset = loadCaseValueDataset(deps?.dataset);
  const computedAt = deps?.computedAt ?? new Date().toISOString();
  const kind = getCaseValueClaimKind(dataset, input.claimKindId);

  // 지분 분모를 곱해 올린 정수 공간에서 다룬다. 한도 비교까지 끝낸 뒤 한 번만 나눈다.
  const scaledObjectValue = input.objectValueWon * shareNumerator;
  let scaledRightValue = scaledObjectValue;
  let securedClaimWon: number | undefined;
  if (kind.securedClaimLimited) {
    if (input.securedClaimWon === undefined) {
      throw new RangeError(
        `소가 산정: "${kind.labelKo}" 는 목적물 가액을 한도로 한 피담보채권액(근저당권은 채권최고액)` +
          ` 또는 전세금액을 입력해야 합니다 (인지규칙 ${kind.sourceArticle})`,
      );
    }
    assertNonNegativeInt(input.securedClaimWon, "피담보채권액");
    securedClaimWon = input.securedClaimWon;
    // 목적물 가액이 한도다. 지분을 반영한 목적물 가액과 피담보채권액 중 작은 쪽이 권리 가액이 된다.
    scaledRightValue = Math.min(scaledObjectValue, securedClaimWon * shareDenominator);
  } else if (input.securedClaimWon !== undefined) {
    throw new RangeError(
      `소가 산정: "${kind.labelKo}" 는 피담보채권액을 쓰지 않는 소의 종류입니다`,
    );
  }

  const objectValueAfterShare = Math.floor(scaledObjectValue / shareDenominator);
  const rightValueBeforeCoefficient = Math.floor(scaledRightValue / shareDenominator);
  const caseValue = Math.floor(
    (scaledRightValue * kind.numerator) / (shareDenominator * kind.denominator),
  );

  const coefficientText = `${kind.numerator}/${kind.denominator}`;
  const shareText =
    shareNumerator === shareDenominator ? "" : ` × 공유지분 ${shareNumerator}/${shareDenominator}`;
  const objectText = `${kind.objectLabelKo} ${input.objectValueWon.toLocaleString("en-US")}원${shareText}`;
  const baseText =
    securedClaimWon === undefined
      ? objectText
      : `${objectText} 한도의 피담보채권액 ${securedClaimWon.toLocaleString("en-US")}원` +
        ` (권리 가액 ${rightValueBeforeCoefficient.toLocaleString("en-US")}원)`;
  const formulaText =
    `${kind.labelKo} (인지규칙 ${kind.sourceArticle}): ` +
    `${baseText} × ${coefficientText}` +
    ` → 소가 ${caseValue.toLocaleString("en-US")}원`;

  return {
    caseValue,
    objectValueAfterShare,
    rightValueBeforeCoefficient,
    claimKindLabelKo: kind.labelKo,
    coefficientText,
    formulaText,
    dataVersion: caseValueDatasetVersionTag(dataset),
    computedAt,
  };
}
