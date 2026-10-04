import { describe, expect, it } from "vitest";

import {
  computeDeadline,
  getDeadline,
  listDeadlines,
  loadDeadlines,
  validateDeadlineInput,
} from "../src/deadline";
import type { DeadlineDataset } from "../src/deadline";
import { createHolidayDeps } from "../src/period";

/**
 * 법정기한 엔진. 기간 산술 자체는 `period.test.ts` 가 본다. 여기서는 데이터셋의
 * 값이 기간 엔진으로 제대로 옮겨지는지와, 항목마다 다른 근거가 결과에 그대로
 * 실리는지를 고정한다.
 */
const deps = createHolidayDeps();

describe("computeDeadline - 계열별 대표 항목", () => {
  it("민사 항소는 판결서 송달일 다음날부터 2주다", () => {
    const result = computeDeadline({ id: "civilAppeal", startEventDate: "2026-02-27" }, deps);
    expect(result.period.startDate).toBe("2026-02-28");
    expect(result.expiryDate).toBe("2026-03-13");
    expect(result.lengthTextKo).toBe("2주");
    expect(result.startEventKo).toBe("판결서를 송달받은 날");
    expect(result.sourceArticle).toBe("제396조 제1항");
    expect(result.lawNameKo).toBe("민사소송법");
  });

  it("형사 항소는 선고·고지일 다음날부터 7일이다", () => {
    const result = computeDeadline({ id: "criminalAppeal", startEventDate: "2026-02-27" }, deps);
    expect(result.period.startDate).toBe("2026-02-28");
    expect(result.expiryDate).toBe("2026-03-06");
    expect(result.lengthTextKo).toBe("7일");
    expect(result.startEventKo).toBe("재판을 선고 또는 고지한 날");
  });

  it("행정 취소소송은 처분을 안 날 다음날부터 90일이다", () => {
    const result = computeDeadline({ id: "revocationSuit", startEventDate: "2026-02-27" }, deps);
    expect(result.expiryDate).toBe("2026-05-28");
    expect(result.lengthTextKo).toBe("90일");
    expect(result.holidayRollover.status).toBe("notApplied");
  });

  it("가사 항소는 민사와 달리 조문 표기가 14일이다", () => {
    const result = computeDeadline({ id: "familyAppeal", startEventDate: "2026-02-27" }, deps);
    expect(result.lengthTextKo).toBe("14일");
    // 표기는 다르지만 만료일은 민사 항소 2주와 같은 날이 된다.
    expect(result.expiryDate).toBe("2026-03-13");
  });
});

describe("computeDeadline - 말일 조정", () => {
  it("민사는 말일이 공휴일이면 민법 제161조로 밀린다", () => {
    const result = computeDeadline({ id: "civilAppeal", startEventDate: "2026-02-16" }, deps);
    expect(result.period.rawExpiry).toBe("2026-03-02");
    expect(result.expiryDate).toBe("2026-03-03");
    expect(result.holidayRollover.status).toBe("applied");
    expect(result.holidayRollover.basisKo).toContain("민법 제161조");
  });

  it("형사도 밀리지만 근거는 형사소송법 제66조 제3항이다", () => {
    const result = computeDeadline({ id: "criminalAppeal", startEventDate: "2026-09-17" }, deps);
    expect(result.period.rawExpiry).toBe("2026-09-24");
    expect(result.expiryDate).toBe("2026-09-28");
    expect(result.holidayRollover.status).toBe("applied");
    expect(result.holidayRollover.basisKo).toBe("형사소송법 제66조 제3항");
    expect(result.holidayRollover.reasonKo).not.toContain("민법");
  });

  it("커버리지 밖 만료일은 조정 여부를 단정하지 않는다", () => {
    const result = computeDeadline(
      { id: "civilRetrialSuitOuterLimit", startEventDate: "2026-02-27" },
      deps,
    );
    expect(result.expiryDate).toBe(result.period.rawExpiry);
    expect(result.holidayRollover.status).toBe("outOfCoverage");
    expect(result.holidayRollover.reasonKo).toContain("직접 확인");
  });
});

