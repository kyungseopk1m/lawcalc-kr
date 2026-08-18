// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { LitigationCostCalculator } from "./LitigationCostCalculator";

/**
 * 소송비용 탭의 DOM 렌더 테스트.
 *
 * 이 저장소에는 렌더 테스트가 없어서 "타입·엔진에는 있는데 화면에 배선되지 않은" 결함을
 * 단위 테스트가 잡지 못했다 (항고 인지액 UI 미배선, 초기화 누락, 조정 심급 제한). 그 공백을
 * 메우는 첫 그물이다. role·label 질의를 우선한다.
 */
afterEach(cleanup);

const caseValueInput = (): HTMLInputElement => screen.getByLabelText("소가");
const appealScopeInput = (): HTMLInputElement => screen.getByLabelText("항소·상고 불복 범위");
const basisSelect = (): HTMLSelectElement => screen.getByLabelText(/소가 산정 기준/);
const levelSelect = (): HTMLSelectElement => screen.getByLabelText(/심급/);
const caseTypeSelect = (): HTMLSelectElement => screen.getByLabelText(/사건구분/);

describe("소가 산정 기준 (인지규칙 제18조의2)", () => {
  it("간주 소가를 고르면 소가와 불복 범위가 모두 비활성이 된다", () => {
    render(<LitigationCostCalculator />);
    expect(caseValueInput().disabled).toBe(false);

    fireEvent.change(basisSelect(), { target: { value: "unascertainable" } });

    // 엔진이 소가를 통째로 대체하므로 둘 다 편집해도 결과가 바뀌지 않는다.
    expect(caseValueInput().disabled).toBe(true);
    expect(appealScopeInput().disabled).toBe(true);
    expect(screen.getByText(/제18조의2에 따라 소가를 간주/)).toBeTruthy();
  });

  it("Esc 초기화가 소가 산정 기준까지 되돌린다", () => {
    render(<LitigationCostCalculator />);
    fireEvent.change(basisSelect(), { target: { value: "unascertainable" } });
    expect(basisSelect().value).toBe("unascertainable");

    // 초기화는 입력 필드 밖에서 Esc. 되돌리지 않으면 기본 화면에서 230,000원이 계산된다.
    fireEvent.keyDown(window, { key: "Escape" });

    expect(basisSelect().value).toBe("amount");
    expect(caseValueInput().disabled).toBe(false);
  });
});

describe("사건구분에 따른 입력 노출", () => {
  it("민사조정은 심급을 고를 수 없다", () => {
    render(<LitigationCostCalculator />);
    expect(levelSelect().disabled).toBe(false);

    fireEvent.change(caseTypeSelect(), { target: { value: "civilMediation" } });

    // 조정신청에는 상소 수수료가 없다 (민사조정규칙 제3조).
    expect(levelSelect().disabled).toBe(true);
    expect(appealScopeInput().disabled).toBe(true);
  });

  it("항고 사건에서만 원신청서 인지액 입력이 나타난다", () => {
    render(<LitigationCostCalculator />);
    expect(screen.queryByLabelText(/원신청서 인지액/)).toBeNull();

    fireEvent.change(caseTypeSelect(), { target: { value: "civilInterlocutoryAppeal" } });

    // 엔진에만 있고 UI 에 배선되지 않아 제11조 제1항을 화면에서 계산할 수 없던 결함.
    expect(screen.getByLabelText(/원신청서 인지액/)).toBeTruthy();
  });
});
