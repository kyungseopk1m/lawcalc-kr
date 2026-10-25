// @vitest-environment jsdom
import { computeCostAssessment, STANDARD_DISCLAIMER } from "@lawcalc-kr/core-engine";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildCostAssessmentInput,
  CostAssessmentPanel,
  formatCostAssessmentForClipboard,
} from "./litigation-cost-assessment";

afterEach(cleanup);

const field = (label: string): HTMLInputElement | HTMLSelectElement => screen.getByLabelText(label);

describe("소송비용확정 패널", () => {
  it("1심 입력으로 심급별 산정과 지급 관계를 보여 준다", () => {
    render(<CostAssessmentPanel />);
    expect(screen.getByRole("status").textContent).toContain("소가를 입력하세요");

    fireEvent.change(field("1번째 심급 접수일"), { target: { value: "2024-03-04" } });
    fireEvent.change(field("1번째 심급 소가"), { target: { value: "30000000" } });
    fireEvent.change(field("1번째 심급 원고 송달료 방식"), { target: { value: "manual" } });
    fireEvent.change(field("1번째 심급 원고 송달료"), { target: { value: "100000" } });

    // 인지 자동 140,000 + 송달료 100,000 + 2020판 표 D 2,800,000 = 3,040,000, 피고 전부 부담.
    expect(screen.getByTestId("cost-assessment-net").textContent).toBe(
      "피고가 원고에게 3,040,000원",
    );
    expect(screen.getAllByText("대법원규칙 제2936호").length).toBeGreaterThan(0);
    expect(screen.getByText(/현행 인지법 구간식/)).toBeTruthy();
  });

  it("항소심을 추가하고 지울 수 있다", () => {
    render(<CostAssessmentPanel />);
    fireEvent.click(screen.getByRole("button", { name: /항소심 추가/ }));
    expect(field("2번째 심급 심급").value).toBe("appeal");
    fireEvent.click(screen.getByRole("button", { name: "2번째 심급 삭제" }));
    expect(screen.queryByLabelText("2번째 심급 심급")).toBeNull();
  });
});

describe("입력 조립과 클립보드", () => {
  it("판 직접 지정·지급보수액을 엔진 입력으로 옮기고, 클립보드는 고지로 끝난다", () => {
    const input = buildCostAssessmentInput({
      instances: [
        {
          id: 1,
          level: "firstInstance",
          caseType: "civilFirstInstanceSingle",
          filingDate: "2007-06-01",
          caseValueText: "25,000,000",
          partyCountText: "2",
          version: "v2008",
          halfReason: "none",
          plaintiff: {
            stampMode: "manual",
            stampText: "100,000",
            deliveryMode: "none",
            deliveryText: "",
            lawyer: true,
            paidText: "1,000,000",
            otherText: "",
          },
          defendant: {
            stampMode: "none",
            stampText: "",
            deliveryMode: "none",
            deliveryText: "",
            lawyer: false,
            paidText: "",
            otherText: "",
          },
        },
      ],
      burdenPlaintiffText: "1",
      burdenDefendantText: "3",
      applicant: "plaintiff",
      opponentSubmitted: false,
    });
    if (typeof input === "string") throw new Error(input);
    expect(input.instances[0]).toMatchObject({
      ruleVersionOverride: "v2008",
      plaintiff: { paidLawyerFeeWon: 1_000_000, deliveryFee: { mode: "manual", amountWon: 0 } },
    });
    const result = computeCostAssessment(input);
    // 표 B 1,800,000 → 지급보수액 1,000,000 한도. (100,000 + 1,000,000) × 3/4 = 825,000.
    expect(result.net.amountWon).toBe(825_000);
    const text = formatCostAssessmentForClipboard(result);
    expect(text).toContain("직접 지정");
    expect(text.endsWith(STANDARD_DISCLAIMER)).toBe(true);
  });
});
