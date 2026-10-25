// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { ReferenceTablesView } from "./ReferenceTablesView";

afterEach(cleanup);

describe("여명표·노임표 보기", () => {
  it("두 표와 메타데이터, 경과 배지가 나온다", () => {
    render(<ReferenceTablesView />);
    expect(within(screen.getByTestId("life-table")).getAllByRole("row").length).toBeGreaterThan(10);
    expect(within(screen.getByTestId("labor-table")).getAllByRole("row").length).toBeGreaterThan(1);
    expect(screen.getByTestId("reference-life-stale-badge")).toBeTruthy();
    expect(screen.getByTestId("reference-labor-stale-badge")).toBeTruthy();
    expect(screen.getAllByText("출처 URL")).toHaveLength(2);
  });

  it("경과 배지는 두 표 모두 회색 안내이고, 여명표에 시중노임 문구가 붙지 않는다", () => {
    render(<ReferenceTablesView />);
    const life = screen.getByTestId("reference-life-stale-badge");
    const labor = screen.getByTestId("reference-labor-stale-badge");
    expect(life.dataset.tone).toBe("info");
    expect(labor.dataset.tone).toBe("info");
    expect(life.textContent).not.toContain("시중노임");
    expect(life.textContent).toContain("경과");
  });

  it("나이 검색은 행을 줄인다", () => {
    render(<ReferenceTablesView />);
    const before = within(screen.getByTestId("life-table")).getAllByRole("row").length;
    fireEvent.change(screen.getByLabelText(/나이 검색/), { target: { value: "30" } });
    const after = within(screen.getByTestId("life-table")).getAllByRole("row").length;
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(1);
  });

  it("직종 검색은 일치하지 않으면 헤더만 남긴다", () => {
    render(<ReferenceTablesView />);
    fireEvent.change(screen.getByLabelText(/직종명 검색/), { target: { value: "없는직종zzz" } });
    expect(within(screen.getByTestId("labor-table")).getAllByRole("row")).toHaveLength(1);
  });
});
