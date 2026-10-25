import { describe, expect, it } from "vitest";

import { loadCivilFilings, loadCriminalFilings, searchFilings } from "../src/filings";

/** 대조값은 재민 91-1 별표(재판예규 제1916호)·재형 2003-11 별표 1~7(제1968-17호) 원문 행. */
const civil = loadCivilFilings();
const criminal = loadCriminalFilings();

describe("민사서류 안내 데이터셋", () => {
  it("별표 362행과 예규 시행일을 담는다", () => {
    expect(civil.documents).toHaveLength(362);
    expect(civil.regulation.effectiveFrom).toBe("2025-07-12");
    expect(civil.regulation.number).toBe("재판예규 제1916호");
  });

  it("인지액 칸을 종류로 나누고 원문을 남긴다", () => {
    const first = civil.documents[0]!;
    expect(first.name).toBe("관할법원지정신청서");
    expect(first.stamp).toEqual({ kind: "fixed", won: 1000, text: "1,000원" });
    expect(civil.documents[1]!.stamp).toEqual({ kind: "none", text: "－" });
    const intervention = civil.documents.find((d) => d.name === "독립당사자 참가신청서")!;
    expect(intervention.stamp.kind).toBe("statute");
    expect(intervention.stamp.kind === "statute" && intervention.stamp.refs).toEqual([
      "제2조",
      "제6조",
    ]);
    const kinds = new Set(civil.documents.map((d) => d.stamp.kind));
    expect([...kinds].sort()).toEqual(["fixed", "none", "other", "statute"]);
  });

  it("조건·선택·단서·차감이 붙은 조문 금액은 statute 가 아니라 other", () => {
    for (const id of ["c021", "c089", "c116", "c135"]) {
      expect(civil.documents.find((d) => d.id === id)!.stamp.kind).toBe("other");
    }
    for (const d of civil.documents) {
      if (d.stamp.kind === "statute") expect(d.stamp.text).toMatch(/소정액$/);
    }
    expect(civil.version).toBe("1.0.1");
  });

  it("조건이 붙은 금액은 fixed 로 뭉개지 않는다", () => {
    const conditional = civil.documents.filter((d) => d.stamp.text.includes("[단,"));
    expect(conditional.length).toBeGreaterThan(0);
    for (const d of conditional) expect(d.stamp.kind).toBe("other");
  });

  it("편철방법의 글자 사이 공백을 지워 분류한다", () => {
    expect(civil.documents[1]!.filingMethod).toBe("가철");
    expect(civil.documents[1]!.filingKind).toBe("가철");
  });

  it("전자소송 10분의 9 안내의 근거를 싣는다", () => {
    expect(civil.electronicFiling.sourceArticle).toContain("제16조");
    expect(civil.electronicFiling.text).toContain("10분의 9");
  });
});

describe("형사서류 안내 데이터셋", () => {
  it("별표 7개 148행을 담는다", () => {
    expect(criminal.documents).toHaveLength(148);
    expect(criminal.tables.map((t) => t.no)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("윗칸과 같음 표시를 윗행 값으로 채우고 표시를 남긴다", () => {
    const d = criminal.documents.find((x) => x.name === "뒤에 공소를 받은 법원의 심판신청서")!;
    expect(d.entryMethod).toBe("신청사건입력");
    expect(d.filingMethod).toBe("별책");
    expect(d.copiedFromAbove).toEqual(["entryMethod", "filingMethod"]);
    const all = criminal.documents.flatMap((x) => [x.article, x.entryMethod, x.filingMethod]);
    expect(all.some((v) => v === "″" || v === "“")).toBe(false);
  });
});

describe("searchFilings", () => {
  it("이름 부분 일치, 공백 무시", () => {
    const hits = searchFilings(civil.documents, "가압류");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((d) => d.name.replace(/\s/g, "").includes("가압류"))).toBe(true);
    expect(searchFilings(civil.documents, "소송 이송")).toEqual(
      searchFilings(civil.documents, "소송이송"),
    );
  });

  it("조문 칸으로도 찾는다", () => {
    const hits = searchFilings(criminal.documents, "형소법 94");
    expect(hits.map((d) => d.name)).toContain("보석청구서");
  });

  it("가운뎃점 변형(· ․ ㆍ)을 무시한다", () => {
    const names = (q: string) => searchFilings(civil.documents, q).map((d) => d.id);
    const plain = names("열람복사");
    expect(plain).toHaveLength(4);
    for (const q of ["열람·복사", "열람․복사", "열람ㆍ복사", "열람・복사", "열람•복사"]) {
      expect(names(q)).toEqual(plain);
    }
    expect(searchFilings(criminal.documents, "열람·복사")).toEqual(
      searchFilings(criminal.documents, "열람복사"),
    );
  });

  it("빈 검색어는 전체", () => {
    expect(searchFilings(criminal.documents, "  ")).toHaveLength(148);
  });
});
