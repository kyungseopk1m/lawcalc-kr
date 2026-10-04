// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type * as IpcModule from "../lib/ipc";

/**
 * 불변기한 탭의 DOM 렌더 테스트.
 *
 * 엔진이 돌려주는 값 중 화면 배선이 끊기면 조용히 사라지거나 잘못 뜨는 것들만 표적으로 본다.
 * 특히 근거 조문은 계열마다 다르다. 결과에 실린 `period.articles` / `period.formulaText` 는
 * 형사 항목에도 민법 조문을 적으므로, 그걸 근거로 뿌리면 형사 항소기간에 민법 제157조가 뜬다.
 */
const { savedFiles } = vi.hoisted(() => ({ savedFiles: [] as unknown[] }));

vi.mock("../lib/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof IpcModule>();
  return {
    ...actual,
    ipc: {
      saveLcalc: (file: unknown) => {
        savedFiles.push(JSON.parse(JSON.stringify(file)));
        return Promise.resolve("/tmp/deadline.lcalc");
      },
      loadLcalc: () => Promise.resolve(savedFiles.at(-1) ?? null),
      copyToClipboard: () => Promise.resolve(),
    },
  };
});

const { DeadlineCalculator } = await import("./DeadlineCalculator");

beforeEach(() => {
  savedFiles.length = 0;
});
afterEach(cleanup);

