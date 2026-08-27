import { describe, expect, it } from "vitest";
import {
  findOccupationMerge,
  getLaborRateAt,
  laborRatesDatasetVersionTag,
  latestSliceEffectiveFrom,
  listOccupationsAt,
  loadLaborRatesTable,
} from "../src/labor-rates";
import type { LaborRatesDataset, LaborRatesSlice } from "../src/labor-rates";

const BASE_SLICE: LaborRatesSlice = {
  effectiveFrom: "2026-01-01",
  year: 2026,
  half: 1,
  announcementDate: "2025-12-31",
  announcementUrl: "https://www.cak.or.kr/lay1/bbs/S1T41C42/A/14/list.do",
  title: "2026년 상반기 적용 건설업 임금실태조사 보고서",
  rates: { 보통인부: 172068, 특별인부: 226122 },
};

const BASE_DATASET: LaborRatesDataset = {
  version: "1.0.0",
  updatedAt: "2026-05-17",
  source: "대한건설협회 시중노임",
  sourceUrl: "https://www.cak.or.kr/",
  license: "테스트용 라이선스 표기",
  snapshotDate: "2025-12-31",
  slices: [BASE_SLICE],
};

describe("labor-rates dataset (loader + version tag)", () => {
  it("loads the default dataset with version 1.1.0 and 1991~2026 반기 슬라이스", () => {
    const ds = loadLaborRatesTable();
    expect(ds.version).toBe("1.1.0");
    // 종전에는 2026년 상반기 한 장뿐이었다.
    expect(ds.slices).toHaveLength(70);
    expect(ds.slices[0]!.effectiveFrom).toBe("1991-01-01");
    expect(ds.sourceUrl).toContain("cak.or.kr");
  });

  it("emits labor-rates/v1.1.0 version tag", () => {
    expect(laborRatesDatasetVersionTag(loadLaborRatesTable())).toBe("labor-rates/v1.1.0");
  });

  it("default dataset bundles the 2026-01-01 대한건설협회 slice with the canonical 보통인부 단가", () => {
    const ds = loadLaborRatesTable();
    const earliest = ds.slices[ds.slices.length - 1]!;
    expect(earliest.effectiveFrom).toBe("2026-01-01");
    expect(earliest.rates["보통인부"]).toBe(172068);
    expect(earliest.rates["특별인부"]).toBe(226122);
  });
});

