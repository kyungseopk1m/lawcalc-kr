// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type * as IpcModule from "../lib/ipc";

/** 대조값은 for-claude `personal/lawcalc-kr/docs/data/vk-run-2026-10-20/session-dates.md` 3절 실측 (기준일 2026.09.14). */
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

const { DetentionCalculator } = await import("./DetentionCalculator");

afterEach(() => {
  cleanup();
  copied.length = 0;
});

function setup(basis: string, startDate: string) {
  render(<DetentionCalculator />);
  fireEvent.change(screen.getByLabelText("기준"), { target: { value: basis } });
  fireEvent.change(screen.getByLabelText(/구금 시작일/), { target: { value: startDate } });
  fireEvent.change(screen.getByLabelText(/기준일/), { target: { value: "2026-09-14" } });
}

const cell = (date: string) => screen.getByTestId(`detention-cell-${date}`).textContent;

describe("미결구금일수 (실측 대조)", () => {
  it("선고일 기준: 7.1 시작 75일, 표 8.1 44 · 9.13 1 · 9.14 0", () => {
    setup("sentencing", "2026-07-01");
    expect(screen.getByTestId("detention-days").textContent).toBe("75일");
    expect(cell("2026-08-01")).toBe("144");
    expect(cell("2026-09-13")).toBe("131");
    expect(cell("2026-09-14")).toBe("140");
  });

  it("석방일 기준: 7.1 시작 76일, 9.1 14", () => {
    setup("release", "2026-07-01");
    expect(screen.getByTestId("detention-days").textContent).toBe("76일");
    expect(cell("2026-09-01")).toBe("114");
  });

  it("기준일이 시작일보다 이르면 오류", () => {
    setup("sentencing", "2026-10-01");
    expect(screen.getByRole("alert").textContent).toContain("구금 시작일");
  });

  it("복사 문구는 일수를 담고 면책 문구로 끝난다", async () => {
    setup("sentencing", "2026-09-01");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toContain("미결구금일수: 13일");
    expect(copied[0]).toContain("형법 제57조");
    expect(copied[0]!.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });
});
