import { describe, expect, it } from "vitest";

import type { InheritanceInput } from "@lawcalc-kr/core-engine";

import type { LcalcFile } from "../lib/ipc";
import { parseLoadedInheritanceLcalcInput, validateLcalcEnvelope } from "../lib/lcalc-validation";
import {
  buildInheritanceLcalcFile,
  computeInheritance,
  formatInheritanceForClipboard,
  inheritanceAmountTotal,
  inheritanceCapability,
  summarizeInheritanceResult,
  withEstate,
} from "./InheritanceCalculator";

const BASE: InheritanceInput = {
  decedent: { deceasedAt: "2026-01-10" },
  spouse: { name: "배우자", alive: true },
  linealDescendants: [
    { name: "장남", deceasedBeforeOpening: false },
    { name: "장녀", deceasedBeforeOpening: false },
  ],
};

function roundTrip(file: LcalcFile) {
  const serialized = JSON.parse(JSON.stringify(file)) as LcalcFile;
  validateLcalcEnvelope(serialized);
  return parseLoadedInheritanceLcalcInput(serialized);
}

describe("파일 열기 결과 대조 요약", () => {
  // 지분만 비교하면 금액이 바뀐 저장 결과도 "같다" 로 판정해 안내가 뜨지 않았다.
  it("지분이 같아도 상속인별 금액·끝수·상속재산이 다르면 요약이 달라진다", () => {
    const current = computeInheritance(withEstate(BASE, "100000000"));
    const same = summarizeInheritanceResult(current);
    expect(summarizeInheritanceResult(structuredClone(current))).toBe(same);

    const amount = structuredClone(current);
    amount.shares[0]!.amountWon = 1;
    expect(summarizeInheritanceResult(amount)).not.toBe(same);

    const remainder = structuredClone(current);
    remainder.remainderWon = 0;
    expect(summarizeInheritanceResult(remainder)).not.toBe(same);

    const estate = structuredClone(current);
    estate.estateWon = 1;
    expect(summarizeInheritanceResult(estate)).not.toBe(same);

    // 금액 없는 결과는 지분만으로 비교한다.
    expect(summarizeInheritanceResult(computeInheritance(BASE))).not.toContain("원");
  });
});

describe("상속재산 금액·전개식", () => {
  it("빈 입력은 키를 싣지 않고, 숫자는 원 단위 정수로 싣는다", () => {
    expect("estateWon" in withEstate(BASE, "")).toBe(false);
    expect(withEstate(BASE, "100,000,000").estateWon).toBe(100_000_000);
  });

  it("상속인별 금액 합 + 끝수 = 상속재산, 클립보드에 금액·합계·전개식이 실린다", () => {
    const result = computeInheritance(withEstate(BASE, "100000000"));
    expect(result.shares.map((s) => s.amountWon)).toEqual([42_857_142, 28_571_428, 28_571_428]);
    expect(result.remainderWon).toBe(2);
    expect(inheritanceAmountTotal(result)).toBe(100_000_000);

    const text = formatInheritanceForClipboard(result);
    expect(text).toContain("상속재산: 100,000,000원");
    expect(text).toContain("배우자\t3/7\t3/7\t42.86%\t42,857,142원");
    expect(text).toContain("합계 (금액 합 + 끝수): 100,000,000원");
    expect(text).toContain("전개식");
    expect(text).toContain("내림으로 남은 끝수 2원 (배정하지 않음)");
  });

  it("금액이 없어도 화면 계산은 전개식을 낸다", () => {
    const result = computeInheritance(BASE);
    expect(result.estateWon).toBeUndefined();
    expect(result.trace?.[0]).toBe("피상속인 사망일 2026-01-10: 상속개시 (민법 제997조)");
    expect(formatInheritanceForClipboard(result)).not.toContain("금액");
  });
});

describe("상속 .lcalc capability·왕복", () => {
  it("금액이 있을 때만 inheritance@3, 없으면 종전대로 @1/@2", () => {
    expect(inheritanceCapability(BASE)).toBe("inheritance@1");
    const renounced: InheritanceInput = {
      ...BASE,
      linealDescendants: [{ name: "장남", deceasedBeforeOpening: false, renounced: true }],
    };
    expect(inheritanceCapability(renounced)).toBe("inheritance@2");
    expect(inheritanceCapability(withEstate(renounced, "10"))).toBe("inheritance@3");
  });

  it("금액 있는 파일은 저장·열기 왕복에서 입력·금액·끝수·전개식이 살아남는다", () => {
    const input = withEstate(BASE, "100000000");
    const result = computeInheritance(input);
    const file = buildInheritanceLcalcFile(input, result, "");
    expect(file.envelopeFeatures).toEqual(["inheritance@3"]);
    // 저장 입력에는 화면 전용 includeTrace 를 싣지 않는다.
    expect("includeTrace" in (file.payload as { input: object }).input).toBe(false);

    const loaded = roundTrip(file);
    expect(loaded.input).toEqual(input);
    expect(loaded.result?.estateWon).toBe(100_000_000);
    expect(loaded.result?.remainderWon).toBe(2);
    expect(loaded.result?.shares.map((s) => s.amountWon)).toEqual([
      42_857_142, 28_571_428, 28_571_428,
    ]);
    expect(loaded.result?.trace).toEqual(result.trace);
  });

  it("금액 키가 없는 구파일(@1)은 금액 없이 그대로 열린다", () => {
    const old = buildInheritanceLcalcFile(BASE, computeInheritance(BASE), "");
    const payload = old.payload as { result: { trace?: string[] } };
    delete payload.result.trace;
    expect(old.envelopeFeatures).toEqual(["inheritance@1"]);

    const loaded = roundTrip(old);
    expect("estateWon" in loaded.input).toBe(false);
    expect(loaded.result?.estateWon).toBeUndefined();
    expect(loaded.result?.trace).toBeUndefined();
    expect(loaded.result?.shares[0]?.amountWon).toBeUndefined();
  });

  it("음수 상속재산은 열지 않는다", () => {
    const file = buildInheritanceLcalcFile(
      withEstate(BASE, "10"),
      computeInheritance(withEstate(BASE, "10")),
      "",
    );
    (file.payload as { input: { estateWon: number } }).input.estateWon = -1;
    expect(() => roundTrip(file)).toThrow(/estateWon/);
  });

  it.each([1.5, 1e21])("정수가 아니거나 안전 정수 범위 밖인 상속재산(%s)은 열지 않는다", (bad) => {
    const file = buildInheritanceLcalcFile(
      withEstate(BASE, "10"),
      computeInheritance(withEstate(BASE, "10")),
      "",
    );
    (file.payload as { input: { estateWon: number } }).input.estateWon = bad;
    expect(() => roundTrip(file)).toThrow(/0 이상 정수/);
  });
});