describe("labor-rates dataset (validator)", () => {
  it("rejects an empty slices array", () => {
    const broken: LaborRatesDataset = { ...BASE_DATASET, slices: [] };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("rejects non-ISO effectiveFrom", () => {
    const broken: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [{ ...BASE_SLICE, effectiveFrom: "20260101" }],
    };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("rejects non-ascending duplicate effectiveFrom", () => {
    const broken: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [BASE_SLICE, { ...BASE_SLICE, effectiveFrom: "2026-01-01" }],
    };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("rejects rates with non-positive or non-finite values", () => {
    const negative: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [{ ...BASE_SLICE, rates: { 보통인부: -1 } }],
    };
    expect(() => loadLaborRatesTable(negative)).toThrow(RangeError);
    const infinite: LaborRatesDataset = {
      ...BASE_DATASET,
      slices: [{ ...BASE_SLICE, rates: { 보통인부: Number.POSITIVE_INFINITY } }],
    };
    expect(() => loadLaborRatesTable(infinite)).toThrow(RangeError);
  });
});

describe("labor-rates dataset (getLaborRateAt + latestSliceEffectiveFrom)", () => {
  const multiSlice: LaborRatesDataset = {
    ...BASE_DATASET,
    slices: [
      {
        ...BASE_SLICE,
        effectiveFrom: "2025-01-01",
        announcementDate: "2024-12-31",
        title: "2025년 상반기",
        rates: { 보통인부: 169804 },
      },
      {
        ...BASE_SLICE,
        effectiveFrom: "2025-09-01",
        announcementDate: "2025-09-01",
        title: "2025년 하반기",
        rates: { 보통인부: 171037 },
      },
      {
        ...BASE_SLICE,
        effectiveFrom: "2026-01-01",
        announcementDate: "2025-12-31",
        title: "2026년 상반기",
        rates: { 보통인부: 172068, 보링공: 232562 },
      },
    ],
  };

  it("returns undefined for a date earlier than every slice", () => {
    expect(getLaborRateAt(multiSlice, "보통인부", "2024-01-01")).toBeUndefined();
  });

  it("picks the latest slice whose effectiveFrom <= date", () => {
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-01-01")).toBe(169804);
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-08-31")).toBe(169804);
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-09-01")).toBe(171037);
    expect(getLaborRateAt(multiSlice, "보통인부", "2025-12-31")).toBe(171037);
    expect(getLaborRateAt(multiSlice, "보통인부", "2026-01-01")).toBe(172068);
    expect(getLaborRateAt(multiSlice, "보통인부", "2099-12-31")).toBe(172068);
  });

  it("returns undefined for an unknown occupation even when a slice is selected", () => {
    expect(getLaborRateAt(multiSlice, "공무원", "2026-01-01")).toBeUndefined();
  });

  it("rejects non-ISO date input", () => {
    expect(() => getLaborRateAt(multiSlice, "보통인부", "2026/01/01")).toThrow(RangeError);
  });

  it("reports the latest slice effectiveFrom", () => {
    expect(latestSliceEffectiveFrom(multiSlice)).toBe("2026-01-01");
  });
});

describe("labor-rates 반기 슬라이스 (2026-08-27 확장)", () => {
  it("적용일은 상반기 1월 1일 · 하반기 9월 1일이고 year/half 와 어긋나면 거부한다", () => {
    const ds = loadLaborRatesTable();
    for (const slice of ds.slices) {
      const expected = slice.half === 1 ? `${slice.year}-01-01` : `${slice.year}-09-01`;
      expect(slice.effectiveFrom, `${slice.year}-${slice.half}`).toBe(expected);
    }
    // 7월 1일로 잘못 잡으면 로드가 막힌다. 하반기 적용일을 헷갈리기 쉬운 지점이다.
    const broken = {
      ...ds,
      slices: ds.slices.map((s) =>
        s.half === 2 && s.year === 2000 ? { ...s, effectiveFrom: "2000-07-01" } : s,
      ),
    };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("사고일 기준으로 그 시점 슬라이스를 고른다", () => {
    const ds = loadLaborRatesTable();
    const at = (date: string) => getLaborRateAt(ds, "보통인부", date);
    // 1991-01-01 이전은 슬라이스가 없다.
    expect(at("1990-12-31")).toBeUndefined();
    const y2000FirstHalf = at("2000-06-30");
    const y2000SecondHalf = at("2000-09-01");
    expect(y2000FirstHalf).toBeTypeOf("number");
    expect(y2000SecondHalf).toBeTypeOf("number");
    // 8월 31일까지는 상반기 단가다 (7월이 아니라 9월에 바뀐다).
    expect(at("2000-08-31")).toBe(y2000FirstHalf);
    // 노임은 장기적으로 오른다. 2000년과 2020년이 같으면 슬라이스 선택이 죽은 것이다.
    expect(at("2020-01-01")!).toBeGreaterThan(y2000FirstHalf!);
  });

  it("2025년 하반기 적용분이 실려 있고 9월 1일부터 그 단가가 잡힌다", () => {
    const ds = loadLaborRatesTable();
    const h2 = ds.slices.find((s) => s.effectiveFrom === "2025-09-01");
    expect(h2?.year).toBe(2025);
    expect(h2?.half).toBe(2);
    expect(h2?.rates["보통인부"]).toBe(171037);
    // 8월 31일까지는 상반기 단가다. 이 회차가 비면 9~12월 사고가 조용히 상반기로 계산된다.
    expect(getLaborRateAt(ds, "보통인부", "2025-08-31")).toBe(169804);
    expect(getLaborRateAt(ds, "보통인부", "2025-09-01")).toBe(171037);
    expect(getLaborRateAt(ds, "보통인부", "2025-12-31")).toBe(171037);
    expect(getLaborRateAt(ds, "보통인부", "2026-01-01")).toBe(172068);
  });

  it("통합으로 사라진 직종은 통합 시점 이후 슬라이스에서 조회되지 않는다", () => {
    const ds = loadLaborRatesTable();
    // 갱부는 2010.1.1 공표분부터 특별인부로 통합됐다.
    expect(getLaborRateAt(ds, "갱부", "2009-09-01")).toBeTypeOf("number");
    expect(getLaborRateAt(ds, "갱부", "2010-01-01")).toBeUndefined();
    expect(getLaborRateAt(ds, "갱부", "2020-01-01")).toBeUndefined();
    expect(getLaborRateAt(ds, "특별인부", "2010-01-01")).toBeTypeOf("number");
  });

  it("findOccupationMerge 가 흡수처를 알려 준다 (하나가 여럿으로 갈리는 경우 포함)", () => {
    const ds = loadLaborRatesTable();
    expect(findOccupationMerge(ds, "갱부")).toEqual({
      mergedInto: ["특별인부"],
      effectiveFrom: "2010-01-01",
    });
    // 절단공은 넷으로 갈렸다. 하나만 돌려주면 임의로 고른 직종의 임금을 쓰게 된다.
    const cut = findOccupationMerge(ds, "절단공");
    expect(cut!.mergedInto.sort()).toEqual(["철골공", "철공", "철근공", "철판공"].sort());
    expect(findOccupationMerge(ds, "보통인부")).toBeUndefined();
  });

  it("통합 시점 이후 슬라이스에 사라진 직종이 남아 있으면 로드를 거부한다", () => {
    const ds = loadLaborRatesTable();
    const broken = {
      ...ds,
      slices: ds.slices.map((s) =>
        s.effectiveFrom === "2015-01-01" ? { ...s, rates: { ...s.rates, 갱부: 108245 } } : s,
      ),
    };
    expect(() => loadLaborRatesTable(broken)).toThrow(RangeError);
  });

  it("listOccupationsAt 는 그 시점에 조회 가능한 직종만 준다", () => {
    const ds = loadLaborRatesTable();
    const before = listOccupationsAt(ds, "2009-09-01");
    const after = listOccupationsAt(ds, "2010-01-01");
    expect(before).toContain("갱부");
    expect(after).not.toContain("갱부");
    expect(after).toContain("특별인부");
    expect(listOccupationsAt(ds, "1990-12-31")).toEqual([]);
  });

  it("조사 직종수 조정 이력과 통합 내역이 함께 실려 있다", () => {
    const ds = loadLaborRatesTable();
    expect(ds.surveyHistory?.map((h) => h.at)).toEqual([
      "1998-05",
      "1998-10",
      "2009-07",
      "2017-07",
      "2020-05",
      "2024-09",
    ]);
    expect(ds.occupationMerges?.entries).toHaveLength(36);
    expect(ds.occupationMerges?.effectiveFrom).toBe("2010-01-01");
  });
});
