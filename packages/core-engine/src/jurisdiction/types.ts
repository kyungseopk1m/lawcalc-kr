import type { IsoDate } from "../types";

/** 별표 3 의 한 행 (고등법원·지방법원·지원과 관할구역 원문). */
export interface CourtJurisdictionRow {
  highCourt: string;
  districtCourt: string;
  /** 본원 관할이면 null. */
  branch: string | null;
  /** 관할구역 칸 원문 (공백만 정리). */
  areaText: string;
  /** "다만, 소년보호사건은 ..." 같은 사건 종류별 단서. 조회 결과에 섞지 않고 그대로 보여 준다. */
  note?: string;
}

/** 시·도 + 시·군·구 한 칸. 시·도 전체가 한 법원 관할이면 `name` 이 `wholeUnitName`. */
export interface CourtJurisdictionUnit {
  province: string;
  name: string;
  /** `rows` 의 인덱스. */
  row: number;
  /** 별표 7 시·군법원. 없으면 null. */
  municipalCourt: string | null;
  /** 별표 10 회생법원. 별표 10 대상 지역이 아니면 null. */
  rehabilitationCourt: string | null;
  /** 별표가 지금과 다른 행정구역 이름으로 적은 경우 그 표기 (예: "경상북도 군위군"). */
  statuteName?: string;
}

export interface CourtJurisdictionSnapshot {
  effectiveFrom: IsoDate;
  lawNumber: string;
  promulgatedOn: IsoDate;
  mst: string;
  sourceUrl: string;
  files: Array<{ byeolpyo: number; flSeq: string; sha256: string }>;
  /** 원문 판을 보정했으면 그 사유. */
  correction?: string;
  rows: CourtJurisdictionRow[];
  units: CourtJurisdictionUnit[];
}

export interface CourtJurisdictionDataset {
  version: string;
  updatedAt: string;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: string;
  snapshotMethod: string;
  law: { name: string; lsId: string };
  wholeUnitName: string;
  provinces: string[];
  /** 시행일 오름차순. */
  snapshots: CourtJurisdictionSnapshot[];
}

export interface CourtJurisdictionInput {
  province: string;
  unit: string;
  /** 기준일. 이날 시행 중인 판으로 찾는다. */
  date: IsoDate;
}

export interface CourtSet {
  highCourt: string;
  districtCourt: string;
  branch: string | null;
  municipalCourt: string | null;
  rehabilitationCourt: string | null;
}

export interface CourtJurisdictionResult extends CourtSet {
  province: string;
  unit: string;
  effectiveFrom: IsoDate;
  lawNumber: string;
  lawName: string;
  areaText: string;
  note: string | null;
  statuteName: string | null;
  correction: string | null;
  /** 근거 별표 (값이 있는 것만). */
  byeolpyo: string[];
  /**
   * 기준일 뒤에 시행될 판 중 이 칸의 법원이 달라지는 판. `courts` 가 null 이면 그 판에서는
   * 이 시·군·구 단위가 별표에 따로 없다(구역을 더 잘게 나눴거나 이름이 바뀜).
   */
  upcoming: Array<{ effectiveFrom: IsoDate; lawNumber: string; courts: CourtSet | null }>;
  dataVersion: string;
}
