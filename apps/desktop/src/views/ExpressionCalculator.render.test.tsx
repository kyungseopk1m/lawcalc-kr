// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type * as IpcModule from "../lib/ipc";

/** 대조값은 for-claude `personal/lawcalc-kr/docs/data/vk-run-2026-10-20/session-dates.md` 5절 실측. */
const { copied } = vi.hoisted(() => ({ copied: [] as string[] }));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof IpcModule>();
  return {
    ...actual,
    ipc: {
      copyToClipboard: (text: string) => {
        copied.push(text);
        return Promise.resolve();
      },
    },
  };
});

const { ExpressionCalculator } = await import("./ExpressionCalculator");

afterEach(() => {
  cleanup();
  copied.length = 0;
});

function calc(expr: string, digits: string, rounding: string) {
  fireEvent.change(screen.getByLabelText("계산식"), { target: { value: expr } });
  fireEvent.change(screen.getByLabelText("자릿수"), { target: { value: digits } });
  fireEvent.change(screen.getByLabelText("끝수 처리"), { target: { value: rounding } });
  return screen.getByTestId("calculator-value").textContent;
}

describe("계산기 (실측 대조)", () => {
  it.each([
    ["12345/8", "0", "ceil", "1,544"],
    ["12345/8", "2", "round", "1,543.13"],
    ["200/3", "0", "floor", "66"],
    ["200/3", "4", "round", "66.6667"],
    ["1000×1.15/7", "1", "round", "164.3"],
    ["1000×1.15/7", "4", "ceil", "164.2858"],
  ])("%s · %s자리 · %s → %s", (expr, digits, rounding, expected) => {
    render(<ExpressionCalculator />);
    expect(calc(expr, digits, rounding)).toBe(expected);
  });

  it("자릿수를 바꾸면 답이 바로 다시 나온다", () => {
    render(<ExpressionCalculator />);
    calc("200/3", "2", "floor");
    fireEvent.change(screen.getByLabelText("자릿수"), { target: { value: "1" } });
    expect(screen.getByTestId("calculator-value").textContent).toBe("66.6");
  });

  it("0 으로 나누면 오류를 낸다", () => {
    render(<ExpressionCalculator />);
    fireEvent.change(screen.getByLabelText("계산식"), { target: { value: "1/0" } });
    expect(screen.getByRole("alert").textContent).toContain("0 으로 나눌 수 없습니다");
  });

  it("복사 문구는 식과 답을 담고 면책 문구로 끝난다", async () => {
    render(<ExpressionCalculator />);
    calc("1,000x1.15/7", "2", "round");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toContain("계산식: 1000 × 1.15 ÷ 7");
    expect(copied[0]).toContain("답: 164.29");
    expect(copied[0]!.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });
});
