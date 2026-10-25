// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type * as IpcModule from "../lib/ipc";

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

const { PostalCodeView } = await import("./PostalCodeView");

afterEach(() => {
  cleanup();
  copied.length = 0;
});

function search(q: string) {
  render(<PostalCodeView />);
  fireEvent.change(screen.getByLabelText("지역 또는 우편번호"), { target: { value: q } });
}

describe("우편번호 찾기", () => {
  it("스냅샷 날짜와 읍면동 요약 안내를 늘 보인다", () => {
    render(<PostalCodeView />);
    expect(screen.getByTestId("postal-snapshot").textContent).toContain("2026-10-08");
    expect(screen.getByText(/건물 단위가 아닌 읍면동 요약/)).toBeTruthy();
  });

  it("이름으로 찾아 고르면 번호를 보이고 복사한다", async () => {
    search("강남구 역삼동");
    expect(screen.getByTestId("postal-count").textContent).toBe("1곳");
    fireEvent.click(screen.getByRole("button", { name: /서울특별시 강남구 역삼동/ }));
    expect(screen.getByTestId("postal-codes").textContent).toBe("06120, 06123~06152, 06210~06257");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toContain("우편번호: 06120, 06123~06152, 06210~06257");
    expect(copied[0]).toContain("건물 단위가 아닌 읍면동 요약");
    expect(copied[0]!.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("우편번호로 역조회하고 관할법원을 본다", () => {
    search("06236");
    fireEvent.click(screen.getByRole("button", { name: /서울특별시 강남구 역삼동/ }));
    fireEvent.click(screen.getByRole("button", { name: /관할법원 보기/ }));
    expect(screen.getByTestId("postal-court").textContent).toContain("서울중앙지방법원");
  });

  it("없는 지역", () => {
    search("없는동네이름");
    expect(screen.getByTestId("postal-count").textContent).toBe("찾은 지역이 없습니다");
  });
});