describe("computeDeadline - 근거가 항목을 따라간다", () => {
  it("민사와 형사의 말일 규칙 근거가 다르다", () => {
    const civil = computeDeadline({ id: "civilAppeal", startEventDate: "2026-02-27" }, deps);
    const criminal = computeDeadline({ id: "criminalAppeal", startEventDate: "2026-02-27" }, deps);
    expect(civil.periodRuleKo.endOfPeriod).toContain("민법 제159조");
    expect(criminal.periodRuleKo.endOfPeriod).toContain("형사소송법 제66조 제2항");
    expect(civil.periodRuleKo.firstDay).toContain("민법 제157조");
    expect(criminal.periodRuleKo.firstDay).toContain("형사소송법 제66조 제1항");
    expect(civil.periodRuleKo.endOfPeriod).not.toBe(criminal.periodRuleKo.endOfPeriod);
  });

  it("형사 계열 판정과 데이터셋의 말일 근거가 어긋나지 않는다", () => {
    // 계열 판정은 sourceLaws 의 family 로 한다. holidayRolloverBasis 와 어긋나지 않는지 본다.
    const ds = loadDeadlines();
    for (const item of listDeadlines()) {
      expect(item.holidayRolloverBasis.startsWith("형사소송법")).toBe(
        ds.sourceLaws[item.lawKey]?.family === "criminal",
      );
    }
  });

  it("조문 원문과 함정 메모를 그대로 싣는다", () => {
    const result = computeDeadline(
      { id: "civilImmediateAppeal", startEventDate: "2026-02-27" },
      deps,
    );
    expect(result.sourceQuote).toContain("재판이 고지된 날부터 1주");
    expect(result.noteKo).toContain("송달일이 아니라 고지일");
    expect(result.dataVersion).toMatch(/^deadlines\/v\d+\.\d+\.\d+$/);
  });
});

describe("computeDeadline - 불변기간 3값", () => {
  it("불변기간으로 정한 항목은 근거 항까지 낸다", () => {
    const result = computeDeadline({ id: "civilAppeal", startEventDate: "2026-02-27" }, deps);
    expect(result.immutable).toBe("yes");
    expect(result.immutableLabelKo).toBe("불변기간");
    expect(result.immutableSourceArticle).toBe("제396조 제2항");
  });

  it("형사 계열은 불변기간 제도가 없어 no 다", () => {
    const result = computeDeadline({ id: "criminalAppeal", startEventDate: "2026-02-27" }, deps);
    expect(result.immutable).toBe("no");
    expect(result.immutableLabelKo).toBe("불변기간 아님");
    expect(result.noteKo).toContain("불변기간 제도가 없다");
  });

  it("가사 계열은 unstated 를 no 로 뭉개지 않는다", () => {
    for (const id of ["familyAppeal", "familyFinalAppeal", "familyImmediateAppeal"]) {
      const result = computeDeadline({ id, startEventDate: "2026-02-27" }, deps);
      expect(result.immutable).toBe("unstated");
      expect(result.immutableLabelKo).toBe("법령에 표시 없음");
      expect(result.immutableLabelKo).not.toBe("불변기간 아님");
    }
  });
});

describe("computeDeadline - 조건별 대체 기간", () => {
  it("국외 체류 등 조건을 켜면 그 기간으로 계산한다", () => {
    const base = computeDeadline({ id: "lateActSupplement", startEventDate: "2026-02-27" }, deps);
    const alternate = computeDeadline(
      { id: "lateActSupplement", startEventDate: "2026-02-27", useAlternate: true },
      deps,
    );
    expect(base.expiryDate).toBe("2026-03-13");
    expect(base.appliedAlternateKo).toBeUndefined();
    expect(alternate.expiryDate).toBe("2026-03-30");
    expect(alternate.lengthTextKo).toBe("30일");
    expect(alternate.appliedAlternateKo).toContain("외국에 있던 당사자");
  });

  it("대체 기간이 없는 항목에 켜면 거부한다", () => {
    expect(() =>
      computeDeadline(
        { id: "civilAppeal", startEventDate: "2026-02-27", useAlternate: true },
        deps,
      ),
    ).toThrow(/대체 기간이 없습니다/);
  });
});

describe("데이터셋 조회와 입력 검증", () => {
  it("데이터셋에 없는 id 는 거부한다", () => {
    expect(() =>
      computeDeadline({ id: "patentAppeal", startEventDate: "2026-02-27" }, deps),
    ).toThrow(/본 dataset 에 없습니다/);
    expect(() => getDeadline("patentAppeal")).toThrow(RangeError);
  });

  it("날짜 형식이 잘못되면 거부한다", () => {
    expect(() =>
      validateDeadlineInput({ id: "civilAppeal", startEventDate: "2026-02-30" }),
    ).toThrow(RangeError);
  });

  it("입력 검증은 공휴일 deps 를 보지 않는다", () => {
    // `.lcalc` 파서 자리에는 deps 가 없다. 입력만으로 통과해야 한다.
    expect(() =>
      validateDeadlineInput({ id: "criminalAppeal", startEventDate: "2026-02-27" }),
    ).not.toThrow();
  });

  it("목록은 담긴 항목을 그대로 낸다", () => {
    const items = listDeadlines();
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.every((i) => i.holidayRollover)).toBe(true);
  });
});

