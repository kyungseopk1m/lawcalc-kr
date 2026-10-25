import { describe, expect, it } from "vitest";

import { evaluateExpression, type CalculatorOptions } from "../src";

const R2: CalculatorOptions = { digits: 2, rounding: "round" };
const ev = (text: string, options: CalculatorOptions = R2) => evaluateExpression(text, options);

describe("evaluateExpression · 정확 계산", () => {
  it("VK 실측: 1,543.125 를 2자리 사사오입하면 1,543.13", () => {
    expect(ev("1,543.125")).toMatchObject({ value: "1543.13", display: "1,543.13" });
  });

  it("부동소수점이 틀리는 값: 66.665 → 66.67, 1.005 → 1.01, 0.1 + 0.2 = 0.3", () => {
    expect(ev("66.665").value).toBe("66.67");
    expect(ev("1.005").value).toBe("1.01");
    expect(ev("0.1 + 0.2", { digits: "full", rounding: "round" })).toMatchObject({
      value: "0.3",
      moreDigits: false,
    });
  });

  it("연산자 우선순위와 괄호 3종", () => {
    expect(ev("1 + 2 * 3", { digits: 0, rounding: "round" }).value).toBe("7");
    expect(ev("[1 + 2] * {3 - (4 / 2)}", { digits: 0, rounding: "round" }).value).toBe("3");
    expect(ev("2 * -3", { digits: 0, rounding: "round" }).value).toBe("-6");
    expect(ev("-(1 + 2) - -3", { digits: 0, rounding: "round" }).value).toBe("0");
  });

  it("x · X · × · ÷ · 전각 문자를 받는다", () => {
    expect(ev("3x4X2", { digits: 0, rounding: "round" }).value).toBe("24");
    expect(ev("10 × 3 ÷ 4").value).toBe("7.50");
    expect(ev("１２３＋（４＊５）", { digits: 0, rounding: "round" }).value).toBe("143");
    expect(ev("10 − 3", { digits: 0, rounding: "round" }).value).toBe("7");
  });

  it("숫자 안 쉼표와 토큰 사이의 한글 단위·공백은 무시한다", () => {
    expect(ev("1,000,000원 × 12개월 ÷ 365일", { digits: 0, rounding: "floor" })).toMatchObject({
      value: "32876",
      display: "32,876",
      normalizedExpr: "1000000 × 12 ÷ 365",
    });
  });

  // 뜻이 있는 기호를 버리면 100배 틀린 값이 나온다 ("12%" → 12). 오류로 막는다.
  it.each(["1,000,000 × 12% ÷ 365", "1000000*5%", "-1e-11", "2²", "\u0661+2", "3 # 4"])(
    "계산할 수 없는 문자는 오류: %s",
    (text) => {
      expect(() => ev(text)).toThrow(/계산할 수 없는 문자/);
    },
  );

  // 한글을 통째로 건너뛰면 "1억 × 0.05" 가 1 × 0.05 = 0 으로 계산됐다. 단위를 추측하지 않고 막는다.
  it.each(["1억 × 0.05", "3만원 + 2천원", "５백", "1조", "2십"])(
    "수 단위 글자는 오류: %s",
    (text) => {
      expect(() => ev(text, { digits: 0, rounding: "floor" })).toThrow(/수 단위 글자/);
    },
  );

  it("숫자와 떨어진 수 단위 글자(설명 낱말)는 건너뛴다", () => {
    expect(ev("조정비용 1000+200", { digits: 0, rounding: "floor" }).value).toBe("1200");
  });

  // "0x10" 이 0 × 10 = 0 으로 계산됐다. 16진 표기로 읽힐 수 있는 꼴만 막고 곱하기 x 는 남긴다.
  it.each(["0x10", "0X1F", "1 + 0x3", "０ｘ10"])("0x 꼴은 오류: %s", (text) => {
    expect(() => ev(text)).toThrow(/16진/);
  });

  it("0x 가 아닌 곱하기 x 는 그대로 받는다", () => {
    expect(ev("10x3", { digits: 0, rounding: "round" }).value).toBe("30");
    expect(ev("0 x 10", { digits: 0, rounding: "round" }).value).toBe("0");
    expect(ev("2.0x3", { digits: 0, rounding: "round" }).value).toBe("6");
  });

  it("옵션이 없으면 RangeError", () => {
    expect(() => evaluateExpression("1+1", undefined as never)).toThrow(RangeError);
  });

  it("normalizedExpr 는 괄호를 ( ) 로 모은다", () => {
    expect(ev("[1+2]x{3}").normalizedExpr).toBe("(1 + 2) × (3)");
  });

  it("큰 수도 정확하다", () => {
    expect(ev("123456789012345678 * 1000", { digits: 0, rounding: "round" }).display).toBe(
      "123,456,789,012,345,678,000",
    );
  });
});

describe("evaluateExpression · 끝수 처리", () => {
  it("자릿수 0~5", () => {
    const x = "2 / 3";
    expect(
      [0, 1, 2, 3, 4, 5].map((d) => ev(x, { digits: d as 0, rounding: "round" }).value),
    ).toEqual(["1", "0.7", "0.67", "0.667", "0.6667", "0.66667"]);
    expect(ev(x, { digits: 3, rounding: "floor" }).value).toBe("0.666");
    expect(ev(x, { digits: 3, rounding: "ceil" }).value).toBe("0.667");
  });

  it("자릿수를 채워 보여 준다", () => {
    expect(ev("5", { digits: 3, rounding: "round" }).display).toBe("5.000");
  });

  it("음수: floor/ceil 은 수학적 내림·올림, round 는 0 에서 먼 쪽", () => {
    expect(ev("-1.234", { digits: 2, rounding: "floor" }).value).toBe("-1.24");
    expect(ev("-1.234", { digits: 2, rounding: "ceil" }).value).toBe("-1.23");
    expect(ev("-1.235", R2).value).toBe("-1.24");
    expect(ev("-1.234", R2).value).toBe("-1.23");
    expect(ev("-0.004", R2).value).toBe("0.00");
  });

  it("full: 10자리까지 자르고 더 남으면 표시", () => {
    expect(ev("1/3", { digits: "full", rounding: "round" })).toMatchObject({
      value: "0.3333333333",
      moreDigits: true,
    });
    expect(ev("-2/3", { digits: "full", rounding: "floor" }).value).toBe("-0.6666666666");
    expect(ev("1234567 / 8", { digits: "full", rounding: "round" })).toMatchObject({
      display: "154,320.875",
      moreDigits: false,
    });
    expect(ev("100", { digits: "full", rounding: "round" }).value).toBe("100");
  });
});

describe("evaluateExpression · 오류", () => {
  it.each([
    ["(1 + 2", /닫히지/],
    ["1 + 2)", /여는 괄호/],
    ["(1 + 2]", /괄호 종류/],
    ["1 / 0", /0으로 나눌/],
    ["1 / (2 - 2)", /0으로 나눌/],
    ["", /식이 없습니다/],
    ["원", /식이 없습니다/],
    ["1 +", /연산자로 끝/],
    ["* 3", /연산자 앞/],
    ["2 (3)", /연산자가 없습니다/],
    ["1.2.3", /연산자가 없습니다/],
  ])("%s", (text, message) => {
    expect(() => ev(text)).toThrow(message);
  });

  it("옵션 검증", () => {
    expect(() => ev("1", { digits: 6 as 5, rounding: "round" })).toThrow(/digits/);
    expect(() => ev("1", { digits: 1, rounding: "half" as "round" })).toThrow(/rounding/);
  });
});
