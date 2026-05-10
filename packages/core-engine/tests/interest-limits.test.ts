import { describe, expect, it } from "vitest";

import {
  capHistoryFor,
  getCapAt,
  interestLimitsVersionTag,
  loadInterestLimits,
  type InterestLimitDataset,
} from "../src";

describe("loadInterestLimits 기본 데이터셋", () => {
  it("inline default 데이터셋을 검증 후 로드한다", () => {
    const ds = loadInterestLimits();
    expect(ds.version).toBe("1.0.0");
    expect(ds.slices).toHaveLength(4);
    expect(ds.slices.every((s) => s.law === "interestLimitAct")).toBe(true);
  });

  it("InterestLimitDataset 식별자 태그를 반환한다", () => {
    const ds = loadInterestLimits();
    expect(interestLimitsVersionTag(ds)).toBe("interest-limits/v1.0.0");
  });

  it("override 도 동일하게 검증한다", () => {
    const override: InterestLimitDataset = {
      version: "9.9.9-test",
      updatedAt: "2030-01-01",
      slices: [
        {
          law: "interestLimitAct",
          from: "2025-01-01",
          to: null,
          capRate: 0.18,
          source: "테스트",
        },
      ],
    };
    expect(loadInterestLimits(override).version).toBe("9.9.9-test");
  });

  it("음수 또는 0 capRate 를 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2020-01-01",
          to: null,
          capRate: 0,
          source: "테스트",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/capRate/);
  });

  it("capRate > 1 을 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2020-01-01",
          to: null,
          capRate: 1.5,
          source: "테스트",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/capRate/);
  });

  it("같은 law 의 slice 사이 gap 을 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2018-02-08",
          to: "2021-07-06",
          capRate: 0.24,
          source: "a",
        },
        {
          law: "interestLimitAct",
          from: "2021-07-08",
          to: null,
          capRate: 0.2,
          source: "b",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/gap|overlap/);
  });

  it("같은 law 의 slice 사이 overlap 을 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2018-02-08",
          to: "2021-07-10",
          capRate: 0.24,
          source: "a",
        },
        {
          law: "interestLimitAct",
          from: "2021-07-07",
          to: null,
          capRate: 0.2,
          source: "b",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/gap|overlap/);
  });

  it("같은 law 의 마지막이 아닌 slice 가 to=null 을 가지면 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2018-02-08",
          to: null,
          capRate: 0.24,
          source: "a",
        },
        {
          law: "interestLimitAct",
          from: "2021-07-07",
          to: null,
          capRate: 0.2,
          source: "b",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/last slice/);
  });

  it("to < from 을 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2021-07-07",
          to: "2020-01-01",
          capRate: 0.2,
          source: "a",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/to.*from/);
  });

  it("source 누락 시 거부한다", () => {
    const bad: InterestLimitDataset = {
      version: "x",
      updatedAt: "2026-05-10",
      slices: [
        {
          law: "interestLimitAct",
          from: "2021-07-07",
          to: null,
          capRate: 0.2,
          source: "  ",
        },
      ],
    };
    expect(() => loadInterestLimits(bad)).toThrow(/source/);
  });
});

describe("getCapAt (이자제한법 history)", () => {
  const ds = loadInterestLimits();

  it("2007-06-30 ~ 2014-07-14: 30%", () => {
    expect(getCapAt(ds, "interestLimitAct", "2007-06-30")).toBe(0.3);
    expect(getCapAt(ds, "interestLimitAct", "2014-07-14")).toBe(0.3);
  });

  it("2014-07-15 ~ 2018-02-07: 25%", () => {
    expect(getCapAt(ds, "interestLimitAct", "2014-07-15")).toBe(0.25);
    expect(getCapAt(ds, "interestLimitAct", "2018-02-07")).toBe(0.25);
  });

  it("2018-02-08 ~ 2021-07-06: 24%", () => {
    expect(getCapAt(ds, "interestLimitAct", "2018-02-08")).toBe(0.24);
    expect(getCapAt(ds, "interestLimitAct", "2021-07-06")).toBe(0.24);
  });

  it("2021-07-07 ~ 현재: 20%", () => {
    expect(getCapAt(ds, "interestLimitAct", "2021-07-07")).toBe(0.2);
    expect(getCapAt(ds, "interestLimitAct", "2026-05-10")).toBe(0.2);
  });

  it("2007-06-29 (이자제한법 부활 전날) 은 undefined", () => {
    expect(getCapAt(ds, "interestLimitAct", "2007-06-29")).toBeUndefined();
  });

  it("v1.0.0 미포함 law (대부업) 는 undefined (G3 후 v1.1+ 에서 추가)", () => {
    expect(getCapAt(ds, "loanBusinessRegistered", "2026-05-10")).toBeUndefined();
    expect(getCapAt(ds, "loanBusinessUnregistered", "2026-05-10")).toBeUndefined();
  });

  it("잘못된 ISO date 입력은 RangeError", () => {
    expect(() => getCapAt(ds, "interestLimitAct", "2026/05/10")).toThrow(/ISO date/);
  });
});

describe("capHistoryFor (오름차순 정렬)", () => {
  const ds = loadInterestLimits();

  it("이자제한법 history 4 slices, from 오름차순", () => {
    const h = capHistoryFor(ds, "interestLimitAct");
    expect(h).toEqual([
      { from: "2007-06-30", to: "2014-07-14", capRate: 0.3 },
      { from: "2014-07-15", to: "2018-02-07", capRate: 0.25 },
      { from: "2018-02-08", to: "2021-07-06", capRate: 0.24 },
      { from: "2021-07-07", to: null, capRate: 0.2 },
    ]);
  });

  it("미포함 law 는 빈 배열", () => {
    expect(capHistoryFor(ds, "loanBusinessRegistered")).toEqual([]);
  });
});
