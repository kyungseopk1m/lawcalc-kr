/** 편철방법 분류. 원문 칸이 다섯 가지 중 하나가 아니면(특정 서류철 지정·조건부 문구) `기타`. */
export type FilingKind = "가철" | "합철" | "첨철" | "별도기록" | "별책" | "기타";

/**
 * 인지액 칸의 종류. 원문은 `text` 에 그대로 둔다.
 *
 * - `none`: "－" (붙일 인지 없음)
 * - `fixed`: 한 가지 금액만 적힌 칸 (`won`)
 * - `statute`: 민사소송 등 인지법·민사조정규칙 조문이 정하는 금액 (`refs` 에 조문 번호)
 * - `other`: 본안 인지액의 2분의 1, 신청서 인지액의 2배, 조건이 붙은 금액 등 위에 들지 않는 칸
 */
export type CivilStamp =
  | { kind: "none"; text: string }
  | { kind: "fixed"; won: number; text: string }
  | { kind: "statute"; refs: string[]; text: string }
  | { kind: "other"; text: string };

export type CivilStampKind = CivilStamp["kind"];

export interface FilingRegulation {
  name: string;
  number: string;
  issuedOn: string;
  effectiveFrom: string;
  serial: string;
}

interface FilingDatasetMeta {
  version: string;
  updatedAt: string;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: string;
  snapshotMethod: string;
  regulation: FilingRegulation;
}

export interface CivilFilingDocument {
  id: string;
  name: string;
  /** 원문 조문 칸 (예: "민소 34②, 35, 36"). */
  article: string;
  stamp: CivilStamp;
  entryMethod: string;
  filingMethod: string;
  filingKind: FilingKind;
}

export interface CivilFilingDataset extends FilingDatasetMeta {
  electronicFiling: { text: string; sourceArticle: string };
  documents: CivilFilingDocument[];
}

export interface CriminalFilingDocument {
  id: string;
  /** 별표(일람표) 번호 1~7. */
  table: number;
  name: string;
  article: string;
  entryMethod: string;
  filingMethod: string;
  filingKind: FilingKind;
  /** 원문이 "″"(윗칸과 같음)로 적어 윗행 값으로 채운 칸. */
  copiedFromAbove?: Array<"article" | "entryMethod" | "filingMethod">;
}

export interface CriminalFilingDataset extends FilingDatasetMeta {
  tables: Array<{ no: number; title: string }>;
  documents: CriminalFilingDocument[];
}