function pick(id: string, startEventDate: string) {
  fireEvent.change(screen.getByLabelText("기한 항목"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText(/기산 사건일/), { target: { value: startEventDate } });
}

function calculate() {
  fireEvent.click(screen.getByRole("button", { name: "계산" }));
}

describe("불변기한 계산 결과 노출", () => {
  it("만료일과 말일 조정 전 만료일이 화면에 나온다", () => {
    render(<DeadlineCalculator />);
    pick("civilAppeal", "2026-09-05");
    calculate();

    // 2026-09-19(토)가 말일이라 민법 제161조로 2026-09-21(월)까지 밀린다.
    expect(screen.getByTestId("deadline-expiry-date").textContent).toBe("2026-09-21");
    expect(screen.getByTestId("deadline-raw-expiry-date").textContent).toBe("2026-09-19");
    expect(screen.getByTestId("deadline-rollover-status").textContent).toContain("익일 근무일");
  });

  it("고른 항목의 기산 기준이 날짜 입력란 옆에 보인다", () => {
    render(<DeadlineCalculator />);
    expect(screen.getByTestId("deadline-start-event").textContent).toContain(
      "판결서를 송달받은 날",
    );

    // 민사 즉시항고는 송달일이 아니라 고지일 기산이다.
    fireEvent.change(screen.getByLabelText("기한 항목"), {
      target: { value: "civilImmediateAppeal" },
    });
    expect(screen.getByTestId("deadline-start-event").textContent).toContain("재판이 고지된 날");
  });

  it("커버리지 밖 만료일은 만료일을 내되 판정하지 못했다고 알린다", () => {
    render(<DeadlineCalculator />);
    pick("civilAppeal", "2027-12-25");
    calculate();

    expect(screen.getByTestId("deadline-expiry-date").textContent).toBe("2028-01-08");
    expect(screen.getByTestId("deadline-rollover-status").textContent).toContain(
      "판정하지 못했습니다",
    );
    expect(screen.getByTestId("deadline-rollover-reason").textContent).toContain(
      "확인하지 못했습니다",
    );
  });

  it("2008-03-22 이전 토요일 말일은 판정하지 못한 사유에 시행일을 밝힌다", () => {
    render(<DeadlineCalculator />);
    // 2008-03-01 + 2주 = 2008-03-15(토). 토요일 말일 연장 시행 전이다.
    pick("civilAppeal", "2008-03-01");
    calculate();

    expect(screen.getByTestId("deadline-expiry-date").textContent).toBe("2008-03-15");
    expect(screen.getByTestId("deadline-rollover-status").textContent).toContain(
      "2008-03-22 이전 토요일",
    );
    expect(screen.getByTestId("deadline-rollover-reason").textContent).toContain("2008-03-22");
  });
});

describe("계열별 근거 분리", () => {
  it("형사 항목의 근거는 형사소송법이고 민법 조문이 뜨지 않는다", () => {
    render(<DeadlineCalculator />);
    pick("criminalAppeal", "2026-09-05");
    calculate();

    const basis = screen.getByTestId("deadline-legal-basis");
    expect(basis.textContent).toContain("형사소송법");
    expect(basis.textContent).toContain("형사소송법 제66조 제3항");
    expect(basis.textContent).not.toContain("민법");
    expect(screen.getByTestId("deadline-source-article").textContent).toBe("제358조·제343조 제2항");
  });

  it("민사 항목의 근거는 민법 제161조와 민사소송법이다", () => {
    render(<DeadlineCalculator />);
    pick("civilAppeal", "2026-09-05");
    calculate();

    const basis = screen.getByTestId("deadline-legal-basis");
    expect(basis.textContent).toContain("민사소송법");
    expect(basis.textContent).toContain("민법 제161조");
    expect(basis.textContent).not.toContain("형사소송법");
  });
});

describe("불변기간 3값 표시", () => {
  it("불변기간이면 신축 불가와 추후보완을 함께 안내한다", () => {
    render(<DeadlineCalculator />);
    pick("civilAppeal", "2026-09-05");
    calculate();

    expect(screen.getByTestId("deadline-immutable-label").textContent).toBe("불변기간");
    const notice = screen.getByTestId("deadline-immutable-notice").textContent ?? "";
    expect(notice).toContain("늘이거나 줄일 수 없습니다");
    expect(notice).toContain("민사소송법 제173조");
  });

  it("unstated 항목을 불변기간 아님으로 단정하지 않는다", () => {
    render(<DeadlineCalculator />);
    pick("familyAppeal", "2026-09-05");
    calculate();

    expect(screen.getByTestId("deadline-immutable-label").textContent).toBe("법령에 표시 없음");
    const notice = screen.getByTestId("deadline-immutable-notice").textContent ?? "";
    expect(notice).toContain("판정하지 않았습니다");
    expect(notice).not.toContain("불변기간이 아닙니다");
  });
});

describe("정당한 사유 단서", () => {
  it("취소소송 1년에는 만료일을 단정하지 말라는 경고가 붙는다", () => {
    render(<DeadlineCalculator />);
    pick("revocationSuitOuterLimit", "2026-09-05");
    calculate();

    expect(screen.getByTestId("deadline-just-cause-warning").textContent).toContain("정당한 사유");
  });

  it("단서가 없는 항목에는 경고가 없다", () => {
    render(<DeadlineCalculator />);
    pick("civilAppeal", "2026-09-05");
    calculate();

    expect(screen.queryByTestId("deadline-just-cause-warning")).toBeNull();
  });
});

describe(".lcalc 왕복", () => {
  it("저장한 파일을 다시 열면 입력이 그대로 복원된다", async () => {
    render(<DeadlineCalculator />);
    pick("adminAppealForceMajeure", "2026-02-10");
    fireEvent.click(screen.getByLabelText(/국외에서 행정심판/));
    calculate();

    const expiry = screen.getByTestId("deadline-expiry-date").textContent;
    fireEvent.click(screen.getByRole("button", { name: ".lcalc 저장" }));
    await waitFor(() => expect(savedFiles).toHaveLength(1));

    // 입력을 흐트러뜨린 뒤 다시 연다.
    pick("criminalAppeal", "2020-01-01");

    fireEvent.click(screen.getByRole("button", { name: ".lcalc 열기" }));
    await waitFor(() =>
      expect(screen.getByLabelText("기한 항목")).toHaveProperty("value", "adminAppealForceMajeure"),
    );
    expect(screen.getByLabelText(/기산 사건일/)).toHaveProperty("value", "2026-02-10");
    expect(screen.getByLabelText(/국외에서 행정심판/)).toHaveProperty("checked", true);
    expect(screen.getByTestId("deadline-expiry-date").textContent).toBe(expiry);
  });
});

describe("데이터셋 안내", () => {
  it("두 데이터셋 버전과 담는 범위를 화면에 밝힌다", () => {
    render(<DeadlineCalculator />);
    const badge = screen.getByTestId("deadline-stale-badge");
    expect(badge.textContent).toContain("deadlines/v");
    expect(badge.textContent).toContain("holidays/v");
    expect(badge.textContent).toContain("2027-12-31");

    // 커버리지 밖 계열을 사용자가 목록에서 찾다 헤매지 않게 범위를 밝힌다.
    expect(screen.getByText(/특허·도산·헌법재판·과태료/)).toBeTruthy();
  });
});
