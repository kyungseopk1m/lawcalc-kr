import { fold } from "../filings";
import { DEFAULT_POSTAL_CODE_DATASET } from "./dataset.generated";
import type { PostalCodeDataset, PostalRegion, PostalSearchResult } from "./types";

export type { PostalCodeDataset, PostalRegion, PostalSearchResult } from "./types";

/**
 * 우편번호 찾기 (시·도 / 시·군·구 / 읍·면·동 요약). `data/postal-codes/v1.json` 이 single
 * source 다. 건물 단위가 아니라 읍·면·동 안에 나오는 번호를 모은 것이라 한 동에 번호가 여럿이다.
 */
export function loadPostalCodes(dataset?: PostalCodeDataset): PostalCodeDataset {
  const ds = dataset ?? DEFAULT_POSTAL_CODE_DATASET;
  if (!ds.version || !ds.snapshotDate || !Array.isArray(ds.regions) || ds.regions.length === 0) {
    throw new Error("PostalCodeDataset: version/snapshotDate/regions are required");
  }
  return ds;
}

export const postalCodesVersionTag = (ds: PostalCodeDataset): string =>
  `postal-codes/v${ds.version}`;

/** 우편번호 하나 또는 구간 하나가 `code` 를(또는 `code` 로 시작하는 번호를) 품는지. */
function codeMatches(entry: string, code: string): boolean {
  const [lo, hi = lo] = entry.split("-") as [string, string?];
  if (code.length === 5) return lo <= code && code <= hi;
  // 앞자리만 넣었으면 그 앞자리로 시작하는 번호 범위와 겹치는지 본다.
  const pLo = code.padEnd(5, "0");
  const pHi = code.padEnd(5, "9");
  return lo <= pHi && pLo <= hi;
}

/**
 * 지역 이름이나 우편번호로 찾는다.
 * - 숫자만 2~5자리: 그 번호(앞자리)가 나오는 읍·면·동 (역조회).
 * - 그 밖: 공백으로 나눈 낱말이 모두 "시·도 시·군·구 읍·면·동(행정동 포함)" 안에 들어 있는 칸.
 *   칸 자체는 안 맞고 "… 읍·면 리" 로 맞는 리가 있으면 그 리마다 `ri` 와 리 번호를 단 칸을 낸다.
 *   가운뎃점은 공백처럼 낱말을 가른다.
 */
export function searchPostalCodes(
  query: string,
  options: { limit?: number } = {},
  dataset?: PostalCodeDataset,
): PostalSearchResult {
  const ds = loadPostalCodes(dataset);
  const limit = options.limit ?? 200;
  const q = query.trim();
  if (q === "") return { hits: [], total: 0, mode: null };

  const digits = q.replace(/[\s-]/g, "");
  let all: PostalRegion[];
  let mode: "code" | "name";
  if (/^\d{2,5}$/.test(digits)) {
    mode = "code";
    all = ds.regions.filter((r) => r.codes.some((c) => codeMatches(c, digits)));
  } else {
    mode = "name";
    // 가운뎃점도 낱말 경계로 본다 ("서울·역삼동" = "서울 역삼동").
    const words = q
      .normalize("NFC")
      .split(/[\s\u00B7\u2022\u2024\u2027\u2219\u22C5\u30FB\u318D\uFF65]+/)
      .map(fold)
      .filter(Boolean);
    if (words.length === 0) return { hits: [], total: 0, mode: null };
    all = [];
    for (const r of ds.regions) {
      const hay = fold([r.sido, r.sigungu, r.emd, ...(r.adminDongs ?? [])].join(""));
      if (words.every((w) => hay.includes(w))) {
        all.push(r);
        continue;
      }
      for (const ri of r.ris ?? []) {
        const riHay = hay + fold(ri.name);
        if (words.every((w) => riHay.includes(w))) {
          const { sido, sigungu, emd, adminDongs } = r;
          all.push({
            sido,
            sigungu,
            emd,
            ...(adminDongs && { adminDongs }),
            ri: ri.name,
            codes: ri.codes,
          });
        }
      }
    }
  }
  return { hits: all.slice(0, limit), total: all.length, mode };
}

/** "06123-06152" → "06123~06152" 처럼 화면·복사용으로 적는다. */
export const formatPostalCodes = (codes: string[]): string =>
  codes.map((c) => c.replace("-", "~")).join(", ");

/** 관할법원 데이터셋이 아직 통합 전 이름으로 적은 시·도. */
const JURISDICTION_PROVINCE_ALIASES: Record<string, string[]> = {
  전남광주통합특별시: ["전라남도", "광주광역시"],
};

/**
 * 우편번호 칸의 시·도·시·군·구를 관할법원 찾기의 (시·도, 시·군·구) 칸으로 옮긴다.
 * `units(province)` 는 그 시·도의 관할 칸 이름 목록, `wholeUnitName` 은 시·도 전체 칸 이름.
 * 일반구("수원시 장안구")는 시("수원시")로, 시·도 전체가 한 법원이면 전체 칸으로 맞춘다.
 * 맞는 칸이 없으면 null.
 */
export function postalRegionToJurisdiction(
  region: Pick<PostalRegion, "sido" | "sigungu">,
  units: (province: string) => string[],
  wholeUnitName: string,
): { province: string; unit: string } | null {
  const provinces = JURISDICTION_PROVINCE_ALIASES[region.sido] ?? [region.sido];
  const city = region.sigungu.split(" ")[0] ?? "";
  for (const province of provinces) {
    const list = units(province);
    for (const unit of [region.sigungu, city, wholeUnitName]) {
      if (unit !== "" && list.includes(unit)) return { province, unit };
    }
  }
  return null;
}