/**
 * 데이터셋 가드. 여기 없는 가드는 지워도 아무 테스트가 깨지지 않고, 그러면 잘못된 값이
 * 화면까지 그대로 나간다.
 */
describe("데이터셋 검증", () => {
  const base = loadDeadlines();
  const withItem = (patch: Record<string, unknown>): DeadlineDataset => ({
    ...base,
    deadlines: [{ ...getDeadline("civilAppeal"), ...patch }],
  });

  it("dataset 에 없는 lawKey 는 대체값 없이 거부한다", () => {
    expect(() => loadDeadlines(withItem({ lawKey: "patentAct" }))).toThrow(/알 수 없는 lawKey/);
  });

  it("법령명이 비면 거부한다", () => {
    const dataset = {
      ...base,
      sourceLaws: {
        ...base.sourceLaws,
        civilProcedure: { ...base.sourceLaws.civilProcedure, name: "" },
      },
    } as DeadlineDataset;
    expect(() => loadDeadlines(dataset)).toThrow(/name 이 비었습니다/);
  });

  it("계열을 밝히지 않은 법령은 거부한다", () => {
    const dataset = {
      ...base,
      sourceLaws: {
        ...base.sourceLaws,
        civilProcedure: { ...base.sourceLaws.civilProcedure, family: undefined },
      },
    } as unknown as DeadlineDataset;
    expect(() => loadDeadlines(dataset)).toThrow(/civil \/ criminal 중 하나로 밝혀야 합니다/);
  });

  it("firstDayIncluded / holidayRollover 가 boolean 이 아니면 거부한다", () => {
    // JSON 이 문자열 "false" 를 담으면 truthy 로 읽혀 하루 틀린 값이 나온다.
    expect(() => loadDeadlines(withItem({ firstDayIncluded: "false" }))).toThrow(
      /boolean 이어야 합니다/,
    );
    expect(() => loadDeadlines(withItem({ holidayRollover: "false" }))).toThrow(
      /boolean 이어야 합니다/,
    );
  });

  it("중복 id 는 거부한다", () => {
    const item = getDeadline("civilAppeal");
    const dataset = { ...base, deadlines: [item, item] };
    expect(() => loadDeadlines(dataset)).toThrow(/duplicate id/);
  });
});

/**
 * 계열 판정은 `lawKey` 이름이 아니라 데이터셋의 `family` 를 본다. 이름으로 추정하면
 * `coverageNote` 가 다음 판으로 미뤄 둔 법령이 조용히 민사 조문 라벨을 달고 나온다.
 */
describe("계열은 데이터셋이 밝힌다", () => {
  const base = loadDeadlines();

  const withNewLaw = (family: "civil" | "criminal"): DeadlineDataset =>
    ({
      ...base,
      sourceLaws: {
        ...base.sourceLaws,
        newProcedure: { ...base.sourceLaws.criminalProcedure, name: "새 절차법", family },
      },
      deadlines: [{ ...getDeadline("criminalAppeal"), id: "newLawProbe", lawKey: "newProcedure" }],
    }) as DeadlineDataset;

  it("lawKey 이름이 criminalProcedure 가 아니어도 family 가 criminal 이면 형사 규칙을 쓴다", () => {
    const result = computeDeadline(
      { id: "newLawProbe", startEventDate: "2026-09-17" },
      deps,
      withNewLaw("criminal"),
    );
    expect(result.lawNameKo).toBe("새 절차법");
    expect(result.period.articles).toEqual(["형사소송법 제66조 제1항", "형사소송법 제66조 제3항"]);
    expect(JSON.stringify(result.period)).not.toMatch(/민법|제15[5-9]조|제16[01]조/);
  });

  it("같은 lawKey 라도 family 가 civil 이면 민법 규칙을 쓴다", () => {
    const result = computeDeadline(
      { id: "newLawProbe", startEventDate: "2026-09-17" },
      deps,
      withNewLaw("civil"),
    );
    expect(result.period.articles).toEqual(["제157조", "제159조", "제161조"]);
    expect(result.periodRuleKo.firstDay).toContain("민법 제157조");
  });
});

