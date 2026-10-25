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

const { CourtJurisdictionView } = await import("./CourtJurisdictionView");

afterEach(() => {
  cleanup();
  copied.length = 0;
});

function pick(date: string, province: string, unit: string) {
  render(<CourtJurisdictionView />);
  fireEvent.change(screen.getByLabelText("기준일"), { target: { value: date } });
  fireEvent.change(screen.getByLabelText("시·도"), { target: { value: province } });
  fireEvent.change(screen.getByLabelText("시·군·구"), { target: { value: unit } });
}

const text = (id: string) => screen.getByTestId(id).textContent;

describe("관할법원 찾기", () => {
  it("시·도 + 시·군·구로 지방법원·지원·시·군법원을 낸다", async () => {
    pick("2026-10-25", "경기도", "하남시");
    expect(text("jurisdiction-highCourt")).toBe("수원고등법원");
    expect(text("jurisdiction-branch")).toBe("수원지방법원 성남지원");
    expect(text("jurisdiction-municipalCourt")).toBe("수원지방법원 광주시법원");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toContain("지원: 수원지방법원 성남지원");
    expect(copied[0]!.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("시행 예정 변경을 함께 알린다 (김해시 2032-03-01)", () => {
    pick("2026-10-25", "경상남도", "김해시");
    expect(text("jurisdiction-branch")).toBe("없음 (본원 관할)");
    expect(text("jurisdiction-upcoming")).toContain("2032-03-01");
    expect(text("jurisdiction-upcoming")).toContain("창원지방법원 김해지원");
  });

  it("기준일을 옮기면 그 날 시행 판으로 찾는다", () => {
    pick("2028-03-01", "경기도", "부천시");
    expect(text("jurisdiction-highCourt")).toBe("인천고등법원");
  });

  it("기준일을 비우면 한국어 오류", () => {
    render(<CourtJurisdictionView />);
    fireEvent.change(screen.getByLabelText("기준일"), { target: { value: "" } });
    expect(screen.getByRole("alert").textContent).toBe("기준일을 입력하세요.");
  });

  it("새 판에 없는 칸이 되면 결과를 지우고 알린다 (인천 전체 → 2028-03-01)", () => {
    pick("2026-10-25", "인천광역시", "전체");
    expect(text("jurisdiction-highCourt")).toBe("서울고등법원");
    fireEvent.change(screen.getByLabelText("기준일"), { target: { value: "2028-03-01" } });
    expect(screen.queryByTestId("jurisdiction-highCourt")).toBeNull();
    expect(text("jurisdiction-missing-unit")).toContain('"인천광역시 전체" 칸이 없습니다');
    expect(screen.getByTestId("jurisdiction-missing-unit").dataset.tone).toBe("warn");
    fireEvent.change(screen.getByLabelText("시·군·구"), { target: { value: "영종구" } });
    expect(screen.queryByTestId("jurisdiction-missing-unit")).toBeNull();
  });

  it("첫 판보다 이른 기준일은 오류", () => {
    render(<CourtJurisdictionView />);
    fireEvent.change(screen.getByLabelText("기준일"), { target: { value: "2020-01-01" } });
    expect(screen.getByRole("alert").textContent).toContain("2026-03-17");
  });
});
