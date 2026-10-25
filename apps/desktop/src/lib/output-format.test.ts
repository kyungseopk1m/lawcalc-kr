// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn<(cmd: string, args?: unknown) => Promise<null>>(() => Promise.resolve(null));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invoke(cmd, args),
}));

import { ipc } from "./ipc";
import {
  applyDateStyle,
  applyDateStyleDeep,
  clipboardTextToHtml,
  formatCourtDateWithWeekday,
  readDateStyle,
  writeDateStyle,
} from "./output-format";

beforeEach(() => {
  window.localStorage.clear();
  invoke.mockClear();
});

describe("법원식 날짜 표기", () => {
  it("요일을 붙여 법원 표기로 바꾼다", () => {
    expect(formatCourtDateWithWeekday("2026-10-25")).toBe("2026. 10. 25.(일)");
    expect(formatCourtDateWithWeekday("2024-02-29")).toBe("2024. 2. 29.(목)");
    expect(formatCourtDateWithWeekday("2025-02-29")).toBeNull();
  });

  it("기본 iso 는 입력을 그대로 둔다", () => {
    const text = "기간\t2024-01-01~2024-12-31";
    expect(readDateStyle()).toBe("iso");
    expect(applyDateStyle(text, "iso")).toBe(text);
  });

  it("독립된 날짜만 바꾸고 시각·버전 식별자는 그대로 둔다", () => {
    expect(
      applyDateStyle(
        "2024-01-01~2024-12-31, 2026-01-05부터. 시각 2026-10-25T09:00:00Z v2024-01-01 2025-13-01",
        "court",
      ),
    ).toBe(
      "2024. 1. 1.(월)~2024. 12. 31.(화), 2026. 1. 5.(월)부터. 시각 2026-10-25T09:00:00Z v2024-01-01 2025-13-01",
    );
  });

  it("view 의 문자열에 적용하되 버전·계산 시각 필드는 그대로 둔다", () => {
    const view = {
      segments: [{ from: "2024-01-01", days: 3 }],
      lines: ["2024-03-01부터"],
      dataVersion: "2024-01-01",
      computedAt: "2026-10-25",
    };
    expect(applyDateStyleDeep(view, "iso")).toBe(view);
    expect(applyDateStyleDeep(view, "court")).toEqual({
      segments: [{ from: "2024. 1. 1.(월)", days: 3 }],
      lines: ["2024. 3. 1.(금)부터"],
      dataVersion: "2024-01-01",
      computedAt: "2026-10-25",
    });
  });
});

describe("HTML 표 클립보드", () => {
  it("탭 줄은 표, 나머지는 문단으로 바꾸고 이스케이프한다", () => {
    expect(clipboardTextToHtml("제목 <A&B>\n\n기간\t금액\n1\t=1원\n끝")).toBe(
      '<p>제목 &lt;A&amp;B&gt;</p><br><table border="1" cellspacing="0" cellpadding="4">' +
        "<tr><th>기간</th><th>금액</th></tr><tr><td>1</td><td>=1원</td></tr></table><p>끝</p>",
    );
  });

  it("일반 텍스트는 바이트 그대로 싣고 HTML 판을 함께 보낸다", async () => {
    const text = "LawCalc\n기간\t이자\n2024-01-01~2024-12-31\t1,000원\n면책";
    await ipc.copyToClipboard(text);
    expect(invoke).toHaveBeenCalledWith("copy_to_clipboard", {
      text,
      html: clipboardTextToHtml(text),
    });
  });

  it("법원식 설정이면 일반 텍스트·HTML·내보내기 view 모두 같은 표기다", async () => {
    writeDateStyle("court");
    await ipc.copyToClipboard("2026-10-25");
    expect(invoke).toHaveBeenLastCalledWith("copy_to_clipboard", {
      text: "2026. 10. 25.(일)",
      html: "<p>2026. 10. 25.(일)</p>",
    });
    await ipc.exportHwpx("appropriation", { rows: [["2026-10-25"]], computedAt: "2026-10-25" });
    expect(invoke).toHaveBeenLastCalledWith("export_hwpx", {
      kind: "appropriation",
      result: { rows: [["2026. 10. 25.(일)"]], computedAt: "2026-10-25" },
    });
  });
});

describe("인쇄 CSS", () => {
  it("@media print 가 탭·입력 열·버튼을 숨긴다", () => {
    // vitest 는 CSS import 를 비우므로 파일을 직접 읽는다 (cwd = apps/desktop).
    const css = readFileSync("src/styles/globals.css", "utf-8");
    const print = css.slice(css.indexOf("@media print"));
    expect(print).not.toBe(css);
    for (const selector of ["nav", "header", "button", "input", '[role="tablist"]']) {
      expect(print).toContain(selector);
    }
    expect(print).toContain('main.grid[class*="grid-cols-[580px"] > :first-child');
  });
});
