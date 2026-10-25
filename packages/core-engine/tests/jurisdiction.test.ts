import { describe, expect, it } from "vitest";

import {
  findCourtJurisdiction,
  listJurisdictionProvinces,
  listJurisdictionUnits,
  loadCourtJurisdiction,
  snapshotAt,
} from "../src/jurisdiction";

/**
 * 대조값은 「각급 법원의 설치와 관할구역에 관한 법률」 시행일자별 별표 3·7·10 원문 행
 * (법제처 eflaw, 2026-03-17 / 2028-03-01 / 2031-03-01 / 2032-03-01 시행 판).
 */
const NOW = "2026-10-25";
const find = (province: string, unit: string, date = NOW) =>
  findCourtJurisdiction({ province, unit, date });

describe("관할법원 찾기 - 현행(2026-03-17 시행 판)", () => {
  it("동명 구는 시·도로 갈린다", () => {
    expect(find("서울특별시", "강서구").districtCourt).toBe("서울남부지방법원");
    const busan = find("부산광역시", "강서구");
    expect(busan.districtCourt).toBe("부산지방법원");
    expect(busan.branch).toBe("부산지방법원 서부지원");
    expect(busan.highCourt).toBe("부산고등법원");
  });

  it("지원·시·군법원·회생법원", () => {
    const r = find("서울특별시", "강남구");
    expect(r).toMatchObject({
      highCourt: "서울고등법원",
      districtCourt: "서울중앙지방법원",
      branch: null,
      municipalCourt: null,
      rehabilitationCourt: "서울회생법원",
      byeolpyo: ["별표 3", "별표 10"],
    });
    expect(find("경기도", "남양주시").branch).toBe("의정부지방법원 남양주지원");
    expect(find("경상북도", "울릉군").branch).toBe("대구지방법원 포항지원");
    expect(find("전라남도", "순천시").branch).toBe("광주지방법원 순천지원");
    expect(find("경기도", "하남시")).toMatchObject({
      branch: "수원지방법원 성남지원",
      municipalCourt: "수원지방법원 광주시법원",
      highCourt: "수원고등법원",
    });
    expect(find("경기도", "화성시").municipalCourt).toBe("수원지방법원 오산시법원");
  });

  it("같은 이름의 군은 시·도로 갈린다 (고성군)", () => {
    expect(find("강원특별자치도", "고성군").branch).toBe("춘천지방법원 속초지원");
    expect(find("경상남도", "고성군").branch).toBe("창원지방법원 통영지원");
  });

  it("인천은 직전 판 행으로 보정되어 있고 그 사유를 낸다", () => {
    const r = find("인천광역시", "전체");
    expect(r.highCourt).toBe("서울고등법원");
    expect(r.districtCourt).toBe("인천지방법원");
    expect(r.correction).toContain("2028-03-01");
    expect(find("인천광역시", "강화군").municipalCourt).toBe("인천지방법원 강화군법원");
    expect(find("경기도", "부천시").branch).toBe("인천지방법원 부천지원");
  });

  it("소년보호사건 단서는 note 로 따로 낸다", () => {
    expect(find("경기도", "의정부시").note).toMatch(/^다만, 소년보호사건은/);
    expect(find("경기도", "고양시").note).toBeNull();
  });

  it("군위군은 대구광역시 아래, 별표 표기를 남긴다", () => {
    const r = find("대구광역시", "군위군");
    expect(r.branch).toBe("대구지방법원 의성지원");
    expect(r.statuteName).toBe("경상북도 군위군");
    expect(listJurisdictionUnits(NOW, "경상북도")).not.toContain("군위군");
  });

  it("세종은 대전지방법원 본원과 세종특별자치시법원", () => {
    expect(find("세종특별자치시", "전체")).toMatchObject({
      districtCourt: "대전지방법원",
      municipalCourt: "대전지방법원 세종특별자치시법원",
    });
  });
});

describe("시행 예정 판 (effectiveFrom)", () => {
  it("판 선택은 기준일로 한다", () => {
    expect(snapshotAt("2026-10-25").effectiveFrom).toBe("2026-03-17");
    expect(snapshotAt("2028-02-29").effectiveFrom).toBe("2026-03-17");
    expect(snapshotAt("2028-03-01").effectiveFrom).toBe("2028-03-01");
    expect(snapshotAt("2040-01-01").effectiveFrom).toBe("2032-03-01");
    expect(() => snapshotAt("2026-03-16")).toThrow(RangeError);
    expect(() => snapshotAt("")).toThrow("기준일을 입력하세요.");
    expect(() => snapshotAt("2026-13-40")).toThrow(/올바른 날짜/);
    expect(() => listJurisdictionProvinces("")).toThrow(RangeError);
  });

  it("2028-03-01 인천고등법원·북부지원", () => {
    const r = find("인천광역시", "강화군", "2028-03-01");
    expect(r.highCourt).toBe("인천고등법원");
    expect(r.branch).toBe("인천지방법원 북부지원");
    expect(find("경기도", "부천시", "2028-03-01").highCourt).toBe("인천고등법원");
  });

  it("2031-03-01 세종지방법원, 2032-03-01 김해지원·화성시법원", () => {
    expect(find("세종특별자치시", "전체", "2031-03-01").districtCourt).toBe("세종지방법원");
    expect(find("경상남도", "김해시", "2032-03-01").branch).toBe("창원지방법원 김해지원");
    expect(find("경기도", "화성시", "2032-03-01").municipalCourt).toBe("수원지방법원 화성시법원");
  });

  it("현행 결과에 앞으로 바뀌는 판을 붙인다", () => {
    const gimhae = find("경상남도", "김해시");
    expect(gimhae.upcoming).toEqual([
      {
        effectiveFrom: "2032-03-01",
        lawNumber: expect.any(String) as string,
        courts: expect.objectContaining({ branch: "창원지방법원 김해지원" }) as object,
      },
    ]);
    expect(find("인천광역시", "전체").upcoming).toEqual([
      { effectiveFrom: "2028-03-01", lawNumber: expect.any(String) as string, courts: null },
    ]);
    expect(find("서울특별시", "강남구").upcoming).toEqual([]);
  });
});

describe("목록", () => {
  it("시·도 17개, 시·도 전체 칸이 맨 앞", () => {
    expect(listJurisdictionProvinces(NOW)).toHaveLength(17);
    expect(listJurisdictionUnits(NOW, "인천광역시")[0]).toBe("전체");
  });

  it("모든 칸이 별표 3 행을 가리키고 판마다 시·군·구가 겹치지 않는다", () => {
    for (const s of loadCourtJurisdiction().snapshots) {
      const keys = s.units.map((u) => `${u.province}|${u.name}`);
      expect(new Set(keys).size).toBe(keys.length);
      for (const u of s.units) expect(s.rows[u.row]).toBeDefined();
    }
  });

  it("없는 칸은 RangeError", () => {
    expect(() => find("서울특별시", "해운대구")).toThrow(RangeError);
  });
});
