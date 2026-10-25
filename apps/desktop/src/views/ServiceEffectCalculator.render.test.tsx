// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";

import type * as IpcModule from "../lib/ipc";

/** 대조값은 외부 계산기 실측. */
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

const { ServiceEffectCalculator } = await import("./ServiceEffectCalculator");

afterEach(() => {
  cleanup();
  copied.length = 0;
});

function setup(choice: string, serviceDate: string) {
  render(<ServiceEffectCalculator />);
  fireEvent.change(screen.getByLabelText("구하는 날"), { target: { value: choice } });
  fireEvent.change(screen.getByLabelText(/송달일/), { target: { value: serviceDate } });
}

const cell = (date: string) => screen.getByTestId(`service-effect-cell-${date}`).textContent;

describe("송달 효력·상소기간 (실측 대조)", () => {
  it("상소기간 14일: 9.5(토) 송달은 9.19(토) 말일이 밀려 9.21", () => {
    setup("appeal14", "2026-09-05");
    expect(screen.getByTestId("service-effect-date").textContent).toBe("2026-09-21");
    expect(screen.getByTestId("service-effect-extension").textContent).toContain("밀림");
    expect(screen.getByTestId("service-effect-reason").textContent).toContain("제161조");
  });

  it("효력발생일 14일째 기준 달력: 9.1 → 9.16, 9.10 → [9.29], 9.26 → [10.13]", () => {
    setup("public14", "2026-09-05");
    expect(cell("2026-09-01")).toBe("19.16");
    expect(cell("2026-09-10")).toBe("10[9.29]");
    expect(cell("2026-09-26")).toBe("26[10.13]");
  });

  it("15일째 기준: 9.4 → [9.21], 표기 방식 고지를 단다", () => {
    setup("public15", "2026-09-04");
    expect(screen.getByTestId("service-effect-date").textContent).toBe("2026-09-21");
    expect(screen.getByTestId("service-effect-reason").textContent).toContain("표기 방식");
  });

  it("2008-03-22 계속 사건: 9.5 송달 14일은 토요일 9.19 그대로", () => {
    setup("appeal14", "2026-09-05");
    fireEvent.click(screen.getByLabelText(/2008-03-22 당시/));
    expect(screen.getByTestId("service-effect-date").textContent).toBe("2026-09-19");
  });

  it("복사 문구는 결과일을 담고 면책 문구로 끝난다", async () => {
    setup("final7", "2026-09-01");
    expect(screen.getByTestId("service-effect-date").textContent).toBe("2026-09-09");
    fireEvent.click(screen.getByRole("button", { name: "복사" }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect(copied[0]).toContain("재판 확정일: 2026-09-09");
    expect(copied[0]).toContain("민사소송법 제498조");
    expect(copied[0]!.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });

  it("날짜를 지우면 결과 대신 오류를 낸다", () => {
    setup("appeal14", "");
    expect(screen.getByRole("alert").textContent).toContain("serviceDate");
    expect(screen.queryByTestId("service-effect-date")).toBeNull();
  });
});
