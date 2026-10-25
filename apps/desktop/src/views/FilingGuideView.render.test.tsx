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

const { CivilFilingGuide, CriminalFilingGuide } = await import("./FilingGuideView");

afterEach(() => {
  cleanup();
  copied.length = 0;
});

const rowsOf = (kind: string) =>
  screen.getByTestId(`filing-table-${kind}`).querySelectorAll("tbody tr").length;

describe("민사서류 안내", () => {
  it("검색하면 부분 일치 행만 남고, 고르면 인지액과 전자소송 안내를 보여 준다", async () => {
    render(<CivilFilingGuide />);
    expect(rowsOf("civil")).toBe(362);
    fireEvent.change(screen.getByLabelText("서류 이름·조문 검색"), {
      target: { value: "관할법원지정" },
    });
    expect(rowsOf("civil")).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "관할법원지정신청서" }));
    expect(screen.getByTestId("filing-stamp").textContent).toBe("1,000원");
    expect(screen.getByTestId("filing-efiling").textContent).toContain("10분의 9");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toContain("인지액: 1,000원");
    expect(copied[0]).toContain("재판예규 제1916호");
    expect(copied[0]!.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("가운뎃점 없이 검색해도 열람·복사 서류를 찾는다", () => {
    render(<CivilFilingGuide />);
    fireEvent.change(screen.getByLabelText("서류 이름·조문 검색"), {
      target: { value: "열람복사" },
    });
    expect(rowsOf("civil")).toBe(4);
  });

  it("차감이 붙은 소제기신청서는 소송비용 탭 계산을 권하지 않는다", () => {
    render(<CivilFilingGuide />);
    fireEvent.change(screen.getByLabelText("서류 이름·조문 검색"), {
      target: { value: "소제기신청서" },
    });
    fireEvent.click(screen.getByRole("button", { name: "소제기신청서" }));
    expect(screen.getByTestId("filing-stamp").textContent).toContain("지급명령신청서에 붙힌");
    expect(screen.getByTestId("filing-efiling").textContent).not.toContain("소송비용 탭");
    cleanup();
    render(<CivilFilingGuide />);
    fireEvent.change(screen.getByLabelText("서류 이름·조문 검색"), { target: { value: "소장" } });
    fireEvent.click(screen.getByRole("button", { name: "소장" }));
    expect(screen.getByTestId("filing-efiling").textContent).toContain("소송비용 탭");
  });

  it("인지가 없는 서류에는 전자소송 안내를 붙이지 않는다", () => {
    render(<CivilFilingGuide />);
    fireEvent.change(screen.getByLabelText("서류 이름·조문 검색"), {
      target: { value: "관할합의서" },
    });
    fireEvent.click(screen.getByRole("button", { name: "관할합의서" }));
    expect(screen.getByTestId("filing-stamp").textContent).toBe("붙일 인지 없음");
    expect(screen.queryByTestId("filing-efiling")).toBeNull();
  });
});

describe("형사서류 안내", () => {
  it("인지액 열 없이 같은 화면, 보석 검색", () => {
    render(<CriminalFilingGuide />);
    expect(rowsOf("criminal")).toBe(148);
    fireEvent.change(screen.getByLabelText("서류 이름·조문 검색"), { target: { value: "보석" } });
    expect(rowsOf("criminal")).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "보석청구서" }));
    expect(screen.queryByTestId("filing-stamp")).toBeNull();
    expect(screen.getByText(STANDARD_DISCLAIMER)).toBeTruthy();
  });
});
