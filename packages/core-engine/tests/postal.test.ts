import { describe, expect, it } from "vitest";

import { listJurisdictionUnits, loadCourtJurisdiction } from "../src/jurisdiction";
import {
  formatPostalCodes,
  loadPostalCodes,
  postalRegionToJurisdiction,
  searchPostalCodes,
} from "../src/postal";

/** 대조값은 우정사업본부 지역별 주소 DB (2026-10-08 기준, 2026-10-13 고시) 원본 행. */
const names = (q: string) =>
  searchPostalCodes(q).hits.map((r) => [r.sido, r.sigungu, r.emd].filter(Boolean).join(" "));

describe("우편번호 데이터셋", () => {
  it("메타와 개수", () => {
    const ds = loadPostalCodes();
    expect(ds.baseDate).toBe("2026-10-08");
    expect(ds.counts.emd).toBe(ds.regions.length);
    expect(ds.counts.sido).toBe(16);
    for (const r of ds.regions) {
      expect(r.codes.length).toBeGreaterThan(0);
      for (const c of r.codes) expect(c).toMatch(/^\d{5}(-\d{5})?$/);
    }
  });

  it("빈 데이터셋은 거부", () => {
    expect(() => loadPostalCodes({ ...loadPostalCodes(), regions: [] })).toThrow();
  });
});

describe("우편번호 찾기", () => {
  it("이름 검색은 공백·가운뎃점을 무시하고 낱말을 모두 품은 칸만 낸다", () => {
    expect(names("강남구 역삼동")).toEqual(["서울특별시 강남구 역삼동"]);
    expect(names("강남구역삼동")).toEqual(["서울특별시 강남구 역삼동"]);
    expect(names("서울·강남구 역삼동")).toEqual(["서울특별시 강남구 역삼동"]);
    const hit = searchPostalCodes("강남구 역삼동").hits[0]!;
    expect(hit.codes).toEqual(["06120", "06123-06152", "06210-06257"]);
    expect(formatPostalCodes(hit.codes)).toBe("06120, 06123~06152, 06210~06257");
  });

  it("행정동 이름으로도 찾는다", () => {
    expect(names("역삼1동")).toEqual(["서울특별시 강남구 역삼동"]);
  });

  it("동명 동은 여러 시·도에서 나온다", () => {
    const all = names("금호동");
    expect(all.length).toBeGreaterThan(1);
    expect(all).toContain("서울특별시 성동구 금호동1가");
  });

  it("우편번호 역조회: 다섯 자리는 그 번호, 앞자리는 겹치는 구간", () => {
    expect(searchPostalCodes("06236").mode).toBe("code");
    expect(names("06236")).toContain("서울특별시 강남구 역삼동");
    expect(names("06121")).not.toContain("서울특별시 강남구 역삼동");
    expect(names("0612")).toContain("서울특별시 강남구 역삼동");
    expect(searchPostalCodes("99999").total).toBe(0);
  });

  it("리 이름으로 찾으면 그 리의 번호만 낸다", () => {
    const riNames = (q: string) =>
      searchPostalCodes(q).hits.map((r) =>
        [r.sido, r.sigungu, r.emd, r.ri].filter(Boolean).join(" "),
      );
    expect(riNames("모전리")).toContain("강원특별자치도 강릉시 강동면 모전리");
    expect(riNames("모전리").length).toBeGreaterThan(1);
    expect(riNames("강동면 모전리")).toEqual(["강원특별자치도 강릉시 강동면 모전리"]);
    const hit = searchPostalCodes("이천시 백사면 모전리").hits;
    expect(hit).toHaveLength(1);
    expect(hit[0]!.ri).toBe("모전리");
    expect(hit[0]!.codes).toEqual(["17311", "17316"]);
    expect(hit[0]!.ris).toBeUndefined();
    // 읍·면 자체가 맞으면 리마다 펼치지 않는다.
    expect(riNames("이천시 백사면")).toEqual(["경기도 이천시 백사면"]);
    expect(loadPostalCodes().counts.ri).toBeGreaterThan(10000);
  });

  it("세종은 시·군·구 없이 읍·면·동만", () => {
    const r = searchPostalCodes("세종 조치원읍").hits;
    expect(r).toHaveLength(1);
    expect(r[0]!.sigungu).toBe("");
  });

  it("빈 검색어와 limit", () => {
    expect(searchPostalCodes("  ")).toEqual({ hits: [], total: 0, mode: null });
    const r = searchPostalCodes("동", { limit: 5 });
    expect(r.hits).toHaveLength(5);
    expect(r.total).toBeGreaterThan(5);
  });
});

describe("관할법원 칸으로 옮기기", () => {
  const ds = loadCourtJurisdiction();
  const units = (p: string) => listJurisdictionUnits("2026-10-25", p);
  const map = (sido: string, sigungu: string) =>
    postalRegionToJurisdiction({ sido, sigungu }, units, ds.wholeUnitName);

  it("시·군·구가 그대로 있으면 그 칸", () => {
    expect(map("대구광역시", "북구")).toEqual({ province: "대구광역시", unit: "북구" });
    expect(map("경상남도", "창원시 성산구")).toEqual({
      province: "경상남도",
      unit: "창원시 성산구",
    });
  });

  it("일반구는 시로, 시·도 전체 관할은 전체 칸으로", () => {
    expect(map("경기도", "수원시 장안구")).toEqual({ province: "경기도", unit: "수원시" });
    expect(map("세종특별자치시", "")).toEqual({ province: "세종특별자치시", unit: "전체" });
    expect(map("인천광역시", "남동구")).toEqual({ province: "인천광역시", unit: "전체" });
  });

  it("통합 시·도는 별표의 옛 시·도 칸으로", () => {
    expect(map("전남광주통합특별시", "북구")).toEqual({ province: "광주광역시", unit: "전체" });
    expect(map("전남광주통합특별시", "순천시")).toEqual({ province: "전라남도", unit: "순천시" });
  });

  it("없는 칸은 null", () => {
    expect(map("없는도", "없는시")).toBeNull();
  });
});
