import type { IsoDate } from "../types";
import { DEFAULT_CASE_VALUE_DATASET } from "./case-value-dataset.generated";

/**
 * 부동산 소가 계수 dataset. `data/case-value/v1.json` 이 single source.
 *
 * 「민사소송 등 인지규칙」제10조(물건에 대한 권리의 가액)·제12조(통상의 소)·제13조(등기·등록 등
 * 절차에 관한 소)가 소의 종류별로 정한 "기준 가액의 N분의 1" 계수표다. 대법원 전자소송
 * '부동산 가액 및 소가계산기' 의 소의 종류 표(`PSP009P02.xml`)와 대조했다.
 *
 * **계수는 정수 분자·분모로 보관한다.** 1/3, 1/6, 1/12 가 부동소수로는 정확히 표현되지 않아
 * 큰 목적물 가액에서 원 단위 오차가 난다. 계산도 곱한 뒤 나누는 순서로 한다.
 *
 * **계수를 곱할 기준 가액이 소의 종류마다 다르다.** 지역권은 요역지가 아니라 승역지 가액(제10조
 * 제4항), 상린관계는 부담을 받는 이웃 토지 부분의 가액(제12조 제6호), 경계확정은 다툼이 있는
 * 범위의 토지부분 가액(제12조 제8호)이다. 무엇의 가액을 넣어야 하는지는 `objectLabelKo` 가
 * 담고, 화면 입력란 라벨로 그대로 쓴다.
 *
 * 본 dataset 은 **계수와 기준만** 담는다. 가액 자체(토지 = 개별공시지가 × 면적, 건물 =
 * 시가표준액)는 「지방세법 시행규칙」의 구조지수·용도지수·위치지수·경과연수별 잔가율 별표가
 * 있어야 산정되며 본 도메인 밖이다. 사용자가 가액을 입력한다.
 */
export interface CaseValueClaimKind {
  id: string;
  groupKo: string;
  labelKo: string;
  /** 계수를 곱할 기준 가액의 이름 (예: `"목적물 가액"`, `"승역지 가액"`). 입력란 라벨로 쓴다. */
  objectLabelKo: string;
  numerator: number;
  denominator: number;
  /**
   * 담보물권·전세권처럼 권리 가액이 "목적물 가액을 한도로 한 피담보채권액(근저당권은 채권최고액)
   * 또는 전세금액" 인 종류(제10조 제5항·제6항, 제13조 제1항 제2호 나목). 이 종류는 계수를
   * 곱하기 전에 min(목적물 가액, 피담보채권액) 을 먼저 구해야 하므로 피담보채권액 입력이 필수다.
   */
  securedClaimLimited?: boolean;
  sourceArticle: string;
}

export interface CaseValueSourceLaw {
  name: string;
  lsId: string;
  currentEffectiveFrom: IsoDate;
  currentRuleNumber: string;
  sourceUrl: string;
  sourceRef: string;
}

export interface CaseValueRoundingPolicy {
  mode: "floor";
  unitWon: number;
  note: string;
}

export interface CaseValueDataset {
  version: string;
  updatedAt: IsoDate;
  sourceLaw: CaseValueSourceLaw;
  note: string;
  roundingPolicy: CaseValueRoundingPolicy;
  claimKinds: CaseValueClaimKind[];
}

const DEFAULT_DATASET: CaseValueDataset = DEFAULT_CASE_VALUE_DATASET;

function validate(dataset: CaseValueDataset): void {
  if (!dataset.version || !dataset.updatedAt) {
    throw new Error("CaseValueDataset: version/updatedAt are required");
  }
  if (!dataset.sourceLaw?.name || !dataset.sourceLaw.sourceUrl) {
    throw new Error("CaseValueDataset: sourceLaw.name/sourceUrl are required");
  }
  if (!Array.isArray(dataset.claimKinds) || dataset.claimKinds.length === 0) {
    throw new Error("CaseValueDataset: claimKinds must be a non-empty array");
  }
  if (dataset.roundingPolicy?.mode !== "floor") {
    throw new RangeError('CaseValueDataset: roundingPolicy.mode must be "floor"');
  }
  const seen = new Set<string>();
  for (const [i, k] of dataset.claimKinds.entries()) {
    if (!k.id || !k.labelKo || !k.groupKo || !k.objectLabelKo || !k.sourceArticle) {
      throw new Error(
        `claimKinds[${i}]: id/groupKo/labelKo/objectLabelKo/sourceArticle are required`,
      );
    }
    if (k.securedClaimLimited !== undefined && typeof k.securedClaimLimited !== "boolean") {
      throw new RangeError(`claimKinds[${i}] ("${k.id}"): securedClaimLimited must be a boolean`);
    }
    if (seen.has(k.id)) {
      throw new RangeError(`claimKinds: duplicate id "${k.id}"`);
    }
    seen.add(k.id);
    if (!Number.isInteger(k.numerator) || k.numerator < 1) {
      throw new RangeError(`claimKinds[${i}].numerator: must be a positive integer`);
    }
    if (!Number.isInteger(k.denominator) || k.denominator < 1) {
      throw new RangeError(`claimKinds[${i}].denominator: must be a positive integer`);
    }
    // 계수가 1 을 넘는 소의 종류는 인지규칙에 없다. 넘으면 데이터 입력 사고다.
    if (k.numerator > k.denominator) {
      throw new RangeError(
        `claimKinds[${i}] ("${k.id}"): 계수가 1 을 넘습니다 (${k.numerator}/${k.denominator})`,
      );
    }
  }
}

export function loadCaseValueDataset(override?: CaseValueDataset): CaseValueDataset {
  const dataset = override ?? DEFAULT_DATASET;
  validate(dataset);
  return dataset;
}

/** dataset 식별자 (`case-value/vX.Y.Z`). */
export function caseValueDatasetVersionTag(dataset: CaseValueDataset): string {
  return `case-value/v${dataset.version}`;
}

/** 소의 종류 lookup. 없으면 RangeError. */
export function getCaseValueClaimKind(dataset: CaseValueDataset, id: string): CaseValueClaimKind {
  const found = dataset.claimKinds.find((k) => k.id === id);
  if (!found) {
    throw new RangeError(`getCaseValueClaimKind: 소의 종류 "${id}" 가 본 dataset 에 없습니다`);
  }
  return found;
}

/** UI dropdown 용 전체 enumeration (dataset 순서 = 인지규칙 조문 순서). */
export function listCaseValueClaimKinds(dataset?: CaseValueDataset): readonly CaseValueClaimKind[] {
  return loadCaseValueDataset(dataset).claimKinds;
}
