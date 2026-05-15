import { describe, expect, it } from "vitest";

import { formatWonInput, parseWonAmount, parseWonText } from "./format-won";

describe("formatWonInput", () => {
  it("빈 입력은 빈 문자열 반환", () => {
    expect(formatWonInput("")).toBe("");
  });

  it("0 은 콤마 없이 0 으로 표시", () => {
    expect(formatWonInput("0")).toBe("0");
  });

  it("천 단위 미만은 콤마 없이 표시", () => {
    expect(formatWonInput("1000")).toBe("1,000");
  });

  it("백만 단위는 콤마 표기", () => {
    expect(formatWonInput("1000000")).toBe("1,000,000");
  });

  it("이미 콤마가 포함된 입력은 재포맷", () => {
    expect(formatWonInput("1,000,000")).toBe("1,000,000");
  });

  it("잘못된 콤마 위치도 digit 만 추출해 재포맷", () => {
    expect(formatWonInput("1,00,00,00")).toBe("1,000,000");
  });

  it("음수 부호는 제거되어 양수처럼 처리", () => {
    expect(formatWonInput("-1000")).toBe("1,000");
  });

  it("소수점은 제거되어 정수 digit 만 합쳐 처리", () => {
    expect(formatWonInput("1000.5")).toBe("10,005");
  });

  it("한자/한글 등 비 digit 은 제거", () => {
    expect(formatWonInput("천만원")).toBe("");
    expect(formatWonInput("10만")).toBe("10");
  });

  it("영문은 제거", () => {
    expect(formatWonInput("100won")).toBe("100");
  });

  it("1조 이상 매우 큰 수도 콤마 표기", () => {
    expect(formatWonInput("1000000000000")).toBe("1,000,000,000,000");
  });

  it("앞에 0 이 붙은 입력은 Number 변환 후 leading-zero 제거", () => {
    expect(formatWonInput("00012345")).toBe("12,345");
  });

  it("양 끝 공백은 strip", () => {
    expect(formatWonInput("  1000  ")).toBe("1,000");
  });
});

describe("parseWonText", () => {
  it("빈 입력은 빈 문자열", () => {
    expect(parseWonText("")).toBe("");
  });

  it("콤마 strip", () => {
    expect(parseWonText("1,000,000")).toBe("1000000");
  });

  it("비 digit 은 제거", () => {
    expect(parseWonText("1,000원")).toBe("1000");
  });

  it("leading-zero 는 string 단계에서 유지 (Number 변환은 caller 책임)", () => {
    expect(parseWonText("00012")).toBe("00012");
  });
});

describe("parseWonAmount", () => {
  it("빈 입력은 fallback (기본 0) 반환", () => {
    expect(parseWonAmount("")).toBe(0);
    expect(parseWonAmount("", 999)).toBe(999);
  });

  it("정상 입력은 Number 변환", () => {
    expect(parseWonAmount("1,000,000")).toBe(1_000_000);
  });

  it("음수 부호 제거 후 양수로 변환", () => {
    expect(parseWonAmount("-500")).toBe(500);
  });

  it("leading-zero 는 Number 변환 시 제거", () => {
    expect(parseWonAmount("00012345")).toBe(12345);
  });
});
