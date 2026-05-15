import { describe, expect, it } from "vitest";

import { appendPillToken, parsePillTokens, removePillTokenAt } from "./ProportionalPillInput";

describe("parsePillTokens", () => {
  it("빈 입력은 빈 배열", () => {
    expect(parsePillTokens("")).toEqual([]);
  });

  it("slash separator 분리 + raw digit 추출", () => {
    expect(parsePillTokens("1000000 / 2000000")).toEqual(["1000000", "2000000"]);
  });

  it("콤마 포맷 토큰도 raw digit 으로 정규화", () => {
    expect(parsePillTokens("1,000,000 / 2,000,000")).toEqual(["1000000", "2000000"]);
  });

  it("콤마+공백 separator (legacy placeholder) 호환", () => {
    expect(parsePillTokens("1000000, 2000000")).toEqual(["1000000", "2000000"]);
  });

  it("빈 fragment 와 0 토큰은 제거", () => {
    expect(parsePillTokens("0 / 100 / / 0")).toEqual(["100"]);
  });

  it("개행/탭 separator 도 분리", () => {
    expect(parsePillTokens("100\n200\t300")).toEqual(["100", "200", "300"]);
  });
});

describe("appendPillToken", () => {
  it("빈 text 에 토큰 추가", () => {
    expect(appendPillToken("", "1000000")).toBe("1000000");
  });

  it("기존 토큰 뒤에 slash separator 로 추가", () => {
    expect(appendPillToken("1000000", "2000000")).toBe("1000000 / 2000000");
  });

  it("빈/0 pending 은 무시 (state 변동 0)", () => {
    expect(appendPillToken("1000000", "")).toBe("1000000");
    expect(appendPillToken("1000000", "0")).toBe("1000000");
  });

  it("pending 의 콤마는 strip 후 append", () => {
    expect(appendPillToken("1000000", "2,000,000")).toBe("1000000 / 2000000");
  });

  it("비 digit pending 은 거부", () => {
    expect(appendPillToken("1000000", "abc")).toBe("1000000");
  });
});

describe("removePillTokenAt", () => {
  it("지정 index 토큰 제거", () => {
    expect(removePillTokenAt("1000000 / 2000000 / 3000000", 1)).toBe("1000000 / 3000000");
  });

  it("범위 밖 index 는 무시", () => {
    expect(removePillTokenAt("1000000", 5)).toBe("1000000");
  });

  it("마지막 토큰 제거 시 빈 문자열", () => {
    expect(removePillTokenAt("1000000", 0)).toBe("");
  });
});