describe("formulaText 는 계열을 가리지 않는다", () => {
  it("형사 항목의 산출 근거에 민법 조문이 실리지 않는다", () => {
    const result = computeDeadline({ id: "criminalAppeal", startEventDate: "2026-09-05" }, deps);
    expect(result.formulaText).not.toMatch(/민법|제15[5-9]조|제16[01]조/);
    expect(result.formulaText).toContain(result.expiryDate);
  });

  it("민사 항목도 같은 형식이다", () => {
    const result = computeDeadline({ id: "civilAppeal", startEventDate: "2026-09-05" }, deps);
    expect(result.formulaText).not.toMatch(/제15[5-9]조|제16[01]조/);
    expect(result.formulaText).toContain("기산일");
  });
});

/**
 * 민법 기간 규정은 민법 제155조에 따라 다른 정함이 없을 때만 적용된다. 형사 기간은
 * 형사소송법 제66조가 직접 정하므로 그 "다른 정함"에 해당하고, 결과 어디에도 민법 조문이
 * 실려서는 안 된다. 반대로 민사 항목에서는 민법 조문이 사라지면 안 된다.
 */
describe("computeDeadline - 계열에 맞는 조문만 싣는다", () => {
  const CIVIL_ARTICLE = /민법|제15[5-9]조|제16[01]조/;

  it("형사 항목 결과 객체 어디에도 민법 조문이 없다", () => {
    const criminal = listDeadlines().filter((item) => item.lawKey === "criminalProcedure");
    expect(criminal.length).toBeGreaterThan(0);
    for (const item of criminal) {
      // 말일 조정이 걸리는 날과 걸리지 않는 날을 모두 지난다.
      for (const startEventDate of ["2026-02-27", "2026-09-05", "2026-09-17"]) {
        const result = computeDeadline({ id: item.id, startEventDate }, deps);
        expect(JSON.stringify(result)).not.toMatch(CIVIL_ARTICLE);
      }
    }
  });

  it("형사 항목은 형사소송법 제66조를 근거 조문으로 낸다", () => {
    const result = computeDeadline({ id: "criminalAppeal", startEventDate: "2026-09-17" }, deps);
    expect(result.period.articles).toEqual(["형사소송법 제66조 제1항", "형사소송법 제66조 제3항"]);
    expect(result.period.noteKo).toContain("형사소송법 제66조");
    expect(result.period.adjustmentReasonKo).toContain("형사소송법 제66조 제3항 적용");
    // 말일 종료를 정한 대응 조문이 형사소송법에 없어 그 자리는 조문 없이 사유만 적는다.
    expect(result.period.formulaText).toContain("(말일의 종료로 만료)");
  });

  it("민사 항목에는 민법 조문이 그대로 실린다", () => {
    const result = computeDeadline({ id: "civilAppeal", startEventDate: "2026-02-16" }, deps);
    expect(result.period.articles).toEqual(["제157조", "제160조 제2항", "제159조", "제161조"]);
    expect(result.period.noteKo).toContain("민법 제155조");
    expect(result.period.adjustmentReasonKo).toContain("제161조 적용");
    expect(JSON.stringify(result)).toMatch(CIVIL_ARTICLE);
  });
});

describe("computeDeadline - 항목의 holidayRollover 플래그", () => {
  /**
   * 현재 데이터셋 35항목이 전부 `holidayRollover: true` 라 이 분기가 상수와 등가다.
   * 플래그를 무시해도 아무 결과가 달라지지 않으므로, `false` 항목을 만들어 주입해 고정한다.
   */
  it("항목이 말일 조정을 쓰지 않으면 deps 가 있어도 조정하지 않는다", () => {
    const base = loadDeadlines();
    const dataset = {
      ...base,
      deadlines: [{ ...getDeadline("civilAppeal"), id: "noRolloverProbe", holidayRollover: false }],
    };

    // 같은 입력을 원래 항목(플래그 true)으로 계산하면 말일이 공휴일이라 밀린다.
    const rolled = computeDeadline({ id: "civilAppeal", startEventDate: "2026-02-16" }, deps);
    expect(rolled.expiryDate).toBe("2026-03-03");

    const result = computeDeadline(
      { id: "noRolloverProbe", startEventDate: "2026-02-16" },
      deps,
      dataset,
    );
    expect(result.period.rawExpiry).toBe("2026-03-02");
    expect(result.expiryDate).toBe("2026-03-02");
    expect(result.period.holidayExtension).toBe("off");
    expect(result.holidayRollover.status).toBe("off");
    expect(result.holidayRollover.reasonKo).toContain("밀리지 않는 항목");
  });
});
