/** 시·도 / 시·군·구 / 읍·면·동 한 칸과 그 안에 나오는 5자리 우편번호. */
export interface PostalRegion {
  sido: string;
  /** 시·군·구가 없는 시·도(세종특별자치시)는 빈 문자열. */
  sigungu: string;
  /** 읍·면 또는 법정동. */
  emd: string;
  /** "06120" 또는 연속 구간 "06123-06152". 오름차순. */
  codes: string[];
  /** 같은 법정동 안의 행정동명 (검색용). */
  adminDongs?: string[];
  /** 읍·면 안의 리(里)와 원본에서 그 리 건물 행에 나오는 번호. 이름순. */
  ris?: { name: string; codes: string[] }[];
  /** 검색 결과가 리 하나로 좁혀졌을 때 그 리 이름. 이때 `codes` 는 그 리의 번호다. */
  ri?: string;
}

export interface PostalCodeDataset {
  version: string;
  updatedAt: string;
  source: string;
  sourceUrl: string;
  license: string;
  snapshotDate: string;
  snapshotMethod: string;
  /** 원본 고시파일의 작성 기준일. */
  baseDate: string;
  /** 원본 고시일. */
  noticeDate: string;
  counts: { sido: number; sigungu: number; emd: number; codes: number; ri: number };
  regions: PostalRegion[];
}

export interface PostalSearchResult {
  /** 맞은 칸 (최대 `limit` 개, 데이터셋 순서). */
  hits: PostalRegion[];
  /** 잘리기 전 전체 개수. */
  total: number;
  /** 검색어가 우편번호(숫자)였으면 "code", 지역 이름이었으면 "name". 빈 검색어는 null. */
  mode: "code" | "name" | null;
}
