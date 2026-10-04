import { describe, expect, it } from "vitest";

import { parseNumberText, parseRatioText, readNumber } from "./parse-number";

describe("parseRatioText (0~1 비율 칸)", () => {
  it.each([
    ["", undefined],
    ["0.3", 0.3],
    ["30%", 0.3],
    [" 30 % ", 0.3],
    ["0", 0],
    ["1", 1],
    ["100%", 1],
    ["33.33%", 0.3333],
  ])("%j → %j", (text, expected) => {
    const parsed = parseRatioText(text);
    expect(parsed.error).toBeUndefined();
    if (expected === undefined) expect(parsed.value).toBeUndefined();
    else expect(parsed.value).toBeCloseTo(expected, 10);
  });

  it.each(["30", "50", "120%", "-0.1", "삼십", "1/3", "0.3.1", "1e-1"])(
    "%j 는 기본값으로 바꾸지 않고 오류",
    (text) => {
      const parsed = parseRatioText(text);
      expect(parsed.value).toBeUndefined();
      expect(parsed.error).toBeTruthy();
    },
  );

  it('% 없는 "30" 은 퍼센트 표기를 안내한다', () => {
    expect(parseRatioText("30").error).toContain("30%");
  });
});

describe("parseNumberText (인원·일수 칸)", () => {
  it("라벨 단위와 쉼표를 떼고 읽는다", () => {
    expect(parseNumberText("10명", { unit: "명", integer: true, min: 1 }).value).toBe(10);
    expect(parseNumberText("1,000", { integer: true }).value).toBe(1000);
    expect(parseNumberText("30.42일", { unit: "일", min: 1, max: 31 }).value).toBe(30.42);
  });

  it("빈칸은 미입력이다", () => {
    expect(parseNumberText("  ", { unit: "명" })).toEqual({});
  });

  it("다른 단위·정수 위반·범위 밖은 오류", () => {
    expect(parseNumberText("10개", { unit: "명" }).error).toBeTruthy();
    expect(parseNumberText("명", { unit: "명" }).error).toBeTruthy();
    expect(parseNumberText("1.5", { integer: true }).error).toBe("정수로 입력하세요.");
    expect(parseNumberText("0", { unit: "명", integer: true, min: 1 }).error).toBe(
      "1명 이상이어야 합니다.",
    );
    expect(parseNumberText("32", { unit: "일", min: 1, max: 31 }).error).toBe(
      "1~31일 사이여야 합니다.",
    );
  });

  it('"1억 2천만" 처럼 한글 수 단위가 섞이면 오류 (조용히 12 가 되지 않는다)', () => {
    expect(parseNumberText("1억 2천만").error).toBeTruthy();
  });
});

describe("readNumber", () => {
  it("오류면 한국어 라벨을 붙여 던진다", () => {
    expect(() => readNumber("과실비율", parseRatioText("abc"))).toThrow(/^과실비율: /);
  });
});
